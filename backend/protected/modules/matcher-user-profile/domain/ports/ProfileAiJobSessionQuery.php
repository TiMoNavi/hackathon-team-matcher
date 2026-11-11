<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\ports;

/** Optional read capability; existing task repository implementations remain compatible. */
interface ProfileAiJobSessionQuery
{
    /**
     * Exact owner and context.session_id match. Current queued/running first, then
     * updated_at DESC, created_at DESC, id DESC. Returns at most 21 saved jobs,
     * including the look-ahead row; callers must revalidate before presenting.
     */
    public function forSession(int $ownerId, string $sessionId, int $limit = 21): array;
}
