<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\domain\ports;
interface RelationSharingRepository
{
    /** object ID => {version:int,visibility:string}; absent means private/version 0. */
    public function read(int $ownerId, int $spaceId, string $kind): array;
    public function save(int $ownerId, int $spaceId, string $kind, string $objectId, int $expectedVersion, string $visibility): array;
}
