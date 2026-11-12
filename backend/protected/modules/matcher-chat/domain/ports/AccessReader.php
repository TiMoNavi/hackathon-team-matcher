<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain\ports;

use humhub\modules\matcherChat\domain\AccessGrant;
use humhub\modules\matcherChat\domain\Sender;

interface AccessReader
{
    /**
     * Viewer-scoped, durable, monotonically increasing positive JS-safe integer.
     * Advance on read-authority or visible-sender-projection changes. Production
     * adapters must not reset it after process restarts or cache eviction.
     * Restoring a lower version requires clearing the session and a separately
     * verified policy that re-establishes trusted identity and the version domain.
     */
    public function revision(int $viewerId): int;
    /** Currently readable ids only, strictly descending id, at most limit (<=49). */
    public function visibleIds(int $viewerId, ?int $beforeId, int $limit): array;
    public function grant(int $viewerId, int $conversationId): ?AccessGrant;
    /** Reapply current legal projection; unavailable must not expose a former name/avatar. */
    public function sender(int $viewerId, int $conversationId, ?int $senderId): Sender;
}
