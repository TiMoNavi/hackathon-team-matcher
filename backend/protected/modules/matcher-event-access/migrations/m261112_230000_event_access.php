<?php
declare(strict_types=1);
use yii\db\Migration;
final class m261112_230000_event_access extends Migration
{
    public function safeUp()
    {
        $this->createTable('{{%matcher_event_lock}}',['lock_key'=>$this->char(64)->notNull(),'revision'=>$this->bigInteger()->notNull()->defaultValue(0),'PRIMARY KEY ([[lock_key]])']);
        $this->createTable('{{%matcher_event_invitation}}',[
            'id'=>$this->string(40)->notNull(),'space_id'=>$this->integer()->notNull(),'issuer_id'=>$this->integer()->notNull(),'token_digest'=>$this->char(64)->notNull(),
            'version'=>$this->integer()->notNull(),'status'=>$this->string(16)->notNull(),'expires_at'=>$this->bigInteger()->notNull(),'max_uses'=>$this->integer()->notNull(),
            'uses'=>$this->integer()->notNull()->defaultValue(0),'created_at'=>$this->bigInteger()->notNull(),'revoked_at'=>$this->bigInteger(),'PRIMARY KEY ([[id]])']);
        $this->createIndex('uq_matcher_event_token','{{%matcher_event_invitation}}','token_digest',true);
        $this->createTable('{{%matcher_event_receipt}}',[
            'id'=>$this->string(40)->notNull(),'invitation_id'=>$this->string(40)->notNull(),'actor_id'=>$this->integer()->notNull(),'space_id'=>$this->integer()->notNull(),
            'membership_id'=>$this->integer()->notNull(),'outcome'=>$this->string(24)->notNull(),'consumed_use'=>$this->boolean()->notNull(),'created_at'=>$this->bigInteger()->notNull(),'PRIMARY KEY ([[id]])']);
        $this->createIndex('uq_matcher_event_actor_invite','{{%matcher_event_receipt}}',['invitation_id','actor_id'],true);
        $this->createTable('{{%matcher_event_idempotency}}',['request_key'=>$this->char(64)->notNull(),'request_hash'=>$this->char(64)->notNull(),'kind'=>$this->string(16)->notNull(),'resource_id'=>$this->string(40)->notNull(),'PRIMARY KEY ([[request_key]])']);
        $this->createTable('{{%matcher_event_attempt}}',['id'=>$this->primaryKey(),'actor_id'=>$this->integer()->notNull(),'operation'=>$this->string(16)->notNull(),'created_at'=>$this->bigInteger()->notNull()]);
        $this->createIndex('idx_matcher_event_attempt','{{%matcher_event_attempt}}',['actor_id','operation','created_at']);
        $this->createTable('{{%matcher_event_outbox}}',['id'=>$this->string(40)->notNull(),'actor_id'=>$this->integer()->notNull(),'space_id'=>$this->integer()->notNull(),'membership_id'=>$this->integer()->notNull(),'sequence'=>$this->integer()->notNull(),'payload'=>$this->text()->notNull(),'status'=>$this->string(16)->notNull(),'created_at'=>$this->bigInteger()->notNull(),'updated_at'=>$this->bigInteger()->notNull(),'PRIMARY KEY ([[id]])']);
        $this->createIndex('idx_matcher_event_outbox_actor','{{%matcher_event_outbox}}',['actor_id','status','created_at']);
    }
    public function safeDown(){throw new \LogicException('Invitation receipts and side-effect history require a reviewed retention policy.');}
}
