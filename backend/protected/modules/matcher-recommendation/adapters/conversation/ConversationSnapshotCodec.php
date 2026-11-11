<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\conversation;

/** JSON-only storage envelope. Domain/application snapshot fields stay opaque. */
final class ConversationSnapshotCodec
{
    public function __construct(private readonly int $maxBytes = 262144)
    {
        if ($maxBytes < 1024 || $maxBytes > 1048576) { throw new ConversationStorageException('invalid_data'); }
    }

    public static function identity(string $id, int $ownerId, ?int $eventId = null): void
    {
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/D', $id) || $ownerId < 1 || ($eventId !== null && $eventId < 1)) {
            throw new ConversationStorageException('invalid_data');
        }
    }

    public static function version(int $version): void
    {
        if ($version < 1 || $version >= PHP_INT_MAX) { throw new ConversationStorageException('invalid_data'); }
    }

    public function encode(string $id, int $ownerId, int $eventId, int $version, #[\SensitiveParameter] array $snapshot): string
    {
        self::identity($id, $ownerId, $eventId);
        self::version($version);
        $this->validateSnapshot($snapshot, $id, $ownerId, $eventId, $version);
        $nodes = 0;
        $this->jsonValue($snapshot, 0, $nodes);
        try {
            $json = json_encode([
                'schema' => 1, 'id' => $id, 'owner_id' => $ownerId, 'event_id' => $eventId,
                'version' => $version, 'snapshot' => $snapshot,
            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION, 64);
        } catch (\JsonException) { throw new ConversationStorageException('invalid_data'); }
        if (strlen($json) > $this->maxBytes) { throw new ConversationStorageException('snapshot_too_large'); }
        return $json;
    }

    public function decode(#[\SensitiveParameter] string $json, string $id, int $ownerId, int $eventId, int $version): array
    {
        try {
            self::identity($id, $ownerId, $eventId);
            self::version($version);
            if (strlen($json) > $this->maxBytes) { throw new ConversationStorageException('corrupt_storage'); }
            $data = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
            if (!is_array($data) || array_keys($data) !== ['schema', 'id', 'owner_id', 'event_id', 'version', 'snapshot']
                || $data['schema'] !== 1 || $data['id'] !== $id || $data['owner_id'] !== $ownerId
                || $data['event_id'] !== $eventId || $data['version'] !== $version || !is_array($data['snapshot'])) {
                throw new ConversationStorageException('corrupt_storage');
            }
            $this->validateSnapshot($data['snapshot'], $id, $ownerId, $eventId, $version);
            $nodes = 0;
            $this->jsonValue($data['snapshot'], 0, $nodes);
            return $data['snapshot'];
        } catch (\JsonException | ConversationStorageException) {
            throw new ConversationStorageException('corrupt_storage');
        }
    }

    private function validateSnapshot(#[\SensitiveParameter] array $snapshot, string $id, int $ownerId, int $eventId, int $version): void
    {
        if (($snapshot['version'] ?? null) !== $version) { throw new ConversationStorageException('invalid_data'); }
        foreach (['id' => $id, 'owner_id' => $ownerId, 'event_id' => $eventId] as $key => $value) {
            if (array_key_exists($key, $snapshot) && $snapshot[$key] !== $value) { throw new ConversationStorageException('invalid_data'); }
        }
    }

    private function jsonValue(#[\SensitiveParameter] mixed $value, int $depth, int &$nodes): void
    {
        if (++$nodes > 100000 || $depth > 48) { throw new ConversationStorageException('invalid_data'); }
        if (is_array($value)) {
            foreach ($value as $entry) { $this->jsonValue($entry, $depth + 1, $nodes); }
            return;
        }
        if ($value === null || is_bool($value) || is_int($value) || is_string($value) || (is_float($value) && is_finite($value))) { return; }
        throw new ConversationStorageException('invalid_data');
    }
}
