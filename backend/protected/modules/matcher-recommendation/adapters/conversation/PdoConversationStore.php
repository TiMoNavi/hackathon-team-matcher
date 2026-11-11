<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\conversation;
use humhub\modules\matcherRecommendation\contracts\ports\ConversationStore;
use PDO;
use PDOException;
use PDOStatement;

/** Inject an isolated/owned PDO connection. No framework, automatic DDL, or open transaction. */
final class PdoConversationStore implements ConversationStore
{
    private readonly ConversationSnapshotCodec $codec;
    private readonly string $table;

    public function __construct(private readonly PDO $db, int $maxSnapshotBytes = 262144, string $tablePrefix = '')
    {
        $this->codec = new ConversationSnapshotCodec($maxSnapshotBytes);
        $this->table = ConversationRuntimeSchema::table($tablePrefix, ConversationStorageSchema::TABLE);
        $this->safe(function (): void {
            if ($this->db->getAttribute(PDO::ATTR_ERRMODE) !== PDO::ERRMODE_EXCEPTION) {
                throw new ConversationStorageException('invalid_data');
            }
            if (!in_array($this->db->getAttribute(PDO::ATTR_DRIVER_NAME), ['sqlite', 'mysql'], true)) {
                throw new ConversationStorageException('driver_unsupported');
            }
        });
    }

    public function create(string $id, int $ownerId, int $eventId, #[\SensitiveParameter] array $snapshot): void
    {
        $json = $this->codec->encode($id, $ownerId, $eventId, 1, $snapshot);
        $this->safe(function () use ($id, $ownerId, $eventId, $json): void {
            try {
                $this->statement('INSERT INTO ' . $this->table . ' (id, owner_id, event_id, version, snapshot_json) VALUES (:id, :owner, :event, :version, :json)',
                    [':id' => $id, ':owner' => $ownerId, ':event' => $eventId, ':version' => 1, ':json' => $json]);
            } catch (PDOException $error) {
                // Unique ID collisions are expected; do not expose the conflicting owner's data.
                if (in_array((string)$error->getCode(), ['23000', '23505'], true) && $this->exists($id)) {
                    throw new ConversationStorageException('duplicate_conversation');
                }
                throw $error;
            }
        });
    }

    public function load(string $id, int $ownerId): ?array
    {
        ConversationSnapshotCodec::identity($id, $ownerId);
        return $this->safe(function () use ($id, $ownerId): ?array {
            $row = $this->row($id, $ownerId);
            return $row === null ? null : $this->snapshot($row, $id, $ownerId);
        });
    }

    public function compareAndSwap(string $id, int $ownerId, int $expectedVersion, #[\SensitiveParameter] array $nextSnapshot): bool
    {
        ConversationSnapshotCodec::identity($id, $ownerId);
        ConversationSnapshotCodec::version($expectedVersion);
        if (($nextSnapshot['version'] ?? null) !== $expectedVersion + 1) { throw new ConversationStorageException('invalid_data'); }
        return $this->safe(function () use ($id, $ownerId, $expectedVersion, $nextSnapshot): bool {
            $row = $this->row($id, $ownerId);
            if ($row === null) { return false; }
            $this->snapshot($row, $id, $ownerId);
            if ((int)$row['version'] !== $expectedVersion) { return false; }
            $eventId = (int)$row['event_id'];
            $json = $this->codec->encode($id, $ownerId, $eventId, $expectedVersion + 1, $nextSnapshot);
            $statement = $this->statement('UPDATE ' . $this->table . ' SET version = :next, snapshot_json = :json WHERE id = :id AND owner_id = :owner AND event_id = :event AND version = :expected',
                [':next' => $expectedVersion + 1, ':json' => $json, ':id' => $id, ':owner' => $ownerId, ':event' => $eventId, ':expected' => $expectedVersion]);
            return $statement->rowCount() === 1;
        });
    }

    private function row(string $id, int $ownerId): ?array
    {
        $statement = $this->statement('SELECT id, owner_id, event_id, version, snapshot_json FROM ' . $this->table . ' WHERE id = :id AND owner_id = :owner', [':id' => $id, ':owner' => $ownerId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        return $row === false ? null : $row;
    }

    private function exists(string $id): bool
    {
        return $this->statement('SELECT id FROM ' . $this->table . ' WHERE id = :id', [':id' => $id])->fetchColumn() !== false;
    }

    private function snapshot(#[\SensitiveParameter] array $row, string $id, int $ownerId): array
    {
        foreach (['owner_id', 'event_id', 'version'] as $field) {
            $value = $row[$field] ?? null;
            if ((!is_int($value) && !is_string($value)) || !preg_match('/^[1-9][0-9]*$/D', (string)$value) || (string)(int)$value !== (string)$value) {
                throw new ConversationStorageException('corrupt_storage');
            }
        }
        if (($row['id'] ?? null) !== $id || (int)$row['owner_id'] !== $ownerId || !is_string($row['snapshot_json'] ?? null)) {
            throw new ConversationStorageException('corrupt_storage');
        }
        return $this->codec->decode($row['snapshot_json'], $id, $ownerId, (int)$row['event_id'], (int)$row['version']);
    }

    private function statement(string $sql, #[\SensitiveParameter] array $values): PDOStatement
    {
        $statement = $this->db->prepare($sql);
        if ($statement === false) { throw new ConversationStorageException('dependency_unavailable'); }
        foreach ($values as $key => $value) {
            if (!$statement->bindValue($key, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR)) {
                throw new ConversationStorageException('dependency_unavailable');
            }
        }
        if (!$statement->execute()) {
            $error = $statement->errorInfo();
            if (str_starts_with($sql, 'INSERT ') && ($error[0] ?? null) === '23000' && $this->exists($values[':id'])) {
                throw new ConversationStorageException('duplicate_conversation');
            }
            throw new ConversationStorageException('dependency_unavailable');
        }
        return $statement;
    }

    private function safe(#[\SensitiveParameter] callable $operation): mixed
    {
        try {
            if ($this->db->inTransaction()) { throw new ConversationStorageException('transaction_unsupported'); }
            if ($this->db->getAttribute(PDO::ATTR_ERRMODE) !== PDO::ERRMODE_EXCEPTION) {
                throw new ConversationStorageException('invalid_data');
            }
            return $operation();
        } catch (ConversationStorageException $error) { throw new ConversationStorageException($error->reason); }
        catch (\Throwable) { throw new ConversationStorageException('dependency_unavailable'); }
    }
}
