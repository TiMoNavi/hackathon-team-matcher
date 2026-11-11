<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\index;
use yii\db\{Connection, Schema};

/** Recommendation-owned generation deadlines. DDL is never invoked by a normal read or cleanup. */
final class CandidateIndexLifecycleSchema
{
    public const TABLE = '{{%matcher_recommendation_index_generation}}';

    public static function install(Connection $db): void
    {
        $db->createCommand()->createTable(self::TABLE, [
            'generation' => Schema::TYPE_STRING . '(64) NOT NULL PRIMARY KEY',
            'created_at_us' => Schema::TYPE_BIGINT . ' NOT NULL',
            'expires_at_us' => Schema::TYPE_BIGINT . ' NOT NULL',
        ])->execute();
        $db->createCommand()->createIndex('matcher_rec_generation_expiry', self::TABLE, ['expires_at_us', 'generation'])->execute();
    }

    public static function remove(Connection $db): void { $db->createCommand()->dropTable(self::TABLE)->execute(); }
}
