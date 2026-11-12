<?php
declare(strict_types=1);
namespace humhub\modules\matcherEventAccess\application;
use humhub\modules\matcherEventAccess\domain\EventAccessException as Failure;
use humhub\modules\matcherEventAccess\domain\ports\{EventAccessStore, MembershipGateway};

/** Framework-free invitation commands. Membership and persistence share one unit of work. */
final class EventAccessService
{
    private readonly \Closure $clock;
    public const MAX_TTL = 2592000;
    public const MAX_USES = 1000;
    public function __construct(private EventAccessStore $store, private MembershipGateway $members, ?callable $clock = null)
    { $this->clock=$clock===null?time(...):\Closure::fromCallable($clock); }

    public function create(int $actor, int $space, string $expiresAt, int $maxUses, string $key, string $intent): array
    {
        $this->members->assertActor($actor);
        if($space<1||$intent!=='create_invitation'||$maxUses<1||$maxUses>self::MAX_USES)$this->invalid();
        $expires=self::parseTime($expiresAt);$now=($this->clock)();
        $requestKey=self::requestKey($actor,'create',$key);$hash=self::digest([$space,$expires,$maxUses,$intent]);
        $this->store->attempt($actor,'create',$now,3600,20);
        return $this->store->transaction(function()use($actor,$space,$expires,$maxUses,$requestKey,$hash,$now):array{
            $this->store->lock(['actor:'.$actor,'request:'.$requestKey,'space:'.$space]);$this->members->assertIssuer($actor,$space);
            if($old=$this->replay($requestKey,$hash))return $this->invitationView($this->requiredInvitation($old['resource_id']))+['token'=>null,'token_revealed'=>false];
            $currentTime=($this->clock)();
            if($expires<=$currentTime||$expires>$currentTime+self::MAX_TTL)throw new Failure('INVALID_INVITATION_EXPIRY','Choose a future UTC expiry within 30 days.');
            $token=rtrim(strtr(base64_encode(random_bytes(32)),'+/','-_'),'=');
            $row=['id'=>self::id('inv'),'space_id'=>$space,'issuer_id'=>$actor,'token_digest'=>hash('sha256',$token),'version'=>1,'status'=>'active','expires_at'=>$expires,'max_uses'=>$maxUses,'uses'=>0,'created_at'=>$now,'revoked_at'=>null];
            $this->store->saveInvitation($row);$this->store->saveReplay($requestKey,$hash,'invitation',$row['id']);
            return $this->invitationView($row)+['token'=>$token,'token_revealed'=>true];
        });
    }
    public function revoke(int $actor,string $id,int $expectedVersion,string $intent): array
    {
        $this->members->assertActor($actor);self::validId($id,'inv');
        if($expectedVersion<1||$intent!=='revoke_invitation')$this->invalid();
        return $this->store->transaction(function()use($actor,$id,$expectedVersion):array{
            $this->store->lock(['invitation:'.$id]);$row=$this->requiredInvitation($id);$this->members->assertIssuer($actor,$row['space_id']);
            if($row['status']==='revoked'&&$expectedVersion===$row['version']-1)return $this->invitationView($row);
            if($row['version']!==$expectedVersion)throw new Failure('INVITATION_VERSION_CONFLICT','Reload the invitation before changing it.',409);
            if($row['status']!=='revoked'){$row['status']='revoked';++$row['version'];$row['revoked_at']=($this->clock)();$this->store->saveInvitation($row);}
            return $this->invitationView($row);
        });
    }
    public function redeem(int $actor,string $token,string $intent,string $key): array
    {
        $this->members->assertActor($actor);
        if(!preg_match('/^[A-Za-z0-9_-]{43}$/D',$token)||$intent!=='join')$this->invalid();
        $requestKey=self::requestKey($actor,'redeem',$key);$digest=hash('sha256',$token);$hash=self::digest([$digest,$intent]);$now=($this->clock)();
        $this->store->attempt($actor,'redeem',$now,300,30);
        return $this->store->transaction(function()use($actor,$digest,$requestKey,$hash):array{
            $this->store->lock(['actor:'.$actor,'request:'.$requestKey,'token:'.$digest]);
            if($old=$this->replay($requestKey,$hash))return $this->receiptView($this->ownedReceipt($actor,$old['resource_id']));
            $inv=$this->store->invitationByDigest($digest);
            if($inv===null)$this->unavailable();
            $this->store->lock(['invitation:'.$inv['id'],'space:'.$inv['space_id']]);$inv=$this->requiredInvitation($inv['id']);
            if($receipt=$this->store->receiptFor($inv['id'],$actor)){
                $this->store->saveReplay($requestKey,$hash,'receipt',$receipt['id']);return $this->receiptView($receipt);
            }
            $this->activeInvitation($inv);$this->members->assertIssuer($inv['issuer_id'],$inv['space_id']);$this->members->assertCanAccept($actor,$inv['space_id']);
            $member=$this->members->current($actor,$inv['space_id']);$consumed=$member===null;
            if($consumed){
                if($inv['uses']>=$inv['max_uses'])$this->unavailable();
                $member=$this->members->join($actor,$inv['space_id']);
                $this->activeInvitation($inv);$this->members->assertIssuer($inv['issuer_id'],$inv['space_id']);$this->members->assertCanAccept($actor,$inv['space_id']);
                if($this->members->current($actor,$inv['space_id'])===null)throw new Failure('MEMBERSHIP_UNAVAILABLE','Membership could not be confirmed.',503);
                ++$inv['uses'];++$inv['version'];$this->store->saveInvitation($inv);
            }
            $receipt=['id'=>self::id('receipt'),'invitation_id'=>$inv['id'],'actor_id'=>$actor,'space_id'=>$inv['space_id'],'membership_id'=>$member['membership_id'],'outcome'=>$consumed?'joined':'already_member','consumed_use'=>$consumed,'created_at'=>($this->clock)()];
            $this->store->saveReceipt($receipt);$this->store->saveReplay($requestKey,$hash,'receipt',$receipt['id']);
            return $this->receiptView($receipt);
        });
    }
    public function receipt(int $actor,string $id): array
    { $this->members->assertActor($actor);self::validId($id,'receipt');return $this->receiptView($this->ownedReceipt($actor,$id)); }
    public function joined(int $actor,int $afterId,int $limit): array
    { $this->members->assertActor($actor);if($afterId<0||$limit<1||$limit>48)$this->invalid();$rows=$this->members->joined($actor,$afterId,$limit+1);$more=count($rows)>$limit;return ['items'=>array_slice($rows,0,$limit),'has_more'=>$more,'limit'=>$limit]; }
    private function activeInvitation(array $inv): void
    { if($inv['status']!=='active'||$inv['expires_at']<=($this->clock)())$this->unavailable(); }
    private function ownedReceipt(int $actor,string $id): array
    { $receipt=$this->store->receipt($id);if($receipt===null||$receipt['actor_id']!==$actor)throw new Failure('RECEIPT_NOT_FOUND','This receipt was not found.',404);return $receipt; }
    private function requiredInvitation(string $id): array
    { return $this->store->invitation($id)??throw new Failure('INVITATION_NOT_FOUND','This invitation was not found.',404); }
    private function replay(string $key,string $hash): ?array
    { $row=$this->store->replay($key);if($row!==null&&!hash_equals($row['request_hash'],$hash))throw new Failure('IDEMPOTENCY_CONFLICT','This request key was used for different inputs.',409);return $row; }
    private function receiptView(array $row): array
    { $current=$this->members->current($row['actor_id'],$row['space_id']);return ['receipt_id'=>$row['id'],'invitation_id'=>$row['invitation_id'],'space_id'=>$row['space_id'],'membership_id'=>$row['membership_id'],'outcome'=>$row['outcome'],'consumed_use'=>$row['consumed_use'],'created_at'=>gmdate('Y-m-d\TH:i:s\Z',$row['created_at']),'membership_current'=>$current!==null&&$current['membership_id']===$row['membership_id']]; }
    private function invitationView(array $row): array
    { return ['invitation_id'=>$row['id'],'space_id'=>$row['space_id'],'version'=>$row['version'],'status'=>$row['status'],'expires_at'=>gmdate('Y-m-d\TH:i:s\Z',$row['expires_at']),'max_uses'=>$row['max_uses'],'uses'=>$row['uses'],'created_at'=>gmdate('Y-m-d\TH:i:s\Z',$row['created_at'])]; }
    public static function requestKey(int $actor,string $operation,string $key): string
    { if(!preg_match('/^[A-Za-z0-9._:-]{8,128}$/D',$key))throw new Failure('IDEMPOTENCY_KEY_REQUIRED','Provide an Idempotency-Key of 8–128 safe ASCII characters.',400);return hash('sha256',$actor."\0".$operation."\0".$key); }
    public static function validId(string $id,string $kind): void
    { if(!preg_match('/^'.$kind.'-[a-f0-9]{32}$/D',$id))throw new Failure('INVALID_ID','Provide a valid resource ID.'); }
    public static function parseTime(string $value): int
    { $d=\DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:s\Z',$value,new \DateTimeZone('UTC'));if(!$d||$d->format('Y-m-d\TH:i:s\Z')!==$value)throw new Failure('INVALID_INVITATION_EXPIRY','Provide UTC time YYYY-MM-DDTHH:mm:ssZ.');return $d->getTimestamp(); }
    private static function id(string $prefix): string { return $prefix.'-'.bin2hex(random_bytes(16)); }
    private static function digest(array $input): string { return hash('sha256',json_encode($input,JSON_THROW_ON_ERROR)); }
    private function unavailable(): never { throw new Failure('INVITATION_UNAVAILABLE','This invitation cannot be used.',409); }
    private function invalid(): never { throw new Failure('INVALID_REQUEST','Provide the supported fields and explicit confirmation intent.'); }
}
