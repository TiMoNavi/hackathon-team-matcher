<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\persistence;
use humhub\modules\matcherProfile\domain\ports\ProfileAiJobRepository;
use humhub\modules\matcherProfile\domain\ports\ProfileAiJobSessionQuery;
use yii\db\Connection;
use yii\db\Expression;
use yii\db\JsonExpression;
use yii\db\Query;
final class SqlProfileAiJobRepository implements ProfileAiJobRepository, ProfileAiJobSessionQuery
{
    public function __construct(private Connection $db) {}
    public function transaction(callable $callback): mixed { return $this->db->transaction($callback); }
    public function find(string $id,bool $lock=false): ?array { $r=$this->db->createCommand('SELECT * FROM {{%matcher_profile_ai_job}} WHERE id=:id'.($lock?' FOR UPDATE':''),[':id'=>$id])->queryOne();return $r?$this->decode($r):null; }
    public function save(array $job): void { foreach(['context','input','result','metrics','receipts'] as $key){$job[$key.'_json']=new JsonExpression($job[$key]);unset($job[$key]);}$id=$job['id'];if((new Query())->from('{{%matcher_profile_ai_job}}')->where(['id'=>$id])->exists($this->db)){unset($job['id']);$this->db->createCommand()->update('{{%matcher_profile_ai_job}}',$job,['id'=>$id])->execute();}else{$this->db->createCommand()->insert('{{%matcher_profile_ai_job}}',$job)->execute();} }
    public function nextQueued(): ?string { $id=(new Query())->select('id')->from('{{%matcher_profile_ai_job}}')->where(['execution_status'=>'queued','applicability'=>'current'])->orderBy(['created_at'=>SORT_ASC,'id'=>SORT_ASC])->scalar($this->db);return $id===false?null:$id; }
    public function expiredRunning(string $before,?int $ownerId=null): array { $q=(new Query())->from('{{%matcher_profile_ai_job}}')->where(['execution_status'=>'running'])->andWhere(['<=','started_at',$before]);if($ownerId!==null)$q->andWhere(['owner_id'=>$ownerId]);return array_map(fn($r)=>$this->decode($r),$q->orderBy(['started_at'=>SORT_ASC])->limit(100)->all($this->db)); }
    public function countActive(int $ownerId): int { return (int)(new Query())->from('{{%matcher_profile_ai_job}}')->where(['owner_id'=>$ownerId,'applicability'=>'current','execution_status'=>['queued','running']])->count('*',$this->db); }
    public function countSince(int $ownerId,string $since): int { return (int)(new Query())->from('{{%matcher_profile_ai_job}}')->where(['owner_id'=>$ownerId])->andWhere(['>=','created_at',$since])->count('*',$this->db); }
    public function forSession(int $ownerId, string $sessionId, int $limit = 21): array
    {
        // Keep the owner equality eligible for the existing owner/created index;
        // JSON filtering and a capped result avoid an unbounded PHP owner-history scan.
        $session = $this->db->driverName === 'sqlite'
            ? "json_type(context_json, '$.session_id') = 'text' AND json_extract(context_json, '$.session_id') = :session"
            : "JSON_TYPE(JSON_EXTRACT(context_json, '$.session_id')) = 'STRING' AND CAST(JSON_UNQUOTE(JSON_EXTRACT(context_json, '$.session_id')) AS BINARY) = :session";
        $rows = (new Query())->from('{{%matcher_profile_ai_job}}')->where(['owner_id' => $ownerId])
            ->andWhere(new Expression($session, [':session' => $sessionId]))
            ->orderBy(new Expression("CASE WHEN applicability = 'current' AND execution_status IN ('queued','running') THEN 0 ELSE 1 END ASC, updated_at DESC, created_at DESC, id DESC"))
            ->limit(max(1, min(21, $limit)))->all($this->db);
        return array_map(fn(array $row): array => $this->decode($row), $rows);
    }
    public function revokeSource(string $sourceId): void { if($this->db->schema->getTableSchema('{{%matcher_profile_ai_job}}')===null)return;$rows=(new Query())->from('{{%matcher_profile_ai_job}}')->where(['applicability'=>'current'])->all($this->db);foreach($rows as $row){$j=$this->decode($row);if(!isset($j['context']['sources'][$sourceId]))continue;$j['applicability']='revoked';$j['input']=[];$j['result']=[];$j['receipts']=[];if($j['execution_status']==='queued')$j['execution_status']='cancelled';$this->save($j);} }
    private function decode(array $r): array { foreach(['context','input','result','metrics','receipts'] as $key){$r[$key]=is_array($r[$key.'_json'])?$r[$key.'_json']:json_decode($r[$key.'_json'],true,64,JSON_THROW_ON_ERROR);unset($r[$key.'_json']);}foreach(['owner_id','attempt'] as $key)$r[$key]=(int)$r[$key];$r['space_id']=$r['space_id']===null?null:(int)$r['space_id'];return $r; }
}
