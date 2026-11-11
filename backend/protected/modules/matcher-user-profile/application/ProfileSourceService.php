<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\application;

use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ports\ProfileAccessPolicy;
use humhub\modules\matcherProfile\domain\ports\ProfileSourceReader;
use humhub\modules\matcherProfile\domain\ports\IdentifiedProfileSourceReader;
use humhub\modules\matcherProfile\domain\ports\ProfileSourceRepository;
use humhub\modules\matcherProfile\domain\ports\ProfileWorkflow;

/** Owner-only import orchestration. External reading is outside database transactions. */
final class ProfileSourceService
{
    public function __construct(private ProfileSourceRepository $repository, private ProfileWorkflow $workflow, private ProfileAccessPolicy $access, private \Closure $readerResolver, private ?\Closure $sourceRevoker = null) {}
    public function capabilities(int $ownerId): array
    {
        $this->authorize($ownerId);$readers=[];
        foreach(['github','resume','web','text'] as $kind){$reader=($this->readerResolver)($kind);$readers[$kind]=$reader instanceof ProfileSourceReader?(['enabled'=>true]+$reader->status($ownerId)):['kind'=>$kind,'enabled'=>false,'available'=>false,'reason'=>'MODULE_UNAVAILABLE'];$readers[$kind]['imported_before']=$this->repository->hasSourceHistory($ownerId,$kind);}
        return ['readers'=>$readers,'generation_mode'=>'rules','llm_calls'=>0];
    }
    public function list(int $ownerId): array { $this->authorize($ownerId);return ['sources'=>array_map(fn(array $s):array=>$this->result($s,false),$this->repository->listSources($ownerId))]; }
    public function get(int $ownerId,string $id): array { $this->authorize($ownerId);return $this->result($this->owned($ownerId,$id)); }
    /** Safe polling never resolves a reader and never loads a snapshot. */
    public function getProgress(int $ownerId, string $id): array
    {
        $this->authorize($ownerId);
        return $this->repository->transaction(function() use ($ownerId, $id): array {
            $source = $this->owned($ownerId, $id);
            $job = $this->lastJob($source);
            return array_intersect_key($source, array_flip(['id','kind','version','status','created_at','updated_at']))
                + ['source_id' => $source['id'], 'last_job' => $job, 'progress' => ProfileProgress::source($source, $job)];
        });
    }
    public function import(int $ownerId,string $kind,array $input,string $requestKey,?string $fingerprint=null): array
    {
        $this->authorize($ownerId,true);$reader=$this->reader($ownerId,$kind);
        $identity=$this->identity($ownerId,$kind,$reader,$input,$fingerprint);$external=$identity['external_id'];$sourceKey=hash('sha256',$external);
        $payload=['kind'=>$kind,'external_id'=>$external];$jobId=$this->requestId($ownerId,'import',$requestKey);$requestHash=self::hash($payload);
        $begun=$this->locked($ownerId,function()use($ownerId,$kind,$external,$identity,$sourceKey,$jobId,$requestHash):array {
            if($prior=$this->repository->findJob($jobId)){ $this->replay($prior,$ownerId,$requestHash);return ['replay'=>$this->owned($ownerId,$prior['source_id'])]; }
            if($existing=$this->repository->findSourceKey($ownerId,$kind,$sourceKey)){$receipt=$this->newJob($jobId,$existing,'import',$requestHash);$receipt['execution_status']='succeeded';$receipt['result']=['reused_source_id'=>$existing['id']];$this->repository->saveJob($receipt);return ['replay'=>$existing];}
            if(count($this->repository->listSources($ownerId))>=20){throw new ProfileException('SOURCE_LIMIT_REACHED','Keep at most 20 active sources.',409);}
            $now=self::now();$source=['id'=>self::uuid(),'owner_id'=>$ownerId,'kind'=>$kind,'source_key'=>$sourceKey,'version'=>1,'status'=>'running','label'=>$identity['label'],'external_id'=>$external,'canonical_url'=>$identity['canonical_url'],'latest_snapshot_id'=>null,'last_job_id'=>$jobId,'created_at'=>$now,'updated_at'=>$now,'deleted_at'=>null];
            $this->repository->saveSource($source);$job=$this->newJob($jobId,$source,'import',$requestHash);$this->repository->saveJob($job);return ['source'=>$source,'job'=>$job];
        });
        if(isset($begun['replay']))return $this->result($begun['replay']);
        return $this->perform($ownerId,$reader,$input,$begun['source'],$begun['job']);
    }
    public function refresh(int $ownerId,string $id,int $expectedVersion,array $input,string $requestKey,?string $fingerprint=null): array
    {
        $this->authorize($ownerId,true);$known=$this->owned($ownerId,$id);$reader=$this->reader($ownerId,$known['kind']);
        // The saved original URL is the only refresh target, including a failed first read.
        if($known['kind']==='web'){
            if($input!==[])$this->invalid('A website refresh does not accept a new target.');
            $input=['url'=>$known['canonical_url'],'ownership'=>'self'];
        }
        $identity=$this->identity($ownerId,$known['kind'],$reader,$input,$fingerprint);$external=$identity['external_id'];
        if($external!==$known['external_id'])throw new ProfileException('SOURCE_IDENTITY_CHANGED','Use a new source for a different identity or file.',409);
        $jobId=$this->requestId($ownerId,'refresh:'.$id,$requestKey);$requestHash=self::hash(['source_id'=>$id,'expected_version'=>$expectedVersion,'external_id'=>$external]);
        $begun=$this->locked($ownerId,function()use($ownerId,$id,$expectedVersion,$jobId,$requestHash):array {
            $source=$this->owned($ownerId,$id,true);
            if($prior=$this->repository->findJob($jobId)){ $this->replay($prior,$ownerId,$requestHash);return ['replay'=>$source]; }
            $this->expect($source,$expectedVersion);$this->repository->changeJobApplicability($id,'superseded');
            ++$source['version'];$source['status']='running';$source['latest_snapshot_id']=null;$source['last_job_id']=$jobId;$source['updated_at']=self::now();
            $job=$this->newJob($jobId,$source,'refresh',$requestHash);$this->repository->saveSource($source);$this->repository->saveJob($job);return ['source'=>$source,'job'=>$job];
        });
        if(isset($begun['replay']))return $this->result($begun['replay']);
        return $this->perform($ownerId,$reader,$input,$begun['source'],$begun['job']);
    }
    public function delete(int $ownerId,string $id,int $expectedVersion): array
    {
        $this->authorize($ownerId,true);
        return $this->locked($ownerId,function()use($ownerId,$id,$expectedVersion):array {
            $source=$this->repository->findSource($id,true);if(!$source||$source['owner_id']!==$ownerId)$this->notFound();
            if($source['status']==='deleted'&&$source['version']===$expectedVersion+1)return $this->result($source);
            $this->expect($source,$expectedVersion);$this->repository->purgeSnapshots($id);$this->repository->changeJobApplicability($id,'revoked');if($this->sourceRevoker!==null)($this->sourceRevoker)($id);
            ++$source['version'];$source['status']='deleted';$source['label']='已删除来源';$source['external_id']=null;$source['canonical_url']=null;$source['source_key']=hash('sha256','deleted:'.$id);$source['latest_snapshot_id']=null;$source['updated_at']=$source['deleted_at']=self::now();
            $this->repository->saveSource($source);return $this->result($source);
        });
    }
    public function apply(int $ownerId,string $id,int $expectedVersion,string $draftId,int $expectedDraftVersion,array $candidateIds,string $requestKey): array
    {
        $this->authorize($ownerId,true);
        if(!array_is_list($candidateIds)||$candidateIds===[]||count($candidateIds)>200||count(array_unique($candidateIds,SORT_REGULAR))!==count($candidateIds))$this->invalid('Select distinct candidate IDs.');
        foreach($candidateIds as $cid){if(!is_string($cid)||!self::safeId($cid))$this->invalid('Select valid candidate IDs.');}
        $jobId=$this->requestId($ownerId,'apply:'.$id,$requestKey);$hash=self::hash([$id,$expectedVersion,$draftId,$expectedDraftVersion,$candidateIds]);
        return $this->locked($ownerId,function()use($ownerId,$id,$expectedVersion,$draftId,$expectedDraftVersion,$candidateIds,$jobId,$hash):array {
            $source=$this->owned($ownerId,$id,true);$this->expect($source,$expectedVersion);
            if($source['status']!=='ready'||!$source['latest_snapshot_id'])throw new ProfileException('SOURCE_NOT_READY','Read this source successfully before selecting candidates.',409);
            $draft=$this->workflow->getDraft($ownerId,null,$draftId);
            if($prior=$this->repository->findJob($jobId)){$this->replay($prior,$ownerId,$hash);return $prior['result']+['draft'=>$draft];}
            if($draft['status']!=='editing'||$draft['draft_version']!==$expectedDraftVersion)throw new ProfileException('DRAFT_VERSION_CONFLICT','This draft changed. Reload before importing.',409);
            if($draft['base_revision']!==$draft['current_revision'])throw new ProfileException('PROFILE_VERSION_CONFLICT','The confirmed profile changed. Review it before importing.',409);
            $snapshot=$this->repository->findSnapshot($source['latest_snapshot_id']);$candidates=array_column($snapshot['content']['candidates'],null,'id');
            if(array_diff($candidateIds,array_keys($candidates))!==[])$this->invalid('Candidate selection does not belong to the current source version.');
            $present=$draft['preview_attributes'];$operations=[];$applied=[];$skipped=[];$defs=FieldCatalog::definitions();
            foreach($candidateIds as $cid){$c=$candidates[$cid];$reason=null;
                foreach($present as $item){if(($item['key']??null)!==$c['key'])continue;if(self::hash($item['value'])===self::hash($c['value'])){$reason='same_value';break;}if($defs[$c['key']]['cardinality']==='one'){$reason='existing_value';break;}}
                if($reason!==null){$skipped[]=['candidate_id'=>$cid,'reason'=>$reason];continue;}
                $op=['key'=>$c['key'],'value'=>$c['value'],'visibility'=>'authenticated'];$operations[]=$op;$present[]=$op;$applied[]=$cid;
            }
            if($operations!==[])$draft=$this->workflow->updateDraft($ownerId,null,$draftId,$expectedDraftVersion,$operations);
            $refs=['source_id'=>$id,'source_version'=>$source['version'],'snapshot_id'=>$snapshot['id'],'draft_id'=>$draftId,'applied'=>$applied,'skipped'=>$skipped,'generation_mode'=>'rules','llm_calls'=>0];
            $job=$this->newJob($jobId,$source,'apply',$hash);$job['execution_status']='succeeded';$job['result']=$refs;$this->repository->saveJob($job);
            return $refs+['draft'=>$draft];
        });
    }
    private function perform(int $ownerId,ProfileSourceReader $reader,array $input,array $source,array $job): array
    {
        try{
            $content=$this->validate($reader->read($ownerId,$input));
            if($content['external_id']!==$source['external_id']||($source['kind']==='web'&&$content['canonical_url']!==$source['canonical_url'])||($source['kind']==='text'&&$content['canonical_url']!==null))throw new ProfileException('SOURCE_IDENTITY_CHANGED','The source identity changed.',409);
            if(in_array($source['kind'],['web','text'],true))$content['metadata']['ownership_basis']='self_declared';
            $error=null;
        }
        catch(\Throwable $failure){$content=null;$error=$failure instanceof ProfileException&&preg_match('/^[A-Z0-9_]{1,96}$/D',$failure->errorCode)?$failure->errorCode:'SOURCE_READ_FAILED';}
        return $this->locked($ownerId,function()use($ownerId,$source,$job,$content,$error):array {
            $current=$this->repository->findSource($source['id'],true);if(!$current||$current['owner_id']!==$ownerId)$this->notFound();
            $savedJob=$this->repository->findJob($job['id']);
            if($current['status']==='deleted'||$current['version']!==$source['version']||$current['last_job_id']!==$job['id']){
                $savedJob['execution_status']=$error===null?'succeeded':'failed';$savedJob['applicability']=$current['status']==='deleted'?'revoked':'superseded';$savedJob['error_code']=$error;$savedJob['updated_at']=self::now();$this->repository->saveJob($savedJob);return $this->result($current);
            }
            if($error!==null){$current['status']='failed';$savedJob['execution_status']='failed';$savedJob['error_code']=$error;}
            else{
                $snapshot=['id'=>self::uuid(),'source_id'=>$current['id'],'version'=>$current['version'],'content'=>$content,'created_at'=>self::now()];
                $this->repository->saveSnapshot($snapshot);$current['status']='ready';$current['latest_snapshot_id']=$snapshot['id'];$current['label']=$content['label'];$current['canonical_url']=$content['canonical_url'];$savedJob['execution_status']='succeeded';$savedJob['result']=['snapshot_id'=>$snapshot['id']];
            }
            $current['updated_at']=$savedJob['updated_at']=self::now();$this->repository->saveJob($savedJob);$this->repository->saveSource($current);return $this->result($current);
        });
    }
    private function validate(array $content): array
    {
        foreach(['external_id','label','raw_text'] as $key)if(!is_string($content[$key]??null)||!mb_check_encoding($content[$key],'UTF-8'))$this->invalid('The reader returned invalid structured text.');
        if(strlen($content['external_id'])>255||mb_strlen($content['label'])>255||strlen($content['raw_text'])>1048576||trim($content['raw_text'])==='')$this->invalid('The reader result exceeds supported limits.');
        $url=$content['canonical_url']??null;if($url!==null&&(!is_string($url)||strlen($url)>2048||!filter_var($url,FILTER_VALIDATE_URL)||!in_array(strtolower((string)parse_url($url,PHP_URL_SCHEME)),['https','http'],true)))$this->invalid('Invalid source URL.');
        foreach(['sections'=>2000,'candidates'=>200] as $key=>$max)if(!isset($content[$key])||!is_array($content[$key])||!array_is_list($content[$key])||count($content[$key])>$max)$this->invalid('The structured source list exceeds supported limits.');
        $sections=[];foreach($content['sections'] as $s){if(!is_array($s)||!is_string($s['id']??null)||!self::safeId($s['id'])||isset($sections[$s['id']])||!is_string($s['label']??null)||!is_string($s['text']??null)||strlen($s['text'])>32768||!is_array($s['locator']??null))$this->invalid('Invalid source section.');$sections[$s['id']]=true;}
        $ids=[];$defs=FieldCatalog::definitions();foreach($content['candidates'] as $c){$key=$c['key']??null;if(!is_array($c)||!is_string($c['id']??null)||!self::safeId($c['id'])||isset($ids[$c['id']])||!is_string($key)||!isset($defs[$key])||$defs[$key]['scope']!=='global'||$key==='contact_wechat_qr'||!array_key_exists('value',$c)||$c['value']===null||FieldCatalog::validate($key,$c['value'],false)!==[]||!is_array($c['evidence']??null)||!array_is_list($c['evidence'])||$c['evidence']===[])$this->invalid('Invalid profile candidate.');foreach($c['evidence'] as $e){if(!is_string($e)||!isset($sections[$e]))$this->invalid('Candidate evidence is not in this source.');}$ids[$c['id']]=true;}
        $content['canonical_url']=$url;$content['metadata']=$content['metadata']??[];
        if(!is_array($content['metadata'])||array_diff(array_keys($content),['external_id','label','canonical_url','raw_text','sections','candidates','metadata'])!==[])$this->invalid('Unsupported structured source fields.');
        $json=json_encode($content,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);if(strlen($json)>2097152)$this->invalid('The structured source exceeds 2 MiB.');
        return $content;
    }
    private function identity(int $ownerId,string $kind,ProfileSourceReader $reader,array $input,?string $fingerprint): array
    {
        if($kind==='github'){$id=$reader->status($ownerId)['provider_user_id']??null;if(!is_string($id)||!preg_match('/^[1-9][0-9]{0,19}$/D',$id))throw new ProfileException('GITHUB_IDENTITY_REQUIRED','Connect a verified GitHub login first.',409);return ['external_id'=>'github:'.$id,'canonical_url'=>null,'label'=>'GitHub'];}
        if($kind==='resume'){
            if(!is_string($fingerprint)||!preg_match('/^[a-f0-9]{64}$/D',$fingerprint))$this->invalid('A server-verified upload fingerprint is required.');
            return ['external_id'=>'sha256:'.$fingerprint,'canonical_url'=>null,'label'=>'简历'];
        }
        if(!$reader instanceof IdentifiedProfileSourceReader)throw new ProfileException('SOURCE_READER_UNAVAILABLE','This reader must support offline source identity.',503);
        $identity=$reader->identify($ownerId,$input);$external=$identity['external_id']??null;$url=$identity['canonical_url']??null;$label=$identity['label']??($kind==='web'?'个人网站':'粘贴文字');
        if(!is_string($external)||!preg_match('/^'.$kind.':[a-f0-9]{64}$/D',$external)||($identity['ownership_basis']??null)!=='self_declared'||!is_string($label)||!mb_check_encoding($label,'UTF-8')||mb_strlen($label)>255)$this->invalid('The reader returned an invalid source identity.');
        if($kind==='web'&&(!is_string($url)||strlen($url)>2048||!filter_var($url,FILTER_VALIDATE_URL)||!in_array(strtolower((string)parse_url($url,PHP_URL_SCHEME)),['https','http'],true)))$this->invalid('The reader returned an invalid original URL.');
        if($kind==='text'&&$url!==null)$this->invalid('A text source cannot have a canonical URL.');
        return ['external_id'=>$external,'canonical_url'=>$url,'label'=>$label];
    }
    private function reader(int $ownerId,string $kind): ProfileSourceReader
    {
        if(!in_array($kind,['github','resume','web','text'],true))$this->invalid('Use a supported source type.');$reader=($this->readerResolver)($kind);
        if(!$reader instanceof ProfileSourceReader||$reader->kind()!==$kind)throw new ProfileException('SOURCE_READER_UNAVAILABLE','This source reader is unavailable.',503);
        $status=$reader->status($ownerId);if(($status['available']??false)!==true)throw new ProfileException('SOURCE_READER_UNAVAILABLE','Connect or configure this source reader first.',409,['reason'=>$status['reason']??'UNAVAILABLE']);return $reader;
    }
    private function owned(int $ownerId,string $id,bool $lock=false): array { $source=$this->repository->findSource($id,$lock);if(!$source||$source['owner_id']!==$ownerId||$source['status']==='deleted')$this->notFound();return $source; }
    private function expect(array $source,int $version): void { if($source['status']==='deleted')$this->notFound();if($version<1||$source['version']!==$version)throw new ProfileException('SOURCE_VERSION_CONFLICT','This source changed. Reload before continuing.',409); }
    private function authorize(int $id,bool $writable=false): void { $this->access->assertOwner($id,$id,ProfileScope::global());if($writable)$this->access->assertWritable(); }
    private function locked(int $ownerId,callable $perform): mixed { return $this->workflow->transaction($ownerId,null,fn()=>$this->repository->transaction($perform)); }
    private function result(array $source,bool $includeSnapshot=true): array
    {
        $out=$source;unset($out['source_key']);$out['snapshot']=$includeSnapshot&&$source['latest_snapshot_id']?$this->repository->findSnapshot($source['latest_snapshot_id']):null;
        if($out['snapshot']){$out['snapshot']=$out['snapshot']['content']+array_intersect_key($out['snapshot'],array_flip(['id','version','created_at']));}
        $out['last_job']=$this->lastJob($source);$out['progress']=ProfileProgress::source($source,$out['last_job']);
        return $out+['generation_mode'=>'rules','llm_calls'=>0];
    }
    private function lastJob(array $source): ?array
    {
        $job = $source['last_job_id'] ? $this->repository->findJob($source['last_job_id']) : null;
        if (!$job || $job['owner_id'] !== $source['owner_id'] || $job['source_id'] !== $source['id']) return null;
        $out = array_intersect_key($job, array_flip(['id','execution_status','applicability','error_code','updated_at']));
        if ($source['status'] === 'deleted') $out['applicability'] = 'revoked';
        elseif ($job['source_version'] !== $source['version']) $out['applicability'] = 'superseded';
        return $out;
    }
    private function newJob(string $id,array $source,string $operation,string $hash): array { $now=self::now();return ['id'=>$id,'source_id'=>$source['id'],'owner_id'=>$source['owner_id'],'source_version'=>$source['version'],'operation'=>$operation,'request_hash'=>$hash,'execution_status'=>'running','applicability'=>'current','error_code'=>null,'result'=>[],'created_at'=>$now,'updated_at'=>$now]; }
    private function replay(array $job,int $ownerId,string $hash): void { if($job['owner_id']!==$ownerId||!hash_equals($job['request_hash'],$hash))throw new ProfileException('IDEMPOTENCY_CONFLICT','This request key was already used for another operation.',409); }
    private function requestId(int $ownerId,string $route,string $key): string { if(!preg_match('/^[A-Za-z0-9._:-]{8,128}$/D',$key))throw new ProfileException('IDEMPOTENCY_KEY_REQUIRED','Provide a valid Idempotency-Key.',400);$h=hash('sha256',$ownerId."\0".$route."\0".$key);return substr($h,0,8).'-'.substr($h,8,4).'-4'.substr($h,13,3).'-a'.substr($h,17,3).'-'.substr($h,20,12); }
    private static function hash(mixed $value): string { $normalize=function($v)use(&$normalize){if(is_array($v)){if(!array_is_list($v))ksort($v);foreach($v as &$part)$part=$normalize($part);unset($part);}return $v;};return hash('sha256',json_encode($normalize($value),JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE)); }
    private static function safeId(string $id): bool { return (bool)preg_match('/^[A-Za-z0-9_.:-]{1,96}$/D',$id); }
    private static function uuid(): string { $h=bin2hex(random_bytes(16));return substr($h,0,8).'-'.substr($h,8,4).'-4'.substr($h,13,3).'-a'.substr($h,17,3).'-'.substr($h,20,12); }
    private static function now(): string { return gmdate('Y-m-d H:i:s'); }
    private function invalid(string $message): never { throw new ProfileException('INVALID_SOURCE',$message); }
    private function notFound(): never { throw new ProfileException('SOURCE_NOT_FOUND','This source was not found.',404); }
}
