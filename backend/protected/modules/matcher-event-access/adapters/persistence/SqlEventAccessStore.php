<?php
declare(strict_types=1);
namespace humhub\modules\matcherEventAccess\adapters\persistence;
use humhub\modules\matcherEventAccess\domain\EventAccessException as Failure;
use humhub\modules\matcherEventAccess\domain\ports\EventAccessStore;
use yii\db\{Connection,Query,Transaction};
final class SqlEventAccessStore implements EventAccessStore
{
    public function __construct(public readonly Connection $db){}
    public function transaction(callable $operation): mixed
    {
        if($this->db->getTransaction()?->isActive)throw new Failure('DEPENDENCY_UNAVAILABLE','Use an independent event-access unit of work.',503);
        $logging=$this->db->enableLogging;$profiling=$this->db->enableProfiling;$this->db->enableLogging=$this->db->enableProfiling=false;
        try{return $this->db->transaction(function()use($operation){$this->lock(['module-unit-of-work']);return $operation();},Transaction::SERIALIZABLE);}
        finally{$this->db->enableLogging=$logging;$this->db->enableProfiling=$profiling;}
    }
    public function lock(array $keys): void
    {
        if(!$this->db->getTransaction()?->isActive)throw new \LogicException('Event locks require a transaction.');
        $keys=array_unique($keys);sort($keys,SORT_STRING);
        foreach($keys as $key){$digest=hash('sha256',$key);$sql=match($this->db->driverName){
            'mysql'=>'INSERT INTO {{%matcher_event_lock}} (lock_key,revision) VALUES (:key,1) ON DUPLICATE KEY UPDATE revision=revision+1',
            'sqlite','pgsql'=>'INSERT INTO {{%matcher_event_lock}} (lock_key,revision) VALUES (:key,1) ON CONFLICT(lock_key) DO UPDATE SET revision=matcher_event_lock.revision+1',
            default=>throw new Failure('DEPENDENCY_UNAVAILABLE','Unsupported database.',503)};$this->db->createCommand($sql,[':key'=>$digest])->execute();}
    }
    private function one(string $table,array $where): ?array
    {
        [$sql,$params]=$this->db->getQueryBuilder()->build((new Query())->from($table)->where($where)->limit(1));
        if($this->db->driverName!=='sqlite'&&$this->db->getTransaction()?->isActive)$sql.=' FOR UPDATE';
        $command=$this->db->createCommand($sql,$params)->noCache();
        $row=$command->queryOne();return $row===false?null:$this->typed($row);
    }
    public function invitation(string $id): ?array{return $this->one('{{%matcher_event_invitation}}',['id'=>$id]);}
    public function invitationByDigest(string $digest): ?array{return $this->one('{{%matcher_event_invitation}}',['token_digest'=>$digest]);}
    public function saveInvitation(array $invitation): void{$this->db->createCommand()->upsert('{{%matcher_event_invitation}}',$invitation)->execute();}
    public function receipt(string $id): ?array{return $this->one('{{%matcher_event_receipt}}',['id'=>$id]);}
    public function receiptFor(string $invitationId,int $actorId): ?array{return $this->one('{{%matcher_event_receipt}}',['invitation_id'=>$invitationId,'actor_id'=>$actorId]);}
    public function saveReceipt(array $receipt): void{$this->db->createCommand()->insert('{{%matcher_event_receipt}}',$receipt)->execute();}
    public function replay(string $key): ?array{return $this->one('{{%matcher_event_idempotency}}',['request_key'=>$key]);}
    public function saveReplay(string $key,string $requestHash,string $kind,string $resourceId): void{$this->db->createCommand()->insert('{{%matcher_event_idempotency}}',['request_key'=>$key,'request_hash'=>$requestHash,'kind'=>$kind,'resource_id'=>$resourceId])->execute();}
    public function attempt(int $actorId,string $operation,int $now,int $window,int $maximum): void
    {
        $this->transaction(function()use($actorId,$operation,$now,$window,$maximum):void{
            $count=(new Query())->from('{{%matcher_event_attempt}}')->where(['actor_id'=>$actorId,'operation'=>$operation])->andWhere(['>','created_at',$now-$window])->count('*',$this->db);
            if((int)$count>=$maximum)throw new Failure('RATE_LIMITED','Too many attempts. Try again later.',429);
            $this->db->createCommand()->insert('{{%matcher_event_attempt}}',['actor_id'=>$actorId,'operation'=>$operation,'created_at'=>$now])->execute();
        });
    }
    private function typed(array $row): array
    { foreach(['space_id','issuer_id','actor_id','membership_id','version','expires_at','max_uses','uses','created_at','revoked_at'] as $key)if(isset($row[$key]))$row[$key]=(int)$row[$key];if(isset($row['consumed_use']))$row['consumed_use']=(bool)$row['consumed_use'];return $row; }
}
