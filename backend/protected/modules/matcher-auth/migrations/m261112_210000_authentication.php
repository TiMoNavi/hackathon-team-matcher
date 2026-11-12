<?php
declare(strict_types=1);

use yii\db\Migration;

final class m261112_210000_authentication extends Migration
{
    public function safeUp()
    {
        $this->createTable('{{%matcher_auth_lock}}', ['lock_key' => $this->char(64)->notNull(), 'revision' => $this->bigInteger()->notNull()->defaultValue(0), 'PRIMARY KEY ([[lock_key]])']);
        $this->createTable('{{%matcher_auth_challenge}}', [
            'id' => $this->string(64)->notNull(), 'email' => $this->string(254)->notNull(), 'email_hash' => $this->char(64)->notNull(),
            'purpose' => $this->string(16)->notNull(), 'browser_hash' => $this->char(64)->notNull(), 'actor_id' => $this->integer(),
            'next_url' => $this->string(64)->notNull(), 'code_hash' => $this->char(64)->notNull(), 'created_at' => $this->integer()->notNull(),
            'expires_at' => $this->integer()->notNull(), 'failed_attempts' => $this->integer()->notNull()->defaultValue(0),
            'status' => $this->string(24)->notNull(), 'PRIMARY KEY ([[id]])',
        ]);
        $this->createIndex('idx_matcher_auth_challenge_email_time', '{{%matcher_auth_challenge}}', ['email_hash', 'created_at']);
        $this->createTable('{{%matcher_auth_attempt}}', ['id' => $this->primaryKey(), 'email_hash' => $this->char(64)->notNull(), 'created_at' => $this->integer()->notNull()]);
        $this->createIndex('idx_matcher_auth_attempt_email_time', '{{%matcher_auth_attempt}}', ['email_hash', 'created_at']);
        $this->createTable('{{%matcher_auth_receipt}}', [
            'id' => $this->string(64)->notNull(), 'provider' => $this->string(32)->notNull(), 'subject' => $this->string(254)->notNull(),
            'verified_email' => $this->string(254)->notNull(), 'purpose' => $this->string(16)->notNull(),
            'browser_hash' => $this->char(64)->notNull(), 'actor_id' => $this->integer(), 'created_at' => $this->integer()->notNull(),
            'expires_at' => $this->integer()->notNull(), 'status' => $this->string(24)->notNull(), 'user_id' => $this->integer(), 'PRIMARY KEY ([[id]])',
        ]);
        // This unique claim is a concurrency/ownership guard, never an identity lookup source.
        // Every login/bind still re-reads native user_auth; deleting/reassigning a native row does not silently move its claim.
        $this->createTable('{{%matcher_auth_identity_claim}}', [
            'provider' => $this->string(32)->notNull(), 'subject_hash' => $this->char(64)->notNull(), 'user_id' => $this->integer()->notNull(),
            'PRIMARY KEY ([[provider]], [[subject_hash]])',
        ]);
        $this->createTable('{{%matcher_auth_import}}', [
            'owner_id' => $this->integer()->notNull(), 'provider_subject' => $this->string(32)->notNull(),
            'reason' => $this->string(32)->notNull(), 'state' => $this->string(24)->notNull(),
            'request_key' => $this->string(96)->notNull(), 'created_at' => $this->integer()->notNull(),
            'attempted_at' => $this->integer(), 'source_id' => $this->string(64), 'PRIMARY KEY ([[owner_id]])',
        ]);
    }

    public function safeDown() { throw new \LogicException('Authentication receipts require a reviewed retention and account handover.'); }
}
