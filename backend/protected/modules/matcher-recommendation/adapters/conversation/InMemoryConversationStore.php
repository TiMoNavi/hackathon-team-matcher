<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\conversation;
use humhub\modules\matcherRecommendation\contracts\ports\ConversationStore;

/** Standalone adapter with the same JSON and CAS semantics as the persistent store. */
final class InMemoryConversationStore implements ConversationStore
{
    private array $rows = [];
    private readonly ConversationSnapshotCodec $codec;

    public function __construct(int $maxSnapshotBytes = 262144)
    {
        $this->codec = new ConversationSnapshotCodec($maxSnapshotBytes);
    }

    public function create(string $id, int $ownerId, int $eventId, #[\SensitiveParameter] array $snapshot): void
    {
        $json = $this->codec->encode($id, $ownerId, $eventId, 1, $snapshot);
        if (isset($this->rows[$id])) { throw new ConversationStorageException('duplicate_conversation'); }
        $this->rows[$id] = ['owner_id' => $ownerId, 'event_id' => $eventId, 'version' => 1, 'json' => $json];
    }

    public function load(string $id, int $ownerId): ?array
    {
        ConversationSnapshotCodec::identity($id, $ownerId);
        $row = $this->rows[$id] ?? null;
        if ($row === null || $row['owner_id'] !== $ownerId) { return null; }
        return $this->codec->decode($row['json'], $id, $ownerId, $row['event_id'], $row['version']);
    }

    public function compareAndSwap(string $id, int $ownerId, int $expectedVersion, #[\SensitiveParameter] array $nextSnapshot): bool
    {
        ConversationSnapshotCodec::identity($id, $ownerId);
        ConversationSnapshotCodec::version($expectedVersion);
        if (($nextSnapshot['version'] ?? null) !== $expectedVersion + 1) { throw new ConversationStorageException('invalid_data'); }
        $row = $this->rows[$id] ?? null;
        if ($row === null || $row['owner_id'] !== $ownerId) { return false; }
        $this->codec->decode($row['json'], $id, $ownerId, $row['event_id'], $row['version']);
        if ($row['version'] !== $expectedVersion) { return false; }
        $json = $this->codec->encode($id, $ownerId, $row['event_id'], $expectedVersion + 1, $nextSnapshot);
        $this->rows[$id] = ['owner_id' => $ownerId, 'event_id' => $row['event_id'], 'version' => $expectedVersion + 1, 'json' => $json];
        return true;
    }
}
