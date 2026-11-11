<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\persistence;
use humhub\modules\matcherProfile\domain\ports\ProfileSourceRepository;
use yii\db\Connection;
use yii\db\JsonExpression;
use yii\db\Query;
final class SqlProfileSourceRepository implements ProfileSourceRepository
{
    public function __construct(private Connection $db) {}
    public function transaction(callable $callback): mixed { return $this->db->transaction($callback); }
    public function listSources(int $ownerId): array { return array_map(fn($r)=>$this->source($r),(new Query())->from('{{%matcher_profile_source}}')->where(['owner_id'=>$ownerId])->andWhere(['<>','status','deleted'])->orderBy(['created_at'=>SORT_DESC,'id'=>SORT_DESC])->limit(100)->all($this->db)); }
    public function hasSourceHistory(int $ownerId,string $kind): bool { return (new Query())->from('{{%matcher_profile_source}}')->where(['owner_id'=>$ownerId,'kind'=>$kind])->exists($this->db); }
    public function findSource(string $id,bool $lock=false): ?array
    {
        $sql='SELECT * FROM {{%matcher_profile_source}} WHERE id=:id'.($lock?' FOR UPDATE':'');$r=$this->db->createCommand($sql,[':id'=>$id])->queryOne();return $r?$this->source($r):null;
    }
    public function findSourceKey(int $ownerId,string $kind,string $key): ?array { $r=(new Query())->from('{{%matcher_profile_source}}')->where(['owner_id'=>$ownerId,'kind'=>$kind,'source_key'=>$key])->andWhere(['<>','status','deleted'])->one($this->db);return $r?$this->source($r):null; }
    public function saveSource(array $source): void { $this->save('matcher_profile_source',$source); }
    public function findSnapshot(string $id): ?array { $r=(new Query())->from('{{%matcher_profile_source_snapshot}}')->where(['id'=>$id])->one($this->db);if(!$r)return null;$r['content']=$this->decode($r['content_json']);unset($r['content_json']);$r['version']=(int)$r['version'];return $r; }
    public function saveSnapshot(array $snapshot): void { $snapshot['content_json']=new JsonExpression($snapshot['content']);unset($snapshot['content']);$this->save('matcher_profile_source_snapshot',$snapshot); }
    public function purgeSnapshots(string $sourceId): void { $this->db->createCommand()->delete('{{%matcher_profile_source_snapshot}}',['source_id'=>$sourceId])->execute(); }
    public function findJob(string $id): ?array { $r=(new Query())->from('{{%matcher_profile_source_job}}')->where(['id'=>$id])->one($this->db);if(!$r)return null;$r['result']=$this->decode($r['result_json']);unset($r['result_json']);$r['owner_id']=(int)$r['owner_id'];$r['source_version']=(int)$r['source_version'];return $r; }
    public function saveJob(array $job): void { $job['result_json']=new JsonExpression($job['result']);unset($job['result']);$this->save('matcher_profile_source_job',$job); }
    public function changeJobApplicability(string $sourceId,string $applicability): void { $this->db->createCommand()->update('{{%matcher_profile_source_job}}',['applicability'=>$applicability],['source_id'=>$sourceId])->execute(); }
    private function save(string $table,array $data): void { $id=$data['id'];if((new Query())->from('{{%'.$table.'}}')->where(['id'=>$id])->exists($this->db)){unset($data['id']);$this->db->createCommand()->update('{{%'.$table.'}}',$data,['id'=>$id])->execute();}else{$this->db->createCommand()->insert('{{%'.$table.'}}',$data)->execute();} }
    private function source(array $r): array { $r['owner_id']=(int)$r['owner_id'];$r['version']=(int)$r['version'];return $r; }
    private function decode(mixed $v): array { return is_array($v)?$v:json_decode($v,true,64,JSON_THROW_ON_ERROR); }
}
