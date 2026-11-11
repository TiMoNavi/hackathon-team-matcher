<?php
declare(strict_types=1);

namespace humhub\modules\matcherProfile\adapters\identity;

use humhub\modules\matcherProfile\domain\ports\ConfirmedIdentityReader;
use humhub\modules\user\models\Profile;
use yii\db\Connection;
use yii\db\Query;

/** Reads only the confirmed identity marker; no private name/username fallback. */
final class NativeConfirmedIdentityReader implements ConfirmedIdentityReader
{
    public function __construct(private readonly Connection $db) {}

    public function read(int $ownerId, bool $currentRead = false): array
    {
        $empty = ['nickname' => null, 'identity_version' => 0, 'confirmed' => false];
        if ($ownerId <= 0) {
            return $empty;
        }
        // During first enable the module is loaded before its migration creates these tables.
        if ($this->db->schema->getTableSchema('{{%matcher_profile_state}}') === null || $this->db->schema->getTableSchema('{{%matcher_profile_attribute}}') === null) {
            return $empty;
        }
        $profileSchema = $this->db->schema->getTableSchema(Profile::tableName());
        if ($profileSchema === null || !isset($profileSchema->columns['matcher_nickname'])) {
            return $empty;
        }
        $query = (new Query())
            ->select(['nickname' => 'p.matcher_nickname', 'identity_version' => 's.identity_version'])
            ->from(['s' => '{{%matcher_profile_state}}'])
            ->innerJoin(['p' => Profile::tableName()], '[[p.user_id]] = [[s.user_id]]')
            ->innerJoin(['a' => '{{%matcher_profile_attribute}}'], '[[a.state_id]] = [[s.id]]')
            ->where(['s.user_id' => $ownerId, 's.scope_key' => 'global', 'a.native_binding' => 'nickname', 'a.field_key' => 'nickname', 'a.storage_kind' => 'native', 'a.confirmation' => 'confirmed', 'a.visibility' => 'authenticated'])
            ->andWhere(['>', 's.identity_version', 0])
            ->andWhere(['not', ['a.last_confirmed_at' => null]]);
        $command = $query->createCommand($this->db);
        if ($currentRead && $this->db->getTransaction()?->isActive) { $params = $command->params; $command->setSql($command->getSql() . ' FOR SHARE')->bindValues($params); }
        $record = $command->queryOne();
        if ($record === false) {
            return $empty;
        }
        return ['nickname' => $record['nickname'], 'identity_version' => (int) $record['identity_version'], 'confirmed' => true];
    }
}
