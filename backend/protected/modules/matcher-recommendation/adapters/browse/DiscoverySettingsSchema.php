<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\browse;
use yii\db\{Connection, Schema};

final class DiscoverySettingsSchema
{
    public const TABLE = '{{%matcher_recommendation_discovery_settings}}';
    public static function install(Connection $db): void
    {
        $db->createCommand()->createTable(self::TABLE, [
            'owner_id' => Schema::TYPE_INTEGER . ' NOT NULL', 'space_id' => Schema::TYPE_INTEGER . ' NOT NULL',
            'discoverable' => Schema::TYPE_BOOLEAN . ' NOT NULL DEFAULT 0', 'version' => Schema::TYPE_INTEGER . ' NOT NULL DEFAULT 1',
            'PRIMARY KEY ([[owner_id]], [[space_id]])',
        ])->execute();
        $db->createCommand()->createIndex('idx_matcher_discovery_space', self::TABLE, ['space_id', 'discoverable', 'owner_id'])->execute();
    }
    public static function remove(Connection $db): void { $db->createCommand()->dropTable(self::TABLE)->execute(); }
}
