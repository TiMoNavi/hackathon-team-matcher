<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\analysis;
use yii\db\{Connection, Schema};

/** Module-owned, session-bound selection metadata only. Explicit migration; never runtime DDL. */
final class SelfAnalysisSelectionSchema
{
    public const TABLE = '{{%matcher_recommendation_self_selection}}';
    public static function install(Connection $db): void
    {
        $db->createCommand()->createTable(self::TABLE, [
            'actor_id' => Schema::TYPE_INTEGER . ' NOT NULL',
            'session_hash' => Schema::TYPE_CHAR . '(64) NOT NULL',
            'context_hash' => Schema::TYPE_CHAR . '(64) NOT NULL',
            'selection_version' => Schema::TYPE_INTEGER . ' NOT NULL',
            'selection_json' => ($db->driverName === 'mysql' ? 'MEDIUMTEXT' : Schema::TYPE_TEXT) . ' NOT NULL',
            'PRIMARY KEY ([[actor_id]], [[session_hash]])',
        ])->execute();
    }
    public static function remove(Connection $db): void { $db->createCommand()->dropTable(self::TABLE)->execute(); }
}
