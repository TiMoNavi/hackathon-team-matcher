<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\native;
use yii\db\{Connection, Schema};

/** Own-table DDL only. Runtime selection never creates tables or edits HumHub's native session table. */
final class CurrentEventSelectionSchema
{
    public const TABLE = '{{%matcher_recommendation_current_selection}}';

    public static function install(Connection $db): void
    {
        $db->createCommand()->createTable(self::TABLE, [
            'actor_id' => Schema::TYPE_INTEGER . ' NOT NULL',
            'session_hash' => Schema::TYPE_CHAR . '(64) NOT NULL',
            'space_id' => Schema::TYPE_INTEGER . ' NOT NULL',
            'selection_revision' => Schema::TYPE_STRING . '(64) NOT NULL',
            'PRIMARY KEY ([[actor_id]], [[session_hash]])',
        ])->execute();
    }

    public static function remove(Connection $db): void { $db->createCommand()->dropTable(self::TABLE)->execute(); }
}
