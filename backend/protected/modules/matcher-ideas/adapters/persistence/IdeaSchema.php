<?php
declare(strict_types=1);
namespace humhub\modules\matcherIdeas\adapters\persistence;
use yii\db\{Connection, Schema};

/** Own tables only. Native user, Space and Messenger rows remain owned by HumHub. */
final class IdeaSchema
{
    public const IDEA = '{{%matcher_idea}}';
    public const ACTIVITY = '{{%matcher_idea_activity}}';
    public const BINDING = '{{%matcher_idea_conversation}}';
    public const DRAFT = '{{%matcher_idea_draft}}';
    public static function install(Connection $db): void
    {
        $options = $db->driverName === 'mysql' ? 'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB' : null;
        if ($db->schema->getTableSchema(self::IDEA, true) === null) {
            $db->createCommand()->createTable(self::IDEA, [
                'id' => Schema::TYPE_PK, 'creator_id' => Schema::TYPE_INTEGER . ' NOT NULL',
                'title' => Schema::TYPE_STRING . '(160) NOT NULL', 'summary' => Schema::TYPE_TEXT . ' NOT NULL',
                'status' => Schema::TYPE_STRING . "(16) NOT NULL DEFAULT 'active'", 'version' => Schema::TYPE_INTEGER . ' NOT NULL DEFAULT 1',
            ], $options)->execute();
            $db->createCommand()->createIndex('idx_matcher_idea_creator', self::IDEA, ['creator_id', 'id'])->execute();
        }
        if ($db->schema->getTableSchema(self::ACTIVITY, true) === null) {
            $db->createCommand()->createTable(self::ACTIVITY, [
                'id' => Schema::TYPE_PK, 'idea_id' => Schema::TYPE_INTEGER . ' NOT NULL', 'space_id' => Schema::TYPE_INTEGER . ' NOT NULL',
                'status' => Schema::TYPE_STRING . "(16) NOT NULL DEFAULT 'published'",
                'members_visible' => Schema::TYPE_BOOLEAN . ' NOT NULL DEFAULT 0', 'version' => Schema::TYPE_INTEGER . ' NOT NULL DEFAULT 1',
            ], $options)->execute();
            $db->createCommand()->createIndex('uq_matcher_idea_space', self::ACTIVITY, ['idea_id', 'space_id'], true)->execute();
            $db->createCommand()->createIndex('idx_matcher_idea_space_page', self::ACTIVITY, ['space_id', 'id'])->execute();
        }
        if ($db->schema->getTableSchema(self::BINDING, true) === null) {
            $db->createCommand()->createTable(self::BINDING, [
                'activity_id' => Schema::TYPE_INTEGER . ' NOT NULL PRIMARY KEY', 'message_id' => Schema::TYPE_INTEGER . ' NOT NULL',
            ], $options)->execute();
            $db->createCommand()->createIndex('uq_matcher_idea_message', self::BINDING, ['message_id'], true)->execute();
        }
        if ($db->schema->getTableSchema(self::DRAFT, true) === null) {
            $db->createCommand()->createTable(self::DRAFT, [
                'id' => Schema::TYPE_PK, 'owner_id' => Schema::TYPE_INTEGER . ' NOT NULL',
                'idea_id' => Schema::TYPE_INTEGER, 'base_version' => Schema::TYPE_INTEGER,
                'fields_json' => Schema::TYPE_TEXT . ' NOT NULL', 'raw_text' => Schema::TYPE_TEXT . ' NOT NULL',
                'status' => Schema::TYPE_STRING . "(16) NOT NULL DEFAULT 'editing'", 'version' => Schema::TYPE_INTEGER . ' NOT NULL DEFAULT 1',
                'confirmed_idea_id' => Schema::TYPE_INTEGER,
            ], $options)->execute();
            $db->createCommand()->createIndex('idx_matcher_idea_draft_owner', self::DRAFT, ['owner_id', 'id'])->execute();
        }
        $db->schema->refresh();
    }
}
