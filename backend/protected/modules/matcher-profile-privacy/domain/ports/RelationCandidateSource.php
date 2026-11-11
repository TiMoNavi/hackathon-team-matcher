<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\domain\ports;
interface RelationCandidateSource
{
    /** Only formal current-Space objects, object access and member-display policy validated; max 2,000, never truncate. */
    public function readCandidates(int $viewerId, int $ownerId, int $spaceId, string $kind): array;
}
