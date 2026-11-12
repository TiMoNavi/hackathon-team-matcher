<?php
declare(strict_types=1);

use yii\db\Migration;

/** Reference/rule metadata only. Native mail retains all message content. */
final class m261112_230000_chat_reading extends Migration
{
    public function safeUp()
    {
        $options = $this->db->driverName === 'mysql' ? 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : null;
        $this->createTable('{{%matcher_chat_lock}}', ['id' => $this->integer()->notNull(), 'PRIMARY KEY ([[id]])'], $options);
        $this->insert('{{%matcher_chat_lock}}', ['id' => 1]);
        $this->createTable('{{%matcher_chat_conversation}}', [
            'message_id' => $this->integer()->notNull(), 'type' => $this->string(16)->notNull(), 'status' => $this->string(16)->notNull(),
            'version' => $this->bigInteger()->notNull()->defaultValue(1), 'last_seq' => $this->bigInteger()->notNull()->defaultValue(0),
            'pair_low' => $this->integer()->notNull(), 'pair_high' => $this->integer()->notNull(),
            'native_members_hash' => $this->char(64)->notNull(), 'native_projection_hash' => $this->char(64)->notNull(),
            'admission_ref' => $this->string(128)->notNull(), 'revocation_ref' => $this->string(128),
            'admitted_at' => $this->integer()->notNull(), 'PRIMARY KEY ([[message_id]])',
        ], $options);
        // No unique user-pair binding here: that fact remains owned by N08.
        $this->createTable('{{%matcher_chat_entry_sequence}}', [
            'entry_id' => $this->integer()->notNull(), 'message_id' => $this->integer()->notNull(), 'seq' => $this->bigInteger()->notNull(),
            'sender_id' => $this->integer(), 'native_type' => $this->integer()->notNull(), 'created_at_utc' => $this->char(20)->notNull(),
            'deleted' => $this->boolean()->notNull()->defaultValue(false), 'projection_hash' => $this->char(64)->notNull(),
            'PRIMARY KEY ([[entry_id]])',
        ], $options);
        $this->createIndex('uq_matcher_chat_seq', '{{%matcher_chat_entry_sequence}}', ['message_id', 'seq'], true);
        $this->createTable('{{%matcher_chat_member}}', [
            'message_id' => $this->integer()->notNull(), 'user_id' => $this->integer()->notNull(), 'generation' => $this->bigInteger()->notNull(),
            'join_seq' => $this->bigInteger()->notNull()->defaultValue(0), 'status' => $this->string(16)->notNull(),
            'PRIMARY KEY ([[message_id]], [[user_id]], [[generation]])',
        ], $options);
        $this->createIndex('idx_matcher_chat_member_viewer', '{{%matcher_chat_member}}', ['user_id', 'message_id']);
        $this->createTable('{{%matcher_chat_read_state}}', [
            'message_id' => $this->integer()->notNull(), 'user_id' => $this->integer()->notNull(), 'generation' => $this->bigInteger()->notNull(),
            'read_seq' => $this->bigInteger()->notNull()->defaultValue(0), 'PRIMARY KEY ([[message_id]], [[user_id]], [[generation]])',
        ], $options);
        $this->createTable('{{%matcher_chat_viewer_revision}}', [
            'user_id' => $this->integer()->notNull(), 'revision' => $this->bigInteger()->notNull()->defaultValue(1),
            'scope_hash' => $this->char(64)->notNull(), 'PRIMARY KEY ([[user_id]])',
        ], $options);
    }

    public function safeDown() { throw new \LogicException('Chat authorization metadata requires a reviewed retention and native-entry handover.'); }
}
