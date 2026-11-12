<?php
declare(strict_types=1);
namespace humhub\modules\matcherEventAccess\adapters\native;
use humhub\modules\matcherEventAccess\domain\EventAccessException as Failure;
use humhub\modules\space\models\{Space,Membership};
use humhub\modules\space\MemberEvent;
use humhub\modules\space\activities\MemberAddedActivity;
use humhub\modules\space\notifications\{InviteAccepted,ApprovalRequestAccepted};
use humhub\modules\activity\services\ActivityManager;
use humhub\modules\user\models\{User,Follow};
use humhub\modules\user\events\FollowEvent;
use humhub\modules\notification\jobs\SendNotification;
use humhub\modules\content\models\ContentContainerBlockedUsers;
use yii\base\{Event,ModelEvent};
use yii\db\{Connection,Query};
use yii\queue\{Queue,PushEvent};
use Yii;

/** Scoped native capture, then durable post-commit dispatch. No global notification disable. */
final class NativeMembershipLifecycle
{
    private array $pending=[];
    private bool $capturing=false;
    public function __construct(private Connection $db){}
    public function capture(Space $space,int $actorId,callable $join): void
    {
        if($this->capturing||!$this->db->getTransaction()?->isActive)throw new Failure('NATIVE_LIFECYCLE_UNSUPPORTED','Membership capture requires one transaction.',503);
        $queue=Yii::$app->queue;
        if(!$queue instanceof Queue)throw new Failure('NATIVE_LIFECYCLE_UNSUPPORTED','A reviewed native queue is required.',503);
        $membershipEvents=['init','afterFind','appendRules','beforeValidate','afterValidate','beforeInsert','afterInsert','beforeUpdate','afterUpdate'];
        foreach($membershipEvents as $name)LifecycleGuard::classEvent(Membership::class,$name,true);
        $membership=$space->getMembership($actorId)??new Membership();
        foreach($membershipEvents as $name)LifecycleGuard::instanceEvent($membership,$name,true);
        foreach([[Membership::class,Membership::EVENT_MEMBER_ADDED],[ActivityManager::class,ActivityManager::EVENT_BEFORE_DISPATCH],[Follow::class,Follow::EVENT_FOLLOWING_REMOVED]] as [$class,$name])LifecycleGuard::classEvent($class,$name);
        LifecycleGuard::instanceEvent($queue,Queue::EVENT_BEFORE_PUSH,false);
        foreach(['init','afterFind','beforeDelete','afterDelete'] as $name)LifecycleGuard::classEvent(Follow::class,$name,true,$name==='beforeDelete'?[
            [\humhub\modules\file\Events::class,'onBeforeActiveRecordDelete'],[\humhub\models\RecordMap::class,'onActiveRecordDelete'],[\humhub\modules\notification\Events::class,'onActiveRecordDelete'],
        ]:[]);
        $follow=$space->getFollowRecord($actorId);
        if($follow!==null){
            foreach(['beforeDelete','afterDelete',Follow::EVENT_FOLLOWING_REMOVED] as $name)LifecycleGuard::instanceEvent($follow,$name,true);
            // Reviewed generic cleanup hooks are safe only when they cannot delete external files or recurse.
            $model=\humhub\components\behaviors\PolymorphicRelation::getObjectModel($follow);
            if(\humhub\modules\file\models\File::find()->where(['object_model'=>$model,'object_id'=>$follow->id])->exists()
                ||\humhub\models\RecordMap::find()->where(['model'=>Follow::class,'pk'=>$follow->id])->exists())$this->unsupported();
        }
        $spaceId=(int)$space->id;$this->pending=[];$this->capturing=true;
        $member=function(MemberEvent $event)use($spaceId,$actorId):void{
            if((int)$event->space->id!==$spaceId||(int)$event->user->id!==$actorId)$this->unsupported();
            $this->pending[]=['kind'=>'member_added'];$event->handled=true;
        };
        $activity=function(ModelEvent $event)use($spaceId,$actorId):void{
            // Yii Event replaces ModelEvent::data with handler data. Verify the bounded dispatch frame instead.
            $args=null;foreach(debug_backtrace(0,8) as $frame)if(($frame['class']??null)===ActivityManager::class&&($frame['function']??null)==='dispatch'){$args=$frame['args']??null;break;}
            if(!is_array($args)||($args[0]??null)!==MemberAddedActivity::class||!($args[1]??null) instanceof Space||(int)$args[1]->id!==$spaceId||!($args[2]??null) instanceof User||(int)$args[2]->id!==$actorId)$this->unsupported();
            $this->pending[]=['kind'=>'member_activity'];$event->isValid=false;$event->handled=true;
        };
        $unfollow=function(FollowEvent $event)use($spaceId,$actorId):void{
            if(!$event->target instanceof Space||(int)$event->target->id!==$spaceId||(int)$event->user->id!==$actorId)$this->unsupported();
            $this->pending[]=['kind'=>'follow_removed'];$event->handled=true;
        };
        $push=function(PushEvent $event)use($spaceId):void{
            $job=$event->job;if(!$job instanceof SendNotification)$this->unsupported();$n=$job->notification;$class=get_class($n);
            if(!in_array($class,[InviteAccepted::class,ApprovalRequestAccepted::class],true)||!$n->source instanceof Space||(int)$n->source->id!==$spaceId||!$n->originator instanceof User||!is_numeric($job->recipientId))$this->unsupported();
            $this->pending[]=['kind'=>'notification','class'=>$class,'originator_id'=>(int)$n->originator->id,'recipient_id'=>(int)$job->recipientId];$event->handled=true;
        };
        Event::on(Membership::class,Membership::EVENT_MEMBER_ADDED,$member,null,false);
        Event::on(ActivityManager::class,ActivityManager::EVENT_BEFORE_DISPATCH,$activity,null,false);
        Event::on(Follow::class,Follow::EVENT_FOLLOWING_REMOVED,$unfollow,null,false);
        $queue->on(Queue::EVENT_BEFORE_PUSH,$push,null,false);
        try{if($join()!==true)throw new Failure('MEMBERSHIP_UNAVAILABLE','Native membership creation failed.',503);}
        catch(\Throwable $e){$this->pending=[];throw $e;}
        finally{Event::off(Membership::class,Membership::EVENT_MEMBER_ADDED,$member);Event::off(ActivityManager::class,ActivityManager::EVENT_BEFORE_DISPATCH,$activity);Event::off(Follow::class,Follow::EVENT_FOLLOWING_REMOVED,$unfollow);$queue->off(Queue::EVENT_BEFORE_PUSH,$push);$this->capturing=false;}
    }
    public function persist(int $actorId,int $spaceId,int $membershipId): void
    {
        if(!$this->db->getTransaction()?->isActive)$this->unsupported();
        foreach($this->pending as $sequence=>$payload)$this->db->createCommand()->insert('{{%matcher_event_outbox}}',['id'=>'effect-'.bin2hex(random_bytes(16)),'actor_id'=>$actorId,'space_id'=>$spaceId,'membership_id'=>$membershipId,'sequence'=>$sequence,'payload'=>json_encode($payload,JSON_THROW_ON_ERROR),'status'=>'pending','created_at'=>time(),'updated_at'=>time()])->execute();
        $this->pending=[];
    }
    /** Dispatch only pending effects for this actor. Never retry dispatching/failed uncertain effects automatically. */
    public function flush(int $actorId): void
    {
        if($this->db->getTransaction()?->isActive)$this->unsupported();
        Yii::$app->cache->delete(Membership::USER_SPACES_CACHE_KEY.$actorId);
        Yii::$app->cache->delete(Membership::USER_SPACEIDS_CACHE_KEY.$actorId);
        $rows=(new Query())->from('{{%matcher_event_outbox}}')->where(['actor_id'=>$actorId,'status'=>'pending'])->orderBy(['created_at'=>SORT_ASC,'membership_id'=>SORT_ASC,'sequence'=>SORT_ASC,'id'=>SORT_ASC])->limit(100)->all($this->db);
        foreach($rows as $row){
            if($this->db->createCommand()->update('{{%matcher_event_outbox}}',['status'=>'dispatching','updated_at'=>time()],['id'=>$row['id'],'status'=>'pending'])->execute()!==1)continue;
            try{
                $space=Space::findOne((int)$row['space_id']);$user=User::findOne((int)$row['actor_id']);
                $member=Membership::findOne(['id'=>$row['membership_id'],'user_id'=>$row['actor_id'],'space_id'=>$row['space_id'],'status'=>Membership::STATUS_MEMBER]);
                if(!$space||!$user||!$member||(int)$space->status!==Space::STATUS_ENABLED||(int)$user->status!==User::STATUS_ENABLED||ContentContainerBlockedUsers::find()->where(['contentcontainer_id'=>$space->contentcontainer_id,'user_id'=>$user->id])->exists()){$status='skipped';}
                else{Membership::unsetCache((int)$space->id,(int)$user->id);$this->dispatch(json_decode($row['payload'],true,16,JSON_THROW_ON_ERROR),$space,$user);$status='dispatched';}
            }catch(\Throwable){$status='failed';}
            $this->db->createCommand()->update('{{%matcher_event_outbox}}',['status'=>$status,'updated_at'=>time()],['id'=>$row['id'],'status'=>'dispatching'])->execute();
        }
    }
    public function clearAfterFailure(int $actorId): void
    {
        $this->pending=[];
        Yii::$app->cache->delete(Membership::USER_SPACES_CACHE_KEY.$actorId);
        Yii::$app->cache->delete(Membership::USER_SPACEIDS_CACHE_KEY.$actorId);
        // The service owns this request's transient models only; don't return a cached joined object after rollback.
        Yii::$app->runtimeCache->flush();
    }
    private function dispatch(array $payload,Space $space,User $user): void
    {
        switch($payload['kind']??null){
            case 'member_added':MemberEvent::trigger(Membership::class,Membership::EVENT_MEMBER_ADDED,new MemberEvent(['space'=>$space,'user'=>$user]));break;
            case 'member_activity':ActivityManager::dispatch(MemberAddedActivity::class,$space,$user);break;
            case 'follow_removed':Event::trigger(Follow::class,Follow::EVENT_FOLLOWING_REMOVED,new FollowEvent(['user'=>$user,'target'=>$space]));break;
            case 'notification':$class=$payload['class']??null;if(!in_array($class,[InviteAccepted::class,ApprovalRequestAccepted::class],true))$this->unsupported();$originator=User::findOne((int)$payload['originator_id']);$recipient=User::findOne((int)$payload['recipient_id']);if($originator&&$recipient)$class::instance()->from($originator)->about($space)->send($recipient);break;
            default:$this->unsupported();
        }
    }
    private function unsupported(): never{throw new Failure('NATIVE_LIFECYCLE_UNSUPPORTED','An unreviewed native side effect prevents membership acceptance.',503);}
}
