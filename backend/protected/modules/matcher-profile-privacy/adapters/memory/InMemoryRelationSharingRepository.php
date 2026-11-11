<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\memory;
use humhub\modules\matcherPrivacy\domain\ports\RelationSharingRepository;
use humhub\modules\matcherProfile\domain\ProfileException;
final class InMemoryRelationSharingRepository implements RelationSharingRepository
{
    public array $rows = [];
    public function read(int $ownerId, int $spaceId, string $kind): array { return $this->rows[$ownerId][$spaceId][$kind] ?? []; }
    public function save(int $ownerId, int $spaceId, string $kind, string $objectId, int $expectedVersion, string $visibility): array
    {
        if (($this->read($ownerId, $spaceId, $kind)[$objectId]['version'] ?? 0) !== $expectedVersion) { throw new ProfileException('RELATION_SHARING_CONFLICT', 'This relation sharing choice changed.', 409); }
        return $this->rows[$ownerId][$spaceId][$kind][$objectId] = ['version' => $expectedVersion + 1, 'visibility' => $visibility];
    }
}
