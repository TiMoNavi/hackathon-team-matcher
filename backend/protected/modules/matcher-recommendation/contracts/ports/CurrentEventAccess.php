<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;

interface CurrentEventAccess
{
    /** Authenticated server actor only. Requested Space is a hint; it must equal the server-selected active Space. */
    public function resolve(int $viewerId, ?int $requestedSpaceId = null): CurrentEventContext;
    /** Re-check account, current Space, formal membership, lifecycle and access policy; do not trust DTO construction. */
    public function assertCurrent(CurrentEventContext $context): void;
}
