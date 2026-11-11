<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\persistence;
use yii\db\{Connection, Schema};

/** Explicit installation only, containing recommendation-owned data and no production defaults. */
final class RecommendationStorageSchema
{
    public const DRAFT_TABLE = '{{%matcher_recommendation_policy_draft}}';
    public const PUBLISHED_TABLE = '{{%matcher_recommendation_policy_published}}';
    public const ACTIVE_TABLE = '{{%matcher_recommendation_policy_active}}';
    public const BATCH_TABLE = '{{%matcher_recommendation_discovery_batch}}';

    public static function install(Connection $db): void
    {
        $payload = $db->driverName === 'mysql' ? 'MEDIUMTEXT NOT NULL' : Schema::TYPE_TEXT . ' NOT NULL';
        $db->createCommand()->createTable(self::DRAFT_TABLE, [
            'id' => Schema::TYPE_STRING . '(128) NOT NULL',
            'revision' => Schema::TYPE_INTEGER . ' NOT NULL',
            'lock_version' => Schema::TYPE_INTEGER . ' NOT NULL DEFAULT 0',
            'payload_json' => $payload,
            'payload_digest' => Schema::TYPE_CHAR . '(64) NOT NULL',
            'PRIMARY KEY ([[id]])',
        ])->execute();
        $db->createCommand()->createTable(self::PUBLISHED_TABLE, [
            'version' => Schema::TYPE_STRING . '(128) NOT NULL',
            'payload_json' => $payload,
            'payload_digest' => Schema::TYPE_CHAR . '(64) NOT NULL',
            'PRIMARY KEY ([[version]])',
        ])->execute();
        $db->createCommand()->createTable(self::ACTIVE_TABLE, [
            'slot' => Schema::TYPE_INTEGER . ' NOT NULL',
            'active_version' => Schema::TYPE_STRING . '(128) NULL',
            'lock_version' => Schema::TYPE_INTEGER . ' NOT NULL DEFAULT 0',
            'PRIMARY KEY ([[slot]])',
        ])->execute();
        $db->createCommand()->insert(self::ACTIVE_TABLE, ['slot' => 1, 'active_version' => null, 'lock_version' => 0])->execute();
        $db->createCommand()->createTable(self::BATCH_TABLE, [
            'id' => Schema::TYPE_CHAR . '(64) NOT NULL',
            'payload_json' => $payload,
            'payload_digest' => Schema::TYPE_CHAR . '(64) NOT NULL',
            'expires_at' => Schema::TYPE_STRING . '(26) NOT NULL',
            'PRIMARY KEY ([[id]])',
        ])->execute();
        $db->createCommand()->createIndex('matcher_rec_batch_expiry', self::BATCH_TABLE, ['expires_at', 'id'])->execute();
    }

    public static function remove(Connection $db): void
    {
        foreach ([self::BATCH_TABLE, self::ACTIVE_TABLE, self::PUBLISHED_TABLE, self::DRAFT_TABLE] as $table) { $db->createCommand()->dropTable($table)->execute(); }
    }
}
