<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\persistence;
use humhub\modules\matcherProfile\domain\ports\ProfilePresentationRepository;
use humhub\modules\matcherProfile\domain\ProfileException;
use yii\db\{Connection, Query, IntegrityException};
final class SqlProfilePresentationRepository implements ProfilePresentationRepository
{
    public const TABLE = '{{%matcher_profile_presentation}}';
    public function __construct(private Connection $db) {}
    public function read(int $ownerId): array
    {
        $row = $this->one((new Query())->from(self::TABLE)->where(['id' => $ownerId]));
        if ($row !== false) { return ['version' => (int)$row['version'], 'education_attribute_id' => $row['education_attribute_id'], 'primary_portfolio_attribute_id' => $row['primary_portfolio_attribute_id']]; }
        // Resolve the primary before visibility projection; never pick the first visible link.
        $native = $this->one((new Query())->select('a.attribute_id')->from(['a' => '{{%matcher_profile_attribute}}'])->innerJoin(['s' => '{{%matcher_profile_state}}'], '[[s.id]] = [[a.state_id]]')->where(['s.user_id' => $ownerId, 's.scope_key' => 'global', 'a.field_key' => 'portfolio_link', 'a.native_binding' => 'primary_portfolio_link', 'a.confirmation' => 'confirmed']));
        return ['version' => 0, 'education_attribute_id' => null, 'primary_portfolio_attribute_id' => $native === false ? null : $native['attribute_id']];
    }
    public function save(int $ownerId, int $expectedVersion, ?string $educationId, ?string $portfolioId): array
    {
        $values = ['version' => $expectedVersion + 1, 'education_attribute_id' => $educationId, 'primary_portfolio_attribute_id' => $portfolioId];
        if ($expectedVersion === 0) {
            try { $this->db->createCommand()->insert(self::TABLE, ['id' => $ownerId] + $values)->execute(); }
            catch (IntegrityException) { $this->conflict(); }
        } elseif ($this->db->createCommand()->update(self::TABLE, $values, ['id' => $ownerId, 'version' => $expectedVersion])->execute() !== 1) { $this->conflict(); }
        return $values;
    }
    private function one(Query $query): array|false
    {
        $command = $query->createCommand($this->db);
        if ($this->db->driverName === 'mysql' && $this->db->getTransaction()?->isActive) { $params = $command->params; $command->setSql($command->getSql() . ' FOR SHARE')->bindValues($params); }
        return $this->db->useMaster(fn(): array|false => $this->db->noCache(fn(): array|false => $command->queryOne()));
    }
    private function conflict(): never { throw new ProfileException('PRESENTATION_CONFLICT', 'Presentation settings changed.', 409); }
}
