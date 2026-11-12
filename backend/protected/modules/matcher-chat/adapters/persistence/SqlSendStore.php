<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\persistence;

use humhub\modules\matcherChat\domain\{ChatException, Message, SafeInteger, SendReceipt, SendText};
use humhub\modules\matcherChat\domain\ports\{ConsistencyBoundary, SendRepository};

/** Narrow native-table writer. Never disables AR guards or invokes pre-commit effects. */
final class SqlSendStore implements SendRepository, ConsistencyBoundary
{
    private bool $active = false;
    private ?int $now = null;
    private array $invalidate = [];
    public function __construct(private readonly SqlState $sql, private readonly SqlReadStore $reads, private readonly int $viewerId, private readonly ?SqlAttachmentStore $attachments = null) {}

    public function run(callable $operation): mixed
    {
        if ($this->active) { throw new \LogicException('Nested send boundary.'); }
        $this->invalidate = [];
        try {
            $result = $this->reads->run(function () use ($operation): mixed {
                $this->active = true;
                try { return $operation(); } finally { $this->active = false; }
            });
        } catch (\Throwable $error) { $this->invalidate = []; throw $error; }
        finally { $this->now = null; }
        // The native count cache is the only post-commit side effect. No delivery claim.
        foreach ($this->invalidate as $id) {
            try { \humhub\modules\mail\models\UserMessage::invalidateNewMessageCountCache($id); }
            catch (\Throwable) { /* Cache expiry is native; never turn a committed send into a replay. */ }
        }
        $this->invalidate = [];
        return $result;
    }

    public function receipt(int $viewerId, int $conversationId, string $clientMessageId): ?SendReceipt
    {
        $this->guard($viewerId);
        $row = $this->sql->one('SELECT entry_id,seq,body_hash FROM {{%matcher_chat_send_receipt}} WHERE message_id=:message AND user_id=:viewer AND client_message_id=:key FOR UPDATE', [':message' => $conversationId, ':viewer' => $viewerId, ':key' => $clientMessageId]);
        return $row === null ? null : new SendReceipt(SafeInteger::native($row['entry_id'], 'entry_id'), SafeInteger::native($row['seq'], 'seq'), $row['body_hash']);
    }

    public function assertQuota(int $viewerId): void
    {
        $this->guard($viewerId);
        $this->now = SafeInteger::native($this->sql->one('SELECT UNIX_TIMESTAMP() AS now')['now'], 'server_time');
        $rows = $this->sql->all('SELECT created_at FROM {{%matcher_chat_send_receipt}} WHERE user_id=:viewer AND created_at>:since ORDER BY created_at,entry_id LIMIT 60 FOR UPDATE', [':viewer' => $viewerId, ':since' => $this->now - 60]);
        if (count($rows) >= 60) {
            $retry = max(1, SafeInteger::native($rows[0]['created_at'], 'created_at') + 60 - $this->now);
            throw new ChatException('RATE_LIMITED', 'Wait before sending another message.', 429, true, [], $retry);
        }
    }

    public static function nativeText(string $body): string
    {
        return htmlspecialchars($body, ENT_QUOTES | ENT_HTML5, 'UTF-8', true);
    }

    public function append(int $viewerId, int $conversationId, SendText $text): Message
    {
        $this->guard($viewerId);
        if ($this->now === null) { throw new \LogicException('Quota must be checked before append.'); }
        $grant = $this->reads->grant($viewerId, $conversationId);
        if ($grant === null || !$grant->permissions()['send']) { throw new ChatException('SEND_FORBIDDEN', 'Sending is not currently permitted.', 403); }
        $state = $this->sql->state($conversationId);
        if ($state === null || (int)$state['last_seq'] >= SqlState::MAX_ENTRIES) { throw new ChatException('CHAT_HISTORY_MIGRATION_REQUIRED', 'The history requires a reviewed migration.', 503); }
        $nativeTime = (new \DateTimeImmutable('@' . $this->now))->setTimezone(new \DateTimeZone($this->sql->nativeTimeZone))->format('Y-m-d H:i:s');
        $this->sql->db->createCommand()->insert('{{%message_entry}}', ['message_id' => $conversationId, 'user_id' => $viewerId,
            'type' => 0, 'content' => self::nativeText($text->body), 'created_at' => $nativeTime, 'created_by' => $viewerId,
            'updated_at' => $nativeTime, 'updated_by' => $viewerId])->execute();
        $id = SafeInteger::native($this->sql->db->getLastInsertID(), 'entry_id');
        if ($text->attachmentIds !== []) {
            if ($this->attachments === null) { throw new ChatException('CHAT_ATTACHMENTS_UNAVAILABLE', 'Attachment sending is unavailable.', 503); }
            $this->attachments->bind($conversationId, $id, $text->attachmentIds);
        }
        $this->sql->db->createCommand()->update('{{%message}}', ['updated_at' => $nativeTime, 'updated_by' => $viewerId], ['id' => $conversationId])->execute();
        $state = $this->sql->synchronize($conversationId);
        $seq = SafeInteger::native($state['last_seq'], 'seq');
        $message = $this->reads->messageAt($conversationId, $seq);
        if ($message === null || $message->id !== $id) { throw new ChatException('INVALID_SEND_PROJECTION', 'The native sequence was not synchronized.', 503); }
        $this->invalidate = [SafeInteger::native($state['pair_low'], 'pair_low'), SafeInteger::native($state['pair_high'], 'pair_high')];
        return $message;
    }

    public function remember(int $viewerId, int $conversationId, SendText $text, Message $message): void
    {
        $this->guard($viewerId);
        if ($this->now === null) { throw new \LogicException('No send timestamp.'); }
        $this->sql->db->createCommand()->insert('{{%matcher_chat_send_receipt}}', ['message_id' => $conversationId, 'user_id' => $viewerId,
            'client_message_id' => $text->clientMessageId, 'body_hash' => $text->bodyHash, 'entry_id' => $message->id,
            'seq' => $message->seq, 'created_at' => $this->now])->execute();
    }

    private function guard(int $viewerId): void
    {
        if (!$this->active || $viewerId !== $this->viewerId || !$this->sql->db->getTransaction()?->getIsActive()) {
            throw new \LogicException('Native sends require the owned actor transaction.');
        }
    }
}
