<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\domain\ports;

/** Batch live discovery qualification. Internal caller binds viewer/Space to server-selected context. */
interface DiscoveryRelations
{
    /**
     * Validate the viewer even for an empty batch, then return only eligible requested owners.
     * A nonmember/disabled/blocked viewer throws; unavailable subjects are omitted without reasons.
     * No administrator exemption; no per-owner SQL or singleton ProfileRelations calls.
     * @param list<int> $ownerIds
     * @return list<int>
     */
    public function eligibleOwnerIds(int $viewerId, int $spaceId, array $ownerIds): array;
}
