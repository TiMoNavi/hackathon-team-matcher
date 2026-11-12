<?php
declare(strict_types=1);
use yii\db\Migration;

/** Permanent per-conversation/sender keys; hashes/references only, no body copy. */
final class m261112_235000_chat_sending extends Migration
{
    public function safeUp()
    {
        $this->createTable('{{%matcher_chat_send_receipt}}', [
            'message_id' => $this->integer()->notNull(), 'user_id' => $this->integer()->notNull(),
            'client_message_id' => $this->char(36)->notNull(), 'body_hash' => $this->char(64)->notNull(),
            'entry_id' => $this->integer()->notNull(), 'seq' => $this->bigInteger()->notNull(),
            'created_at' => $this->bigInteger()->notNull(),
            'PRIMARY KEY ([[message_id]], [[user_id]], [[client_message_id]])',
        ], 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin');
        $this->createIndex('uq_matcher_chat_send_entry', '{{%matcher_chat_send_receipt}}', 'entry_id', true);
        $this->createIndex('idx_matcher_chat_send_quota', '{{%matcher_chat_send_receipt}}', ['user_id', 'created_at']);
    }
    public function safeDown() { throw new \LogicException('Permanent send receipts require a reviewed migration.'); }
}
