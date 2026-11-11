<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\application;

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileAiFailure;
use humhub\modules\matcherProfile\domain\ports\ProfileAiEngine;
use humhub\modules\matcherProfile\domain\ports\ProfileAiJobRepository;
use humhub\modules\matcherProfile\domain\ports\ProfileAiJobSessionQuery;
use humhub\modules\matcherProfile\domain\ports\ProfileAiWorkflow;

/** Durable async orchestration; the optional engine never runs inside a transaction. */
final class ProfileAiJobService
{
    public const MAX_ACTIVE = 2;
    public const MAX_DAILY = 20;
    public const MAX_ATTEMPTS = 3;
    public const LEASE_SECONDS = 120;
    private readonly \Closure $clock;
    private int $maxActive;private int $maxDaily;private int $maxAttempts;
    public function __construct(private ProfileAiJobRepository $repository, private ProfileAiWorkflow $workflow, private \Closure $engineResolver, ?callable $clock = null, array $limits = [])
    { $this->clock=$clock===null?static fn():string=>gmdate('Y-m-d H:i:s'):\Closure::fromCallable($clock);$this->maxActive=max(1,min(10,(int)($limits['active_jobs']??self::MAX_ACTIVE)));$this->maxDaily=max(1,min(1000,(int)($limits['daily_jobs']??self::MAX_DAILY)));$this->maxAttempts=max(1,min(3,(int)($limits['attempts']??self::MAX_ATTEMPTS))); }

    public function capabilities(int $ownerId): array
    {
        return $this->locked($ownerId,function():array {
            $engine=($this->engineResolver)();$status=$engine instanceof ProfileAiEngine?$engine->status():['available'=>false,'reason'=>'MODULE_UNAVAILABLE'];
            return ['generation_modes'=>['rules','ai'],'ai'=>$status,'limits'=>['active_jobs'=>$this->maxActive,'daily_jobs'=>$this->maxDaily,'attempts'=>$this->maxAttempts],'llm_calls'=>0];
        },false);
    }
    public function submit(int $ownerId,string $operation,array $request,string $requestKey): array
    {
        if(!in_array($operation,['extract','questions','compose'],true))throw new ProfileException('INVALID_AI_OPERATION','Choose a supported AI operation.');
        $id=self::requestId($ownerId,'submit:'.$operation,$requestKey);$hash=self::hash($request);
        return $this->locked($ownerId,function()use($ownerId,$operation,$request,$id,$hash):array {
            if($prior=$this->repository->find($id,true)){$this->replay($prior,$ownerId,$hash);return $this->view($this->revalidate($prior));}
            $engine=$this->engine();$status=$engine->status();if(($status['available']??false)!==true)throw new ProfileException('AI_UNAVAILABLE','AI is not configured or enabled. You may explicitly choose rules.',503);
            $this->budget($ownerId);
            $captured=$this->workflow->capture($ownerId,$operation,$request);
            if(strlen(json_encode($captured['input'],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE))>131072)throw new ProfileException('AI_INPUT_TOO_LARGE','Select a smaller set of source material.',413);
            $now=$this->now();$job=['id'=>$id,'owner_id'=>$ownerId,'space_id'=>$captured['context']['space_id'],'operation'=>$operation,'request_hash'=>$hash,'execution_status'=>'queued','applicability'=>'current','error_code'=>null,'attempt'=>1,'retry_of'=>null,'context'=>$captured['context'],'input'=>$captured['input'],'result'=>[],'metrics'=>self::emptyMetrics(),'receipts'=>[],'created_at'=>$now,'updated_at'=>$now,'started_at'=>null,'finished_at'=>null];
            $this->repository->save($job);return $this->view($job);
        });
    }
    public function get(int $ownerId,string $id): array
    { return $this->locked($ownerId,fn():array=>$this->view($this->expire($this->revalidate($this->owned($ownerId,$id,true)))),false); }
    /** Polling shares existing ownership, applicability and interrupted-lease rules. */
    public function getProgress(int $ownerId, string $id): array
    { return $this->locked($ownerId, fn():array => $this->progressView($this->expire($this->revalidate($this->owned($ownerId, $id, true)))), false); }

    /** Bounded session projection, with no engine resolution or task creation. */
    public function progressForSession(int $ownerId, string $sessionId): array
    {
        return $this->locked($ownerId, function() use ($ownerId, $sessionId): array {
            if (!$this->repository instanceof ProfileAiJobSessionQuery) {
                throw new ProfileException('AI_PROGRESS_UNAVAILABLE', 'This task repository does not support saved session progress.', 503);
            }
            $checked = [];
            $validate = function(array $rows) use ($ownerId, $sessionId, &$checked): array {
                $jobs = [];
                foreach (array_slice($rows, 0, 21) as $known) {
                    if (($known['owner_id'] ?? null) !== $ownerId || ($known['context']['session_id'] ?? null) !== $sessionId) continue;
                    $job = $checked[$known['id']] ?? $this->owned($ownerId, $known['id'], true);
                    if (($job['context']['session_id'] ?? null) !== $sessionId) continue;
                    if (!isset($checked[$job['id']])) $job = $this->expire($this->revalidate($job));
                    $checked[$job['id']] = $job;
                    $jobs[] = $job;
                }
                return $jobs;
            };
            $validate($this->repository->forSession($ownerId, $sessionId, 21));
            // Re-read the bounded order after active tasks have expired or become invalid.
            $jobs = $validate($this->repository->forSession($ownerId, $sessionId, 21));
            usort($jobs, static function(array $a, array $b): int {
                $active = static fn(array $job): int => (int)($job['applicability'] === 'current' && in_array($job['execution_status'], ['queued', 'running'], true));
                return $active($b) <=> $active($a) ?: strcmp($b['updated_at'], $a['updated_at']) ?: strcmp($b['created_at'], $a['created_at']) ?: strcmp($b['id'], $a['id']);
            });
            return ['tasks' => array_map(fn(array $job): array => $this->progressView($job), array_slice($jobs, 0, 20)), 'has_more' => count($jobs) > 20];
        }, false);
    }
    public function cancel(int $ownerId,string $id): array
    {
        return $this->locked($ownerId,function()use($ownerId,$id):array {
            $job=$this->revalidate($this->owned($ownerId,$id,true));
            if(in_array($job['execution_status'],['queued','running'],true)){$job['execution_status']='cancelled';$job['applicability']='revoked';$job['input']=[];$job['result']=[];$job['updated_at']=$job['finished_at']=$this->now();$this->repository->save($job);}
            return $this->view($job);
        });
    }
    public function retry(int $ownerId,string $id,string $requestKey): array
    {
        $nextId=self::requestId($ownerId,'retry:'.$id,$requestKey);$hash=self::hash(['retry_of'=>$id]);
        return $this->locked($ownerId,function()use($ownerId,$id,$nextId,$hash):array {
            if($prior=$this->repository->find($nextId,true)){$this->replay($prior,$ownerId,$hash);return $this->view($this->revalidate($prior));}
            $job=$this->expire($this->revalidate($this->owned($ownerId,$id,true)));
            if($job['execution_status']!=='failed'||$job['applicability']!=='current')throw new ProfileException('AI_RETRY_NOT_ALLOWED','Only a current failed task can be explicitly retried.',409);
            if($job['attempt']>=$this->maxAttempts)throw new ProfileException('AI_RETRY_LIMIT','This task reached its explicit retry limit. Review the inputs before starting a new task.',409);
            $this->engine();$this->budget($ownerId);$now=$this->now();$next=$job;
            $next['id']=$nextId;$next['request_hash']=$hash;$next['retry_of']=$id;++$next['attempt'];$next['execution_status']='queued';$next['error_code']=null;$next['result']=[];$next['metrics']=self::emptyMetrics();$next['receipts']=[];$next['created_at']=$next['updated_at']=$now;$next['started_at']=$next['finished_at']=null;
            $job['applicability']='superseded';$job['input']=[];$job['updated_at']=$now;$this->repository->save($job);$this->repository->save($next);return $this->view($next);
        });
    }
    public function apply(int $ownerId,string $id,array $request,string $requestKey): array
    {
        $receipt=self::requestId($ownerId,'apply:'.$id,$requestKey);$hash=self::hash($request);
        return $this->locked($ownerId,function()use($ownerId,$id,$request,$receipt,$hash):array {
            $job=$this->revalidate($this->owned($ownerId,$id,true));
            if($job['operation']!=='extract'||$job['execution_status']!=='succeeded'||$job['applicability']!=='current')throw new ProfileException('AI_RESULT_NOT_APPLICABLE','This extraction is no longer available for adoption.',409);
            if(isset($job['receipts'][$receipt])){if($job['receipts'][$receipt]['hash']!==$hash)throw new ProfileException('IDEMPOTENCY_CONFLICT','This request key was already used with different inputs.',409);return $job['receipts'][$receipt]['result'];}
            $applied=$this->workflow->applyCandidates($ownerId,$job['context'],$job['result'],$request);
            $job['context']=$applied['context'];$result=$applied['result']+['job_id'=>$id,'generation_mode'=>'ai'];
            $job['receipts'][$receipt]=['hash'=>$hash,'result'=>$result];$job['updated_at']=$this->now();$this->repository->save($job);return $result;
        });
    }
    /** Execute at most one claimed task. Returns null when no work is queued. */
    public function work(?string $id = null): ?array
    {
        $this->recoverExpired();
        $id??=$this->repository->nextQueued();if($id===null)return null;$known=$this->repository->find($id);if($known===null)return null;
        try{$claimed=$this->locked($known['owner_id'],function()use($id):?array {
            $job=$this->repository->find($id,true);if($job===null||$job['execution_status']!=='queued')return null;
            $job=$this->revalidate($job);if($job['applicability']!=='current')return null;
            $job['execution_status']='running';$job['started_at']=$job['updated_at']=$this->now();$this->repository->save($job);return $job;
        });}catch(ProfileException $e){if($e->errorCode!=='PROFILE_ACCESS_DENIED')throw $e;return $this->revokeDenied($known);}
        if($claimed===null)return null;
        // Deliberately outside all repository/workflow transactions and locks.
        $data=null;$error=null;$metrics=self::emptyMetrics();
        try{$output=$this->engine()->generate($claimed['operation'],$claimed['input']);$data=$output['data'];$metrics=($output['metrics']??self::emptyMetrics())+['accounting_complete'=>true];if(!is_array($data)||!is_array($metrics))throw new ProfileAiFailure('AI_SCHEMA_INVALID');}
        catch(\Throwable $e){$error=$e instanceof ProfileAiFailure&&preg_match('/^[A-Z0-9_]{1,96}$/D',$e->errorCode)?$e->errorCode:'AI_EXECUTION_FAILED';$metrics=$e instanceof ProfileAiFailure?($e->metrics+['accounting_complete'=>true]):self::unknownMetrics();}
        try{return $this->locked($claimed['owner_id'],function()use($claimed,$data,$metrics,$error):array {
            $job=$this->repository->find($claimed['id'],true);$job=$this->expire($this->revalidate($job));$job['metrics']=$metrics;
            if($job['execution_status']!=='running'){$job['updated_at']=$this->now();$this->repository->save($job);return $this->view($job);}
            if($job['execution_status']==='cancelled'||$job['applicability']!=='current'){
                if($job['execution_status']!=='cancelled')$job['execution_status']=$error===null?'succeeded':'failed';
                $job['error_code']=$error;$job['input']=[];$job['result']=[];
            }else{
                if($error===null){$installed=$this->workflow->install($job['owner_id'],$job['operation'],$job['context']+['metrics'=>$metrics],$data);$job['result']=$installed['result'];$job['context']=$installed['context'];$job['execution_status']='succeeded';$job['input']=[];}
                else{$job['execution_status']='failed';$job['error_code']=$error;}
            }
            $job['finished_at']=$job['updated_at']=$this->now();$this->repository->save($job);return $this->view($job);
        });}catch(\Throwable $e){
            // Installation rolled back; preserve actual model usage, never expose exception text.
            return $this->repository->transaction(function()use($claimed,$metrics,$e):array {
                $job=$this->repository->find($claimed['id'],true);$job['metrics']=$metrics;
                if($job['execution_status']!=='cancelled')$job['execution_status']='failed';
                $denied=$e instanceof ProfileException&&$e->errorCode==='PROFILE_ACCESS_DENIED';
                $job['error_code']=$denied?'PROFILE_ACCESS_DENIED':'AI_INSTALL_FAILED';if($denied){$job['applicability']='revoked';$job['input']=[];}$job['result']=[];$job['finished_at']=$job['updated_at']=$this->now();$this->repository->save($job);return $this->view($job);
            });
        }
    }
    /** Expire interrupted work without automatically issuing another model request. */
    public function recoverExpired(?int $ownerId = null): int
    {
        $count=0;foreach($this->repository->expiredRunning($this->expiryCutoff(),$ownerId) as $known){
            try{$this->locked($known['owner_id'],function()use($known,&$count):void{$job=$this->repository->find($known['id'],true);if($job!==null&&$job['execution_status']==='running'){$this->expire($this->revalidate($job));++$count;}},false);}
            catch(ProfileException $e){if($e->errorCode!=='PROFILE_ACCESS_DENIED')throw $e;$this->revokeDenied($known);++$count;}
        }return $count;
    }
    private function expire(array $job): array
    {
        if($job['execution_status']==='running'&&$job['started_at']!==null&&$job['started_at']<=$this->expiryCutoff()){
            $job['execution_status']='failed';$job['error_code']='AI_WORKER_INTERRUPTED';$job['metrics']=self::unknownMetrics();$job['finished_at']=$job['updated_at']=$this->now();$this->repository->save($job);
        }return $job;
    }
    private function expiryCutoff(): string { return gmdate('Y-m-d H:i:s',strtotime($this->now().' UTC')-self::LEASE_SECONDS); }
    private static function unknownMetrics(): array
    { $metrics=self::emptyMetrics();$metrics['llm_calls']=null;$metrics['accounting_complete']=false;return $metrics; }
    private function revalidate(array $job): array
    {
        if($job['applicability']!=='current')return $job;
        $applicability=$this->workflow->applicability($job['owner_id'],$job['context']);
        if($applicability!=='current'){$job['applicability']=$applicability;$job['input']=[];$job['result']=[];$job['receipts']=[];if($job['execution_status']==='queued')$job['execution_status']='cancelled';$job['updated_at']=$this->now();$this->repository->save($job);}
        return $job;
    }
    private function revokeDenied(array $known): array
    {
        return $this->repository->transaction(function()use($known):array {$job=$this->repository->find($known['id'],true);if($job['execution_status']==='running')$job['metrics']=self::unknownMetrics();$job['applicability']='revoked';$job['execution_status']='cancelled';$job['error_code']='PROFILE_ACCESS_DENIED';$job['input']=$job['result']=$job['receipts']=[];$job['updated_at']=$job['finished_at']=$this->now();$this->repository->save($job);return $this->view($job);});
    }
    private function locked(int $ownerId,callable $callback,bool $writable=true): mixed
    { return $this->workflow->transaction($ownerId,null,fn()=>$this->repository->transaction($callback),$writable); }
    private function engine(): ProfileAiEngine
    { $engine=($this->engineResolver)();if(!$engine instanceof ProfileAiEngine)throw new ProfileException('AI_UNAVAILABLE','AI is not configured or enabled. You may explicitly choose rules.',503);return $engine; }
    private function budget(int $ownerId): void
    {
        $this->recoverExpired($ownerId);
        if($this->repository->countActive($ownerId)>=$this->maxActive)throw new ProfileException('AI_ACTIVE_LIMIT','Wait for or cancel a pending task before submitting another.',429);
        if($this->repository->countSince($ownerId,substr($this->now(),0,10).' 00:00:00')>=$this->maxDaily)throw new ProfileException('AI_DAILY_LIMIT','The daily AI task budget is exhausted.',429);
    }
    private function owned(int $ownerId,string $id,bool $lock=false): array
    { $job=$this->repository->find($id,$lock);if($job===null||$job['owner_id']!==$ownerId)throw new ProfileException('AI_JOB_NOT_FOUND','This AI task was not found.',404);return $job; }
    private function replay(array $job,int $ownerId,string $hash): void
    { if($job['owner_id']!==$ownerId||!hash_equals($job['request_hash'],$hash))throw new ProfileException('IDEMPOTENCY_CONFLICT','This request key was already used with different inputs.',409); }
    private function view(array $job): array
    { $out=array_intersect_key($job,array_flip(['id','owner_id','space_id','operation','execution_status','applicability','error_code','attempt','retry_of','metrics','created_at','updated_at','started_at','finished_at']));$out['job_id']=$job['id'];$out['generation_mode']='ai';$out['result']=$job['execution_status']==='succeeded'&&$job['applicability']==='current'?$job['result']:null;$out['progress']=ProfileProgress::job($job,$this->maxAttempts);return $out; }
    private function progressView(array $job): array
    { $out=array_intersect_key($job,array_flip(['id','operation','execution_status','applicability','error_code','attempt','retry_of','created_at','updated_at','started_at','finished_at']));$out['job_id']=$job['id'];$out['progress']=ProfileProgress::job($job,$this->maxAttempts);return $out; }
    private static function requestId(int $ownerId,string $route,string $key): string
    { if(!preg_match('/^[A-Za-z0-9._:-]{8,128}$/D',$key))throw new ProfileException('IDEMPOTENCY_KEY_REQUIRED','Provide a valid Idempotency-Key.',400);$h=hash('sha256',$ownerId."\0".$route."\0".$key);return substr($h,0,8).'-'.substr($h,8,4).'-4'.substr($h,13,3).'-a'.substr($h,17,3).'-'.substr($h,20,12); }
    private static function hash(mixed $v): string
    { $normalize=function($v)use(&$normalize){if(is_array($v)){if(!array_is_list($v))ksort($v);foreach($v as &$item)$item=$normalize($item);unset($item);}return $v;};return hash('sha256',json_encode($normalize($v),JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE)); }
    private static function emptyMetrics(): array { return ['model'=>null,'llm_calls'=>0,'duration_ms'=>0,'accounting_complete'=>true,'usage'=>['prompt_tokens'=>null,'completion_tokens'=>null,'total_tokens'=>null,'reported'=>false]]; }
    private function now(): string { return ($this->clock)(); }
}
