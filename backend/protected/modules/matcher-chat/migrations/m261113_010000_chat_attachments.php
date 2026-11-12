<?php
declare(strict_types=1);
use yii\db\Migration;

/** Native file references and permanent upload tombstones, never file/message bodies. */
final class m261113_010000_chat_attachments extends Migration
{
    public function safeUp()
    {
        $this->createTable('{{%matcher_chat_attachment}}', [
            'attachment_id' => $this->char(36)->notNull(), 'message_id' => $this->integer()->notNull(), 'user_id' => $this->integer()->notNull(),
            'client_upload_id' => $this->char(36)->notNull(), 'file_id' => $this->integer()->notNull(), 'file_guid' => $this->char(36)->notNull(),
            'state' => $this->string(12)->notNull(), 'name' => $this->string(180)->notNull(), 'mime' => $this->string(64)->notNull(),
            'size' => $this->integer()->notNull(), 'sha256' => $this->char(64)->notNull(), 'payload_hash' => $this->char(64)->notNull(),
            'created_at' => $this->bigInteger()->notNull(), 'expires_at' => $this->bigInteger()->notNull(), 'uploaded_at' => $this->bigInteger(),
            'entry_id' => $this->integer(), 'position' => $this->smallInteger(), 'cleaned_at' => $this->bigInteger(),
            'PRIMARY KEY ([[attachment_id]])',
        ], 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin');
        $this->createIndex('uq_matcher_chat_upload_key', '{{%matcher_chat_attachment}}', ['message_id', 'user_id', 'client_upload_id'], true);
        $this->createIndex('uq_matcher_chat_attachment_file', '{{%matcher_chat_attachment}}', 'file_id', true);
        $this->createIndex('uq_matcher_chat_attachment_guid', '{{%matcher_chat_attachment}}', 'file_guid', true);
        $this->createIndex('uq_matcher_chat_attachment_position', '{{%matcher_chat_attachment}}', ['entry_id', 'position'], true);
        $this->createIndex('idx_matcher_chat_attachment_owner', '{{%matcher_chat_attachment}}', ['user_id', 'state', 'expires_at']);
        $this->createIndex('idx_matcher_chat_attachment_quota', '{{%matcher_chat_attachment}}', ['user_id', 'uploaded_at']);
    }
    public function safeDown() { throw new \LogicException('Attachment history and upload keys require a reviewed migration.'); }
}
