<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\persistence;
use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\user\models\Profile;
use humhub\modules\user\models\User;
use yii\db\Connection;
use yii\db\Query;

/** Values remain in original native columns; metadata carries no duplicate value. */
final class NativeProfileValues
{
    public function __construct(private Connection $db) {}
    public function all(int $ownerId, bool $currentRead = false): array
    {
        $profile = $this->one((new Query())->from(Profile::tableName())->where(['user_id' => $ownerId]), $currentRead);
        $user = $this->one((new Query())->select(['time_zone'])->from(User::tableName())->where(['id' => $ownerId]), $currentRead);
        $values = [];
        foreach (FieldCatalog::nativeBindings() as $key => $binding) {
            if ($key === 'real_name') { $values[$key] = trim(trim((string)($profile['firstname'] ?? '')) . ' ' . trim((string)($profile['lastname'] ?? ''))); }
            else { $row = $binding['table'] === 'user' ? $user : $profile; $values[$key] = $row[$binding['columns'][0]] ?? null; }
        }
        return $values;
    }
    public function write(int $ownerId, string $bindingKey, mixed $value): void
    {
        $binding = FieldCatalog::nativeBindings()[$bindingKey] ?? throw new \InvalidArgumentException('Unknown native binding.');
        $table = $binding['table'] === 'user' ? User::tableName() : Profile::tableName();
        if ($binding['table'] === 'profile' && $this->one((new Query())->select('user_id')->from($table)->where(['user_id' => $ownerId]), true) === []) {
            throw new \humhub\modules\matcherProfile\domain\ProfileException('NATIVE_PROFILE_MISSING', 'The native profile must exist before changing profile data.', 409);
        }
        if ($bindingKey === 'real_name') {
            if ($value !== null && $this->all($ownerId, true)['real_name'] === $value) { return; }
            $columns = ['firstname' => $value ?? '', 'lastname' => ''];
        } else { $columns = [$binding['columns'][0] => $value]; }
        $this->db->createCommand()->update($table, $columns, [$binding['table'] === 'user' ? 'id' : 'user_id' => $ownerId])->execute();
    }
    private function one(Query $query, bool $currentRead): array
    {
        $command = $query->createCommand($this->db);
        if ($currentRead && $this->db->getTransaction()?->isActive) { $params = $command->params; $command->setSql($command->getSql() . ' FOR SHARE')->bindValues($params); }
        return $command->queryOne() ?: [];
    }
}
