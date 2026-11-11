<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
interface ConversationStore
{
    /** Snapshot is JSON-compatible, version=1. Duplicate id must fail. */
    public function create(string $id, int $ownerId, int $eventId, array $snapshot): void;
    /** Ownership mismatch is indistinguishable from missing. */
    public function load(string $id, int $ownerId): ?array;
    /** Atomic: existing version must match; nextSnapshot.version=expectedVersion+1. */
    public function compareAndSwap(string $id, int $ownerId, int $expectedVersion, array $nextSnapshot): bool;
}
