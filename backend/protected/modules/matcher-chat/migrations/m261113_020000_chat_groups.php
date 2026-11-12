<?php
declare(strict_types=1);
use yii\db\Migration;

/** Lifecycle metadata only. Native message and user_message remain authoritative. */
final class m261113_020000_chat_groups extends Migration
{
    public function safeUp()
    {
        $this->alterColumn('{{%matcher_chat_conversation}}', 'pair_low', $this->integer()->null());
        $this->alterColumn('{{%matcher_chat_conversation}}', 'pair_high', $this->integer()->null());
        $this->addColumn('{{%matcher_chat_conversation}}', 'owner_id', $this->integer()->null());
        $this->addColumn('{{%matcher_chat_member}}', 'version', $this->bigInteger()->notNull()->defaultValue(1));
        $this->createTable('{{%matcher_chat_group_invitation}}', [
            'id' => $this->primaryKey(), 'message_id' => $this->integer()->notNull(),
            'inviter_id' => $this->integer()->notNull(), 'invitee_id' => $this->integer()->notNull(),
            'pending_invitee_id' => $this->integer()->null(), 'status' => $this->string(16)->notNull(),
            'version' => $this->bigInteger()->notNull(), 'created_at' => $this->char(20)->notNull(),
            'expires_at' => $this->char(20)->notNull(), 'resolved_at' => $this->char(20)->null(),
        ], 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin');
        $this->createIndex('uq_matcher_chat_group_pending', '{{%matcher_chat_group_invitation}}', ['message_id', 'pending_invitee_id'], true);
        $this->createIndex('idx_matcher_chat_group_invitee', '{{%matcher_chat_group_invitation}}', ['invitee_id', 'id']);
        $this->createTable('{{%matcher_chat_group_receipt}}', [
            'actor_id' => $this->integer()->notNull(), 'operation' => $this->string(16)->notNull(),
            'client_command_id' => $this->char(36)->notNull(), 'payload_hash' => $this->char(64)->notNull(),
            'message_id' => $this->integer()->notNull(), 'invitation_id' => $this->integer()->null(),
            'created_at' => $this->bigInteger()->notNull(), 'PRIMARY KEY ([[actor_id]], [[operation]], [[client_command_id]])',
        ], 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin');
        $this->createIndex('idx_matcher_chat_group_quota', '{{%matcher_chat_group_receipt}}', ['actor_id', 'operation', 'created_at']);
    }
    public function safeDown() { throw new \LogicException('Group memberships and permanent invitation receipts require a reviewed retention migration.'); }
}
