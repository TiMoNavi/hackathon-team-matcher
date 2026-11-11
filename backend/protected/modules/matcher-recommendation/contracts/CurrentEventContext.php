<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts;

/**
 * Server-owned context snapshot, NOT a bearer token or proof of authorization.
 * CurrentEventAccess and every data adapter must revalidate it on each read.
 * accessVersion covers activity/membership policy; it is NOT a P1 permission_version.
 */
final class CurrentEventContext
{
    public function __construct(
        public readonly int $viewerId,
        public readonly int $spaceId,
        public readonly string $accessVersion,
        public readonly string $policyVersion,
    ) {
        if ($viewerId <= 0 || $spaceId <= 0) {
            throw new \InvalidArgumentException('Positive actor and Space IDs are required.');
        }
        ContractShape::token($accessVersion);
        ContractShape::token($policyVersion);
    }
}
