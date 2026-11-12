<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\persistence;

use humhub\modules\matcherChat\adapters\native\{NativeProjection, NativeSendEligibility};
use humhub\modules\matcherChat\domain\{AccessGrant, ChatException, Conversation, Message, SafeInteger, Sender};
use humhub\modules\matcherChat\domain\ports\{AccessReader, ConsistencyBoundary, ReadRepository};

final class SqlReadStore implements AccessReader, ReadRepository, ConsistencyBoundary
{
    private bool $active = false;
    private int $currentRevision = 0;
    private array $states = [];
    private array $sendFacts = [];

    public function __construct(private readonly SqlState $sql, private readonly int $viewerId, private readonly ?NativeSendEligibility $sending = null)
    {
        SafeInteger::positive($viewerId, 'viewer_id');
    }

    public function run(callable $operation): mixed
    {
        if ($this->active) { throw new ChatException('CHAT_TRANSACTION_CONFLICT', 'Nested chat operations are unsupported.', 503); }
        $failure = null;
        try {
            $result = $this->sql->transaction(function () use ($operation, &$failure): mixed {
                $this->active = true;
                $this->prepare();
                // Authorization observation is durable even if an old cursor/read position fails.
                // Only the requested read-state mutation is rolled back to this savepoint.
                $unit = $this->sql->db->beginTransaction();
                try { $result = $operation(); $unit->commit(); return $result; }
                catch (ChatException $error) { $unit->rollBack(); $failure = $error; return null; }
            });
        } finally { $this->active = false; $this->states = []; $this->sendFacts = []; $this->currentRevision = 0; }
        if ($failure !== null) { throw $failure; }
        return $result;
    }

    private function prepare(): void
    {
        $actor = $this->sql->one('SELECT id,status FROM {{%user}} WHERE id=:viewer FOR UPDATE', [':viewer' => $this->viewerId]);
        if ($actor === null || (int)$actor['status'] !== 1) { throw new ChatException('ACCOUNT_UNAVAILABLE', 'The account is unavailable.', 403); }
        $rows = $this->sql->all('SELECT c.* FROM {{%matcher_chat_conversation}} c INNER JOIN {{%matcher_chat_member}} m ON m.message_id=c.message_id WHERE m.user_id=:viewer ORDER BY c.message_id LIMIT ' . (SqlState::MAX_CONVERSATIONS + 1) . ' FOR UPDATE', [':viewer' => $this->viewerId]);
        if (count($rows) > SqlState::MAX_CONVERSATIONS) { throw new ChatException('CHAT_SCOPE_MIGRATION_REQUIRED', 'This scope requires a separately reviewed migration.', 503); }
        foreach ($rows as $row) {
            $id = SafeInteger::native($row['message_id'], 'conversation_id');
            if (isset($this->states[$id])) { throw new ChatException('INVALID_MEMBER_GENERATION', 'Multiple member generations are not admitted in this release.', 503); }
            $this->states[$id] = $this->sql->synchronize($id);
            if ($this->sending !== null) { $this->sendFacts[$id] = $this->sending->snapshot($this->states[$id]); }
        }
        $this->currentRevision = $this->sql->refreshRevision($this->viewerId, array_values($this->states), $this->sendFacts);
    }

    public function revision(int $viewerId): int
    {
        $this->viewer($viewerId);
        $row = $this->sql->one('SELECT revision FROM {{%matcher_chat_viewer_revision}} WHERE user_id=:viewer FOR UPDATE', [':viewer' => $viewerId]);
        return SafeInteger::native($row['revision'] ?? null, 'authorization_revision');
    }

    public function visibleIds(int $viewerId, ?int $beforeId, int $limit): array
    {
        $this->viewer($viewerId); $this->limit($limit);
        $ids = [];
        foreach ($this->states as $id => $state) {
            if (($beforeId === null || $id < $beforeId) && $this->grant($viewerId, $id)?->canRead()) { $ids[] = $id; }
        }
        rsort($ids, SORT_NUMERIC);
        return array_slice($ids, 0, $limit);
    }

    public function grant(int $viewerId, int $conversationId): ?AccessGrant
    {
        $this->viewer($viewerId);
        if (!isset($this->states[$conversationId])) { return null; }
        $state = $this->sql->state($conversationId);
        if ($state === null || $state['status'] !== 'active' || $state['type'] !== 'direct') { return null; }
        $member = $this->sql->one('SELECT * FROM {{%matcher_chat_member}} WHERE message_id=:id AND user_id=:viewer AND generation=1 FOR UPDATE', [':id' => $conversationId, ':viewer' => $viewerId]);
        $pair = [SafeInteger::native($state['pair_low'], 'pair_low'), SafeInteger::native($state['pair_high'], 'pair_high')];
        $members = $this->sql->nativeMembers($conversationId);
        if ($member === null || $member['status'] !== 'active' || !$this->sql->exactMembers($members, $pair) || !hash_equals($state['native_members_hash'], NativeProjection::membershipHash($members)) || !$this->sql->pairEnabled($pair) || $this->sql->nativeMessage($conversationId) === null) { return null; }
        $send = false;
        if ($this->sending !== null) {
            $facts = $this->sending->snapshot($state);
            if ($facts !== $this->sendFacts[$conversationId]) { throw new ChatException('AUTHORIZATION_CHANGED', 'The send authority changed.', 409); }
            $send = $facts['allowed'];
        }
        return new AccessGrant($viewerId, $conversationId, 'direct', SafeInteger::native($state['version'], 'authorization_version'), 1, 0, true, 'active', true, $send, false, false);
    }

    public function sender(int $viewerId, int $conversationId, ?int $senderId): Sender
    {
        $this->viewer($viewerId);
        // No profile authority was handed over. Do not invent a name/avatar permission.
        return Sender::unavailable();
    }

    public function conversation(int $conversationId): ?Conversation
    {
        $this->guard();
        $state = isset($this->states[$conversationId]) ? $this->sql->state($conversationId) : null;
        $native = $state !== null && $state['status'] === 'active' ? $this->sql->nativeMessage($conversationId) : null;
        if ($state === null || $native === null || $state['type'] !== 'direct') { return null; }
        $title = $native['title'] === null || trim($native['title']) === '' ? null : NativeProjection::text($native['title']);
        return new Conversation($conversationId, 'direct', $title, SafeInteger::native($state['version'], 'version'));
    }

    public function messages(int $conversationId, int $afterSeq, ?int $beforeSeq, int $limit, bool $newestFirst): array
    {
        $this->guard(); $this->limit($limit);
        $params = [':id' => $conversationId, ':after' => $afterSeq];
        $before = '';
        if ($beforeSeq !== null) { $before = ' AND s.seq<:before'; $params[':before'] = $beforeSeq; }
        $rows = $this->sql->all($this->entrySelect() . ' WHERE s.message_id=:id AND s.seq>:after' . $before . ' ORDER BY s.seq ' . ($newestFirst ? 'DESC' : 'ASC') . ' LIMIT ' . $limit . ' FOR UPDATE', $params);
        return array_map(fn (array $row): Message => $this->message($row), $rows);
    }

    public function messageAt(int $conversationId, int $seq): ?Message
    {
        $this->guard();
        $row = $this->sql->one($this->entrySelect() . ' WHERE s.message_id=:id AND s.seq=:seq FOR UPDATE', [':id' => $conversationId, ':seq' => $seq]);
        return $row === null ? null : $this->message($row);
    }

    public function readSeq(int $viewerId, int $conversationId, int $generation): int
    {
        $this->viewer($viewerId);
        $row = $this->sql->one('SELECT read_seq FROM {{%matcher_chat_read_state}} WHERE message_id=:id AND user_id=:viewer AND generation=:generation FOR UPDATE', [':id' => $conversationId, ':viewer' => $viewerId, ':generation' => $generation]);
        return $row === null ? 0 : SafeInteger::native($row['read_seq'], 'read_seq', true);
    }

    public function advanceReadSeq(int $viewerId, int $conversationId, int $generation, int $seq): int
    {
        $this->viewer($viewerId);
        $existing = $this->readSeq($viewerId, $conversationId, $generation);
        $next = max($existing, SafeInteger::nonNegative($seq, 'read_seq'));
        $key = ['message_id' => $conversationId, 'user_id' => $viewerId, 'generation' => $generation];
        $this->sql->db->createCommand()->upsert('{{%matcher_chat_read_state}}', $key + ['read_seq' => $next], ['read_seq' => $next])->execute();
        return $next;
    }

    public function unreadCount(int $viewerId, int $conversationId, int $afterSeq): int
    {
        $this->viewer($viewerId);
        $row = $this->sql->one('SELECT COUNT(*) AS total FROM {{%matcher_chat_entry_sequence}} WHERE message_id=:id AND seq>:after AND deleted=0 AND native_type=0 AND sender_id<>:viewer', [':id' => $conversationId, ':after' => $afterSeq, ':viewer' => $viewerId]);
        return SafeInteger::native($row['total'], 'unread_count', true);
    }

    private function entrySelect(): string
    {
        return 'SELECT s.*,e.id AS native_id,e.content FROM {{%matcher_chat_entry_sequence}} s LEFT JOIN {{%message_entry}} e ON e.id=s.entry_id AND e.message_id=s.message_id';
    }
    private function message(array $row): Message
    {
        $deleted = (int)$row['deleted'] === 1;
        if (!$deleted && $row['native_id'] === null) { throw new ChatException('CHAT_NATIVE_CHANGED', 'The native message changed during reading.', 409); }
        $kind = $deleted ? 'deleted' : ((int)$row['native_type'] === 0 ? 'text' : 'system');
        $body = $deleted ? null : ($kind === 'text' ? NativeProjection::text($row['content']) : ((int)$row['native_type'] === 1 ? 'A participant joined the conversation.' : 'A participant left the conversation.'));
        return new Message(SafeInteger::native($row['entry_id'], 'entry_id'), SafeInteger::native($row['message_id'], 'conversation_id'), SafeInteger::native($row['seq'], 'seq'), $row['sender_id'] === null ? null : SafeInteger::native($row['sender_id'], 'sender_id'), $kind, $body, $row['created_at_utc']);
    }
    private function viewer(int $viewer): void { $this->guard(); if ($viewer !== $this->viewerId) { throw ChatException::unavailable(); } }
    private function guard(): void { if (!$this->active) { throw new \LogicException('SQL reads require the chat consistency boundary.'); } }
    private function limit(int $limit): void { if ($limit < 1 || $limit > 49) { throw new \LogicException('Chat reads must be bounded.'); } }
}
