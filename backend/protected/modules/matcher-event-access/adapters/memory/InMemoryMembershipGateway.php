<?php
declare(strict_types=1);
namespace humhub\modules\matcherEventAccess\adapters\memory;
use humhub\modules\matcherEventAccess\domain\EventAccessException as Failure;
use humhub\modules\matcherEventAccess\domain\ports\MembershipGateway;
final class InMemoryMembershipGateway implements MembershipGateway
{
    public array $users=[],$spaces=[],$members=[],$issuers=[],$blocked=[];
    public int $nextId=1,$joins=0;
    public bool $failAfterJoin=false;
    public function assertActor(int $actorId): void { if($actorId<1)throw new Failure('AUTHENTICATION_REQUIRED','Sign in.',401);if(!($this->users[$actorId]??false))throw new Failure('ACCESS_DENIED','Account unavailable.',403); }
    public function assertIssuer(int $actorId,int $spaceId): void
    { $this->assertCanAccept($actorId,$spaceId);if(!($this->issuers[$actorId.':'.$spaceId]??false)||$this->current($actorId,$spaceId)===null)throw new Failure('ACCESS_DENIED','Invite permission required.',403); }
    public function assertCanAccept(int $actorId,int $spaceId): void
    { $this->assertActor($actorId);if(!($this->spaces[$spaceId]['enabled']??false)||($this->blocked[$actorId.':'.$spaceId]??false))throw new Failure('ACCESS_DENIED','Space unavailable.',403); }
    public function current(int $actorId,int $spaceId): ?array
    { try{$this->assertCanAccept($actorId,$spaceId);}catch(Failure){return null;}return $this->members[$actorId.':'.$spaceId]??null; }
    public function join(int $actorId,int $spaceId): array
    { $this->assertCanAccept($actorId,$spaceId);if($old=$this->current($actorId,$spaceId))return $old;$row=['membership_id'=>$this->nextId++,'membership_role'=>'member'];$this->members[$actorId.':'.$spaceId]=$row;++$this->joins;if($this->failAfterJoin)throw new Failure('MEMBERSHIP_UNAVAILABLE','Synthetic rollback.',503);return $row; }
    public function joined(int $actorId,int $afterId,int $limit): array
    { $this->assertActor($actorId);$rows=[];foreach($this->spaces as $id=>$space)if($id>$afterId&&($member=$this->current($actorId,$id)))$rows[]=['space_id'=>$id,'name'=>$space['name']]+$member;usort($rows,fn($a,$b)=>$a['space_id']<=>$b['space_id']);return array_slice($rows,0,$limit); }
}
