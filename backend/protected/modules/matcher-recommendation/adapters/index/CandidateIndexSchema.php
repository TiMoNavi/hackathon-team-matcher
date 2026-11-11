<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\index;
use yii\db\{Connection, Schema};

/** Explicit DDL only; runtime acquire never creates tables or installs a module. */
final class CandidateIndexSchema
{
    public const TERM_TABLE = '{{%matcher_recommendation_search_term}}';
    public const INTERVAL_TABLE = '{{%matcher_recommendation_search_interval}}';

    public static function install(Connection $db): void
    {
        $db->createCommand()->createTable(self::TERM_TABLE, [
            'generation' => Schema::TYPE_STRING . '(64) NOT NULL',
            'space_id' => Schema::TYPE_INTEGER . ' NOT NULL',
            'target_id' => Schema::TYPE_INTEGER . ' NOT NULL',
            'route' => Schema::TYPE_STRING . '(16) NOT NULL',
            'feature' => Schema::TYPE_STRING . '(64) NOT NULL',
            'term' => Schema::TYPE_CHAR . '(64) NOT NULL',
        ])->execute();
        $db->createCommand()->createIndex('matcher_rec_term_unique', self::TERM_TABLE, ['generation', 'space_id', 'target_id', 'route', 'feature', 'term'], true)->execute();
        $db->createCommand()->createIndex('matcher_rec_term_lookup', self::TERM_TABLE, ['generation', 'space_id', 'route', 'feature', 'term', 'target_id'])->execute();
        $db->createCommand()->createTable(self::INTERVAL_TABLE, [
            'generation' => Schema::TYPE_STRING . '(64) NOT NULL',
            'space_id' => Schema::TYPE_INTEGER . ' NOT NULL',
            'target_id' => Schema::TYPE_INTEGER . ' NOT NULL',
            'feature' => Schema::TYPE_STRING . '(64) NOT NULL',
            'starts_at' => Schema::TYPE_DOUBLE . ' NOT NULL',
            'ends_at' => Schema::TYPE_DOUBLE . ' NOT NULL',
        ])->execute();
        $db->createCommand()->createIndex('matcher_rec_interval_unique', self::INTERVAL_TABLE, ['generation', 'space_id', 'target_id', 'feature', 'starts_at', 'ends_at'], true)->execute();
    }

    public static function remove(Connection $db): void
    {
        $db->createCommand()->dropTable(self::INTERVAL_TABLE)->execute();
        $db->createCommand()->dropTable(self::TERM_TABLE)->execute();
    }
}
