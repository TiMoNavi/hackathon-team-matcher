<?php
declare(strict_types=1);
namespace humhub\modules\matcherEventAccess\adapters\native;
use humhub\modules\matcherEventAccess\domain\EventAccessException as Failure;
use humhub\modules\matcherEventAccess\domain\ports\MembershipGateway;
use humhub\modules\space\models\{Space,Membership};
use humhub\modules\space\permissions\InviteUsers;
use humhub\modules\user\models\User;
use humhub\modules\content\models\ContentContainerBlockedUsers;
use yii\db\{Connection,Query};
final class NativeMembershipGateway implements MembershipGateway
{
    public function __construct(private Connection $db,private NativeMembershipLifecycle $lifecycle){}
    public function assertActor(int $actorId): void
    { if($actorId<1)throw new Failure('AUTHENTICATION_REQUIRED','Sign in to continue.',401);$rows=$this->read((new Query())->from(User::tableName())->where(['id'=>$actorId,'status'=>User::STATUS_ENABLED]));if(count($rows)!==1)$this->denied(); }
    public function assertCanAccept(int $actorId,int $spaceId): void
    {
        $this->assertActor($actorId);$rows=$this->read((new Query())->from(Space::tableName())->where(['id'=>$spaceId,'status'=>Space::STATUS_ENABLED]));
        if(count($rows)!==1||(int)$rows[0]['contentcontainer_id']<1)$this->denied();
        if($this->read((new Query())->from(ContentContainerBlockedUsers::tableName())->where(['contentcontainer_id'=>$rows[0]['contentcontainer_id'],'user_id'=>$actorId])))$this->denied();
    }
    public function assertIssuer(int $actorId,int $spaceId): void
    {
        $this->assertCanAccept($actorId,$spaceId);$member=$this->current($actorId,$spaceId);if($member===null)$this->denied();
        $space=$this->read((new Query())->from(Space::tableName())->where(['id'=>$spaceId]))[0]??null;
        if(!$space||!(new LockedInvitePermission($this->db))->allowed((int)$space['contentcontainer_id'],$member['membership_role']))$this->denied();
    }
    public function current(int $actorId,int $spaceId): ?array
    {
        try{$this->assertCanAccept($actorId,$spaceId);}catch(Failure $e){if($e->errorCode==='ACCESS_DENIED')return null;throw $e;}
        $rows=$this->read((new Query())->from(Membership::tableName())->where(['user_id'=>$actorId,'space_id'=>$spaceId,'status'=>Membership::STATUS_MEMBER]));
        if(count($rows)>1)throw new Failure('DEPENDENCY_UNAVAILABLE','Ambiguous native membership.',503);
        if(!$rows)return null;$space=$this->read((new Query())->from(Space::tableName())->where(['id'=>$spaceId]))[0]??null;
        if(!$space)return null;
        $role=self::membershipRole($actorId,(int)$space['created_by'],(string)$rows[0]['group_id']);
        return ['membership_id'=>(int)$rows[0]['id'],'membership_role'=>$role];
    }
    public function join(int $actorId,int $spaceId): array
    {
        if(!$this->db->getTransaction()?->isActive)throw new Failure('DEPENDENCY_UNAVAILABLE','Native membership requires the shared transaction.',503);
        $this->assertCanAccept($actorId,$spaceId);if($member=$this->current($actorId,$spaceId))return $member;
        // Lock all native membership states, including pending applications/invitations.
        $rows=$this->read((new Query())->from(Membership::tableName())->where(['user_id'=>$actorId,'space_id'=>$spaceId]));
        if(count($rows)>1)throw new Failure('DEPENDENCY_UNAVAILABLE','Ambiguous native membership.',503);
        Membership::unsetCache($spaceId,$actorId);$space=Space::findOne($spaceId);
        if(!$space) $this->denied();
        $this->lifecycle->capture($space,$actorId,fn()=> $space->addMember($actorId,1,false,Space::USERGROUP_MEMBER));
        Membership::unsetCache($spaceId,$actorId);$member=$this->current($actorId,$spaceId);
        if($member===null)throw new Failure('MEMBERSHIP_UNAVAILABLE','Native membership was not created.',503);
        $this->lifecycle->persist($actorId,$spaceId,$member['membership_id']);return $member;
    }
    public function joined(int $actorId,int $afterId,int $limit): array
    {
        $this->assertActor($actorId);
        $query=(new Query())->select(['space_id'=>'s.id','name'=>'s.name','membership_id'=>'m.id','membership_role'=>'m.group_id','created_by'=>'s.created_by'])->from(['s'=>Space::tableName()])
            ->innerJoin(['m'=>Membership::tableName()],'[[m.space_id]]=[[s.id]]')->leftJoin(['b'=>ContentContainerBlockedUsers::tableName()],'[[b.contentcontainer_id]]=[[s.contentcontainer_id]] AND [[b.user_id]]=:actor',[':actor'=>$actorId])
            ->where(['m.user_id'=>$actorId,'m.status'=>Membership::STATUS_MEMBER,'s.status'=>Space::STATUS_ENABLED,'b.user_id'=>null])->andWhere(['>','s.id',$afterId])->orderBy(['s.id'=>SORT_ASC])->limit($limit);
        $rows=$this->read($query,false);$out=[];$seen=[];
        foreach($rows as $r){$id=(int)$r['space_id'];if(isset($seen[$id]))throw new Failure('DEPENDENCY_UNAVAILABLE','Ambiguous native membership.',503);$seen[$id]=true;$member=$this->current($actorId,$id);if($member===null||$member['membership_id']!==(int)$r['membership_id'])throw new Failure('CONTEXT_CHANGED','Membership changed during the read.',409);$out[]=['space_id'=>$id,'name'=>(string)$r['name']]+$member;}
        $this->assertActor($actorId);return $out;
    }
    private function read(Query $query,bool $lock=true): array
    {
        [$sql,$params]=$this->db->getQueryBuilder()->build($query);
        if($lock&&$this->db->driverName!=='sqlite'&&$this->db->getTransaction()?->isActive)$sql.=' FOR UPDATE';
        $command=$this->db->createCommand($sql,$params)->noCache();
        return $this->db->useMaster(fn()=>$command->queryAll());
    }
    /** Match native Space::getUserGroup: owner derives from Space, never from an assignable row role. */
    private static function membershipRole(int $actorId,int $creatorId,string $storedRole): string
    { return $actorId===$creatorId?Space::USERGROUP_OWNER:(in_array($storedRole,Membership::getAssignableUserGroups(),true)?$storedRole:Space::USERGROUP_MEMBER); }
    private function denied(): never{throw new Failure('ACCESS_DENIED','The account, activity or invitation permission is unavailable.',403);}
}
