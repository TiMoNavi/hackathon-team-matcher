<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\persistence;
use humhub\modules\matcherPrivacy\domain\ports\RelationSharingRepository;
use humhub\modules\matcherProfile\domain\ProfileException;
use yii\db\{Connection, Query, IntegrityException};
final class SqlRelationSharingRepository implements RelationSharingRepository
{
    public const TABLE = '{{%matcher_profile_relation_sharing}}';
    public function __construct(private Connection $db) {}
    public function read(int $ownerId, int $spaceId, string $kind): array
    {
        $rows = $this->db->useMaster(fn(): array => $this->db->noCache(fn(): array => (new Query())->select(['object_id', 'version', 'visibility'])->from(self::TABLE)->where(['owner_id' => $ownerId, 'space_id' => $spaceId, 'kind' => $kind])->orderBy('object_id')->noCache()->all($this->db)));
        $result = []; foreach ($rows as $row) { $result[$row['object_id']] = ['version' => (int)$row['version'], 'visibility' => $row['visibility']]; } return $result;
    }
    public function save(int $ownerId, int $spaceId, string $kind, string $objectId, int $expectedVersion, string $visibility): array
    {
        $key = ['owner_id' => $ownerId, 'space_id' => $spaceId, 'kind' => $kind, 'object_id' => $objectId];
        $values = ['version' => $expectedVersion + 1, 'visibility' => $visibility];
        if ($expectedVersion === 0) {
            try { $this->db->createCommand()->insert(self::TABLE, ['id' => hash('sha256', json_encode($key, JSON_THROW_ON_ERROR))] + $key + $values)->execute(); }
            catch (IntegrityException) { $this->conflict(); }
        } elseif ($this->db->createCommand()->update(self::TABLE, $values, $key + ['version' => $expectedVersion])->execute() !== 1) { $this->conflict(); }
        return $values;
    }
    private function conflict(): never { throw new ProfileException('RELATION_SHARING_CONFLICT', 'This relation sharing choice changed.', 409); }
}
