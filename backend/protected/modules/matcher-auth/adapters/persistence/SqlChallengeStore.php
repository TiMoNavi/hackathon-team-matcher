<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\adapters\persistence;

use humhub\modules\matcherAuth\domain\ports\ChallengeStore;
use yii\db\Connection;
use yii\db\Query;

final class SqlChallengeStore implements ChallengeStore
{
    public function __construct(public readonly Connection $db) {}
    public function transaction(callable $operation): mixed { return $this->db->transaction($operation); }

    public function lock(string $key): void
    {
        if ($this->db->getTransaction() === null) { throw new \LogicException('Authentication locks require a transaction.'); }
        $digest = hash('sha256', $key);
        // Make the first database operation a write/current read. QueryBuilder's schema
        // introspection before upsert can otherwise establish a stale SQLite read snapshot.
        $sql = match ($this->db->driverName) {
            'mysql' => 'INSERT INTO {{%matcher_auth_lock}} (lock_key,revision) VALUES (:key,1) ON DUPLICATE KEY UPDATE revision=revision+1',
            'sqlite', 'pgsql' => 'INSERT INTO {{%matcher_auth_lock}} (lock_key,revision) VALUES (:key,1) ON CONFLICT(lock_key) DO UPDATE SET revision=matcher_auth_lock.revision+1',
            default => throw new \LogicException('Unsupported authentication locking database.'),
        };
        $this->db->createCommand($sql, [':key' => $digest])->execute();
    }

    public function lockMany(array $keys): void
    {
        $keys = array_unique($keys); sort($keys, SORT_STRING);
        foreach ($keys as $key) { $this->lock($key); }
    }

    public function find(string $id): ?array
    {
        $row = (new Query())->from('{{%matcher_auth_challenge}}')->where(['id' => $id])->one($this->db);
        return $row === false ? null : $this->typed($row);
    }

    public function findLocked(string $id): ?array
    {
        $row = $this->current('{{%matcher_auth_challenge}}', 'id', $id);
        return $row === null ? null : $this->typed($row);
    }

    public function current(string $table, string $column, string $id): ?array
    {
        if (!in_array($table, ['{{%matcher_auth_challenge}}', '{{%matcher_auth_receipt}}', '{{%matcher_auth_import}}'], true)
            || !in_array($column, ['id', 'owner_id'], true) || $this->db->getTransaction() === null) {
            throw new \LogicException('Invalid authentication current read.');
        }
        $sql = 'SELECT * FROM ' . $table . ' WHERE ' . $this->db->quoteColumnName($column) . '=:id';
        if ($this->db->driverName !== 'sqlite') { $sql .= ' FOR UPDATE'; }
        $row = $this->db->createCommand($sql, [':id' => $id])->queryOne();
        return $row === false ? null : $row;
    }

    public function save(array $challenge): void { $this->db->createCommand()->upsert('{{%matcher_auth_challenge}}', $challenge)->execute(); }
    public function recent(string $emailHash, int $since): array
    {
        return array_map($this->typed(...), (new Query())->from('{{%matcher_auth_challenge}}')->where(['email_hash' => $emailHash])->andWhere(['>', 'created_at', $since])->all($this->db));
    }
    public function invalidate(string $emailHash, string $purpose): void
    {
        $this->db->createCommand()->update('{{%matcher_auth_challenge}}', ['status' => 'superseded'], ['and', ['email_hash' => $emailHash, 'purpose' => $purpose], ['in', 'status', ['pending', 'ready']]])->execute();
    }
    public function attempt(string $emailHash, int $timestamp): void { $this->db->createCommand()->insert('{{%matcher_auth_attempt}}', ['email_hash' => $emailHash, 'created_at' => $timestamp])->execute(); }
    public function attempts(string $emailHash, int $since): array
    {
        return array_map('intval', (new Query())->select('created_at')->from('{{%matcher_auth_attempt}}')->where(['email_hash' => $emailHash])->andWhere(['>', 'created_at', $since])->column($this->db));
    }
    private function typed(array $row): array
    {
        foreach (['created_at', 'expires_at', 'failed_attempts'] as $key) { $row[$key] = (int)$row[$key]; }
        $row['actor_id'] = $row['actor_id'] === null ? null : (int)$row['actor_id'];
        return $row;
    }
}
