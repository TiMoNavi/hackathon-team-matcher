<?php
declare(strict_types=1);
namespace humhub\modules\matcherEventAccess\adapters\memory;
use humhub\modules\matcherEventAccess\domain\EventAccessException as Failure;
use humhub\modules\matcherEventAccess\domain\ports\EventAccessStore;
final class InMemoryEventAccessStore implements EventAccessStore
{
    public array $invitations=[],$receipts=[],$replays=[],$attempts=[];
    public function __construct(private InMemoryMembershipGateway $members){}
    public function transaction(callable $operation): mixed
    { $snapshot=[$this->invitations,$this->receipts,$this->replays,$this->members->members,$this->members->nextId,$this->members->joins];try{return $operation();}catch(\Throwable $e){[$this->invitations,$this->receipts,$this->replays,$this->members->members,$this->members->nextId,$this->members->joins]=$snapshot;throw $e;} }
    public function lock(array $keys): void{}
    public function invitation(string $id): ?array{return $this->invitations[$id]??null;}
    public function invitationByDigest(string $digest): ?array { foreach($this->invitations as $row)if(hash_equals($row['token_digest'],$digest))return $row;return null; }
    public function saveInvitation(array $invitation): void{$this->invitations[$invitation['id']]=$invitation;}
    public function receipt(string $id): ?array{return $this->receipts[$id]??null;}
    public function receiptFor(string $invitationId,int $actorId): ?array { foreach($this->receipts as $row)if($row['invitation_id']===$invitationId&&$row['actor_id']===$actorId)return $row;return null; }
    public function saveReceipt(array $receipt): void{$this->receipts[$receipt['id']]=$receipt;}
    public function replay(string $key): ?array{return $this->replays[$key]??null;}
    public function saveReplay(string $key,string $requestHash,string $kind,string $resourceId): void{$this->replays[$key]=['request_hash'=>$requestHash,'kind'=>$kind,'resource_id'=>$resourceId];}
    public function attempt(int $actorId,string $operation,int $now,int $window,int $maximum): void
    { $key=$actorId.':'.$operation;$recent=array_values(array_filter($this->attempts[$key]??[],fn($time)=>$time>$now-$window));if(count($recent)>=$maximum)throw new Failure('RATE_LIMITED','Too many attempts.',429);$recent[]=$now;$this->attempts[$key]=$recent; }
}
