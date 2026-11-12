<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\persistence;

use humhub\modules\matcherChat\adapters\native\NativeProjection;
use humhub\modules\matcherChat\domain\{ChatException, SafeInteger};
use yii\db\{Connection, Transaction};

/** MySQL/InnoDB-specific lock adapter; migrations never copy native message bodies. */
final class SqlState
{
    public const TABLES = ['matcher_chat_lock', 'matcher_chat_conversation', 'matcher_chat_entry_sequence', 'matcher_chat_member', 'matcher_chat_read_state', 'matcher_chat_viewer_revision'];
    public const MAX_ENTRIES = 10000;
    public const MAX_CONVERSATIONS = 512;
    private bool $storageVerified = false;

    public function __construct(public readonly Connection $db, public readonly string $nativeTimeZone = 'UTC') {}

    public function ready(): bool
    {
        if ($this->db->driverName !== 'mysql') { return false; }
        if ($this->storageVerified) { return true; }
        foreach (array_merge(self::TABLES, ['message', 'message_entry', 'user_message', 'user', 'file']) as $table) {
            if ($this->db->schema->getTableSchema('{{%' . $table . '}}') === null) { return false; }
            $engine = $this->one('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table', [':table' => $this->db->tablePrefix . $table]);
            if ($engine === null || strtoupper((string)$engine['ENGINE']) !== 'INNODB') { return false; }
        }
        $this->storageVerified = true;
        return true;
    }

    public function transaction(callable $operation): mixed
    {
        if (!$this->ready()) { throw new ChatException('CHAT_DEPENDENCY_UNAVAILABLE', 'The chat metadata is not ready.', 503); }
        if ($this->db->getTransaction()?->getIsActive()) { throw new ChatException('CHAT_TRANSACTION_CONFLICT', 'Chat must own its consistency boundary.', 503); }
        // Current locking reads + InnoDB next-key locks protect membership/entry
        // ranges against phantom inserts; an ordinary repeatable snapshot alone would not.
        $tx = $this->db->beginTransaction(Transaction::REPEATABLE_READ);
        try {
            if ($this->one('SELECT id FROM {{%matcher_chat_lock}} WHERE id=1 FOR UPDATE') === null) { throw new ChatException('CHAT_DEPENDENCY_UNAVAILABLE', 'The chat lock is unavailable.', 503); }
            $result = $operation();
            $tx->commit();
            return $result;
        } catch (\Throwable $error) { if ($tx->getIsActive()) { $tx->rollBack(); } throw $error; }
    }

    public function one(string $sql, array $params = []): ?array
    {
        $row = $this->db->createCommand($sql, $params)->queryOne();
        return $row === false ? null : $row;
    }
    public function all(string $sql, array $params = []): array { return $this->db->createCommand($sql, $params)->queryAll(); }
    public function state(int $id): ?array { return $this->one('SELECT * FROM {{%matcher_chat_conversation}} WHERE message_id=:id FOR UPDATE', [':id' => $id]); }
    public function nativeMessage(int $id): ?array { return $this->one('SELECT * FROM {{%message}} WHERE id=:id FOR UPDATE', [':id' => $id]); }
    public function nativeMembers(int $id): array { return $this->all('SELECT user_id,created_at,created_by FROM {{%user_message}} WHERE message_id=:id ORDER BY user_id FOR UPDATE', [':id' => $id]); }

    public function pairEnabled(array $pair): bool
    {
        $rows = $this->all('SELECT id,status FROM {{%user}} WHERE id IN (:low,:high) ORDER BY id FOR UPDATE', [':low' => $pair[0], ':high' => $pair[1]]);
        return count($rows) === 2 && (int)$rows[0]['status'] === 1 && (int)$rows[1]['status'] === 1;
    }

    public function hasFiles(int $id): bool
    {
        $row = $this->one('SELECT f.id FROM {{%file}} f INNER JOIN {{%message_entry}} e ON e.id=f.object_id WHERE e.message_id=:id AND (f.object_model=:model OR f.object_model=:leading) LIMIT 1 FOR UPDATE', [':id' => $id, ':model' => 'humhub\\modules\\mail\\models\\MessageEntry', ':leading' => '\\humhub\\modules\\mail\\models\\MessageEntry']);
        return $row !== null;
    }

    public function exactMembers(array $members, array $pair): bool
    {
        return count($members) === 2 && array_map(static fn ($row): int => SafeInteger::native($row['user_id'], 'native_member_id'), $members) === $pair;
    }

    /** Sync admitted direct history while holding native parent/member/entry row locks. */
    public function synchronize(int $id): ?array
    {
        $state = $this->state($id);
        if ($state === null || $state['status'] !== 'active') { return $state; }
        if ($state['type'] !== 'direct') { throw new ChatException('UNADMITTED_CONVERSATION', 'Only explicitly admitted direct conversations are supported.', 503); }
        $native = $this->nativeMessage($id);
        $members = $this->nativeMembers($id);
        $pair = [SafeInteger::native($state['pair_low'], 'pair_low'), SafeInteger::native($state['pair_high'], 'pair_high')];
        if ($native === null || !$this->exactMembers($members, $pair) || !hash_equals($state['native_members_hash'], NativeProjection::membershipHash($members)) || !$this->pairEnabled($pair) || $this->hasFiles($id)) {
            $this->revoke($id, 'native-authority-changed');
            return $this->state($id);
        }
        $entries = $this->all('SELECT id,message_id,user_id,type,content,created_at FROM {{%message_entry}} WHERE message_id=:id ORDER BY id LIMIT ' . (self::MAX_ENTRIES + 1) . ' FOR UPDATE', [':id' => $id]);
        if (count($entries) > self::MAX_ENTRIES) { throw new ChatException('CHAT_HISTORY_MIGRATION_REQUIRED', 'This history requires a separately reviewed migration.', 503); }
        $mapped = $this->all('SELECT * FROM {{%matcher_chat_entry_sequence}} WHERE message_id=:id ORDER BY seq FOR UPDATE', [':id' => $id]);
        $byId = [];
        foreach ($mapped as $row) { $byId[SafeInteger::native($row['entry_id'], 'entry_id')] = $row; }
        $last = SafeInteger::native($state['last_seq'], 'last_seq', true);
        $changedExisting = false;
        foreach ($entries as $entry) {
            $entryId = SafeInteger::native($entry['id'], 'entry_id');
            $senderId = SafeInteger::native($entry['user_id'], 'sender_id');
            $type = SafeInteger::native($entry['type'], 'native_type', true);
            if (!in_array($senderId, $pair, true) || !in_array($type, [0, 1, 2], true)) { throw new ChatException('UNSUPPORTED_NATIVE_MESSAGE', 'A native message needs an explicit migration decision.', 503); }
            if ($type === 0) { NativeProjection::text($entry['content']); }
            $utc = NativeProjection::utc($entry['created_at'], $this->nativeTimeZone);
            $hash = hash('sha256', json_encode([$senderId, $type, $entry['content'], $utc], JSON_THROW_ON_ERROR));
            if (isset($byId[$entryId])) {
                $old = $byId[$entryId];
                if ((int)$old['deleted'] === 1) { throw new ChatException('NATIVE_ENTRY_ID_REUSED', 'A deleted entry identifier cannot be reused.', 503); }
                if ($hash !== $old['projection_hash']) {
                    $changedExisting = true;
                    $this->db->createCommand()->update('{{%matcher_chat_entry_sequence}}', ['sender_id' => $senderId, 'native_type' => $type, 'created_at_utc' => $utc, 'projection_hash' => $hash], ['entry_id' => $entryId])->execute();
                }
                $seq = SafeInteger::native($old['seq'], 'seq');
                unset($byId[$entryId]);
            } else {
                $seq = SafeInteger::positive($last + 1, 'seq');
                $last = $seq;
                $this->db->createCommand()->insert('{{%matcher_chat_entry_sequence}}', ['entry_id' => $entryId, 'message_id' => $id, 'seq' => $seq, 'sender_id' => $senderId, 'native_type' => $type, 'created_at_utc' => $utc, 'deleted' => 0, 'projection_hash' => $hash])->execute();
            }
        }
        foreach ($byId as $entryId => $old) {
            if ((int)$old['deleted'] === 0) { $changedExisting = true; $this->db->createCommand()->update('{{%matcher_chat_entry_sequence}}', ['deleted' => 1], ['entry_id' => $entryId])->execute(); }
        }
        // Appending a message does not invalidate previous authorized projections.
        // Edits/deletions/title changes do invalidate cached history, including empty polls.
        $projectionHash = hash('sha256', (string)($native['title'] ?? ''));
        if (!hash_equals($state['native_projection_hash'], $projectionHash) || $changedExisting) {
            $version = SafeInteger::positive(SafeInteger::native($state['version'], 'version') + 1, 'version');
            $this->db->createCommand()->update('{{%matcher_chat_conversation}}', ['version' => $version, 'last_seq' => $last, 'native_projection_hash' => $projectionHash], ['message_id' => $id])->execute();
        } elseif ($last !== SafeInteger::native($state['last_seq'], 'last_seq', true)) {
            $this->db->createCommand()->update('{{%matcher_chat_conversation}}', ['last_seq' => $last], ['message_id' => $id])->execute();
        }
        return $this->state($id);
    }

    public function revoke(int $id, string $reference): void
    {
        $state = $this->state($id);
        if ($state === null || $state['status'] !== 'active') { return; }
        $this->db->createCommand()->update('{{%matcher_chat_conversation}}', ['status' => 'revoked', 'version' => SafeInteger::positive(SafeInteger::native($state['version'], 'version') + 1, 'version'), 'revocation_ref' => NativeProjection::reference($reference)], ['message_id' => $id])->execute();
        $this->db->createCommand()->update('{{%matcher_chat_member}}', ['status' => 'revoked'], ['message_id' => $id])->execute();
    }

    /** Persist monotonic scope epoch; process/cache restart never resets it. */
    public function refreshRevision(int $viewerId, array $states): int
    {
        $scope = [];
        foreach ($states as $state) { $scope[] = [$state['message_id'], $state['status'], $state['version'], $state['native_members_hash']]; }
        $hash = hash('sha256', json_encode($scope, JSON_THROW_ON_ERROR));
        $row = $this->one('SELECT revision,scope_hash FROM {{%matcher_chat_viewer_revision}} WHERE user_id=:viewer FOR UPDATE', [':viewer' => $viewerId]);
        if ($row === null) {
            $this->db->createCommand()->insert('{{%matcher_chat_viewer_revision}}', ['user_id' => $viewerId, 'revision' => 1, 'scope_hash' => $hash])->execute();
            return 1;
        }
        $revision = SafeInteger::native($row['revision'], 'authorization_revision');
        if (!hash_equals($row['scope_hash'], $hash)) {
            $revision = SafeInteger::positive($revision + 1, 'authorization_revision');
            $this->db->createCommand()->update('{{%matcher_chat_viewer_revision}}', ['revision' => $revision, 'scope_hash' => $hash], ['user_id' => $viewerId])->execute();
        }
        return $revision;
    }
}
