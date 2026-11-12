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
    private ?bool $attachmentSchemaVerified = null;
    private ?bool $groupSchemaVerified = null;

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
            if ($tx->getLevel() !== 1) { throw new \LogicException('Chat must close every owned nested transaction.'); }
            $tx->commit();
            return $result;
        } catch (\Throwable $error) {
            // Yii reuses one Transaction and decrements its nesting level before PDO
            // commit/rollback. One rollback is insufficient after an inner Throwable.
            for ($attempt = 0; $attempt < 16 && $tx->getIsActive(); ++$attempt) {
                $before = $tx->getLevel();
                try { $tx->rollBack(); } catch (\Throwable) { /* Keep the initiating error. */ }
                if ($tx->getLevel() >= $before) { break; }
            }
            // A failed PDO commit/rollback may leave level=0 while PDO is still in a
            // transaction. Discard this owned connection even if Yii says inactive.
            try { $this->db->close(); } catch (\Throwable) { /* Never mask the original failure. */ }
            throw $error;
        }
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

    public function attachmentsReady(): bool
    {
        if ($this->attachmentSchemaVerified !== null) { return $this->attachmentSchemaVerified; }
        $table = $this->db->schema->getTableSchema('{{%matcher_chat_attachment}}');
        if ($table === null || $table->primaryKey !== ['attachment_id']) { return $this->attachmentSchemaVerified = false; }
        $engine = $this->one('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table', [':table' => $this->db->tablePrefix . 'matcher_chat_attachment']);
        return $this->attachmentSchemaVerified = $engine !== null && strtoupper((string)$engine['ENGINE']) === 'INNODB';
    }
    public function registeredFile(mixed $id, mixed $guid): bool
    {
        if (!$this->attachmentsReady()) { return false; }
        return $this->one('SELECT attachment_id FROM {{%matcher_chat_attachment}} WHERE file_id=:id OR file_guid=:guid LIMIT 1', [':id' => is_numeric($id) ? (int)$id : 0, ':guid' => is_string($guid) ? $guid : '']) !== null;
    }
    /** Group migrations are additive; old direct installations remain readable. */
    public function groupsReady(): bool
    {
        if ($this->groupSchemaVerified !== null) { return $this->groupSchemaVerified; }
        if (!$this->ready()) { return $this->groupSchemaVerified = false; }
        $expected = [
            'matcher_chat_group_invitation' => [['id'], ['id', 'message_id', 'inviter_id', 'invitee_id', 'pending_invitee_id', 'status', 'version', 'created_at', 'expires_at', 'resolved_at']],
            'matcher_chat_group_receipt' => [['actor_id', 'operation', 'client_command_id'], ['actor_id', 'operation', 'client_command_id', 'payload_hash', 'message_id', 'invitation_id', 'created_at']],
        ];
        foreach ($expected as $name => [$key, $columns]) {
            $schema = $this->db->schema->getTableSchema('{{%' . $name . '}}');
            if ($schema === null || $schema->primaryKey !== $key || array_diff($columns, array_keys($schema->columns)) !== []) { return $this->groupSchemaVerified = false; }
            $engine = $this->one('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table', [':table' => $this->db->tablePrefix . $name]);
            if ($engine === null || strtoupper((string)$engine['ENGINE']) !== 'INNODB') { return $this->groupSchemaVerified = false; }
        }
        $conversation = $this->db->schema->getTableSchema('{{%matcher_chat_conversation}}');
        $member = $this->db->schema->getTableSchema('{{%matcher_chat_member}}');
        foreach (['pair_low', 'pair_high', 'owner_id'] as $name) {
            if (!isset($conversation->columns[$name]) || !$conversation->columns[$name]->allowNull) { return $this->groupSchemaVerified = false; }
        }
        if (!isset($member->columns['version']) || $member->columns['version']->allowNull) { return $this->groupSchemaVerified = false; }
        $index = $this->all('SELECT COLUMN_NAME,NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table AND INDEX_NAME=:index ORDER BY SEQ_IN_INDEX',
            [':table' => $this->db->tablePrefix . 'matcher_chat_group_invitation', ':index' => 'uq_matcher_chat_group_pending']);
        return $this->groupSchemaVerified = count($index) === 2 && array_column($index, 'COLUMN_NAME') === ['message_id', 'pending_invitee_id']
            && array_map('intval', array_column($index, 'NON_UNIQUE')) === [0, 0];
    }
    /** Unknown native files remain a permanent revocation trigger. */
    private function attachmentRows(int $id): ?array
    {
        $files = $this->all('SELECT f.* FROM {{%file}} f INNER JOIN {{%message_entry}} e ON e.id=f.object_id WHERE e.message_id=:id AND LOWER(TRIM(LEADING CHAR(92) FROM f.object_model)) IN (:entry,:abstract,:joined,:left) FOR UPDATE', [':id' => $id,
            ':entry' => 'humhub\\modules\\mail\\models\\messageentry', ':abstract' => 'humhub\\modules\\mail\\models\\abstractmessageentry', ':joined' => 'humhub\\modules\\mail\\models\\states\\messageuserjoined', ':left' => 'humhub\\modules\\mail\\models\\states\\messageuserleft']);
        if (!$this->attachmentsReady()) { return $files === [] ? [] : null; }
        $rows = $this->all('SELECT a.* FROM {{%matcher_chat_attachment}} a INNER JOIN {{%message_entry}} e ON e.id=a.entry_id AND e.message_id=a.message_id WHERE a.message_id=:id AND a.state=:state ORDER BY a.entry_id,a.position FOR UPDATE', [':id' => $id, ':state' => 'bound']);
        $byFile = []; $byEntry = [];
        foreach ($rows as $row) {
            if ((int)$row['position'] < 0 || (int)$row['position'] >= 3 || $row['uploaded_at'] === null) { return null; }
            $byFile[(int)$row['file_id']] = $row; $byEntry[(int)$row['entry_id']][] = $row;
        }
        if (count($files) !== count($rows)) { return null; }
        foreach ($files as $file) { $row = $byFile[(int)$file['id']] ?? null; if ($row === null || !SqlAttachmentStore::matches($row, $file, true)) { return null; } }
        foreach ($byEntry as $entryRows) { if (array_map(static fn ($row): int => (int)$row['position'], $entryRows) !== range(0, count($entryRows) - 1)) { return null; } }
        return $byEntry;
    }
    public function attachmentsAt(int $conversationId, int $entryId): array
    {
        if (!$this->attachmentsReady()) { return []; }
        $rows = $this->all('SELECT * FROM {{%matcher_chat_attachment}} WHERE message_id=:message AND entry_id=:entry AND state=:state ORDER BY position LIMIT 4 FOR UPDATE', [':message' => $conversationId, ':entry' => $entryId, ':state' => 'bound']);
        if (count($rows) > 3) { throw new ChatException('INVALID_ATTACHMENT_PROJECTION', 'The file association is invalid.', 503); }
        return array_map(static fn ($row) => SqlAttachmentStore::project($row), $rows);
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
        $attachments = $this->attachmentRows($id);
        $pair = [SafeInteger::native($state['pair_low'], 'pair_low'), SafeInteger::native($state['pair_high'], 'pair_high')];
        if ($native === null || !$this->exactMembers($members, $pair) || !hash_equals($state['native_members_hash'], NativeProjection::membershipHash($members)) || !$this->pairEnabled($pair) || $attachments === null) {
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
            $entryAttachments = $attachments[$entryId] ?? [];
            foreach ($entryAttachments as $attachment) { if ((int)$attachment['user_id'] !== $senderId || $type !== 0) { throw new ChatException('INVALID_ATTACHMENT_PROJECTION', 'The attachment author changed.', 503); } }
            if ($type === 0 && !($entry['content'] === '' && $entryAttachments !== [])) { NativeProjection::text($entry['content']); }
            $utc = NativeProjection::utc($entry['created_at'], $this->nativeTimeZone);
            $facts = [$senderId, $type, $entry['content'], $utc];
            if ($entryAttachments !== []) { $facts[] = array_map(static fn ($a): array => [$a['attachment_id'], $a['file_id'], $a['file_guid'], $a['name'], $a['mime'], (int)$a['size'], $a['sha256'], (int)$a['position']], $entryAttachments); }
            $hash = hash('sha256', json_encode($facts, JSON_THROW_ON_ERROR));
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
    public function refreshRevision(int $viewerId, array $states, array $sendFacts = []): int
    {
        $scope = [];
        foreach ($states as $state) { $scope[] = [$state['message_id'], $state['status'], $state['version'], $state['native_members_hash']]; }
        $hash = hash('sha256', json_encode($sendFacts === [] ? $scope : [$scope, $sendFacts], JSON_THROW_ON_ERROR));
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
