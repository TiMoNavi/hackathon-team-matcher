<?php
declare(strict_types=1);
/** Independent task-boundary audit. Synthetic ports only; never loads application config. */
$root=dirname(__DIR__,2);
spl_autoload_register(static function(string $class)use($root):void{$prefix='humhub\\modules\\matcherProfile\\';if(str_starts_with($class,$prefix)){$path=$root.'/'.str_replace(chr(92),'/',substr($class,strlen($prefix))).'.php';if(is_file($path))require $path;}});
use humhub\modules\matcherProfile\application\ProfileAiJobService;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileAiFailure;
use humhub\modules\matcherProfile\domain\ports\ProfileAiEngine;
use humhub\modules\matcherProfile\domain\ports\ProfileAiJobRepository;
use humhub\modules\matcherProfile\domain\ports\ProfileAiWorkflow;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileAiJobRepository;

final class AuditJobRepository implements ProfileAiJobRepository {
    public int $depth=0; public InMemoryProfileAiJobRepository $inner;
    public function __construct(){ $this->inner=new InMemoryProfileAiJobRepository(); }
    public function transaction(callable $callback):mixed {++$this->depth;try{return $this->inner->transaction($callback);}finally{--$this->depth;}}
    public function find(string $id,bool $lock=false):?array{return $this->inner->find($id,$lock);}
    public function save(array $job):void{$this->inner->save($job);}
    public function nextQueued():?string{return $this->inner->nextQueued();}
    public function expiredRunning(string $before,?int $ownerId=null):array{return $this->inner->expiredRunning($before,$ownerId);}
    public function countActive(int $ownerId):int{return $this->inner->countActive($ownerId);}
    public function countSince(int $ownerId,string $since):int{return $this->inner->countSince($ownerId,$since);}
    public function revokeSource(string $sourceId):void{$this->inner->revokeSource($sourceId);}
}
final class AuditWorkflow implements ProfileAiWorkflow {
    public int $depth=0,$version=1,$installs=0,$adoptions=0; public bool $denied=false,$revoked=false,$installFail=false;
    public function transaction(int $ownerId,?int $spaceId,callable $callback,bool $writable=true):mixed {if($this->denied)throw new ProfileException('PROFILE_ACCESS_DENIED','Synthetic denied',403);++$this->depth;try{return $callback();}finally{--$this->depth;}}
    public function capture(int $ownerId,string $operation,array $request):array{return ['context'=>['space_id'=>10,'version'=>$this->version,'sources'=>['synthetic-source'=>1]],'input'=>['private_text'=>'AUDIT-PRIVATE-INPUT','request'=>$request]];}
    public function applicability(int $ownerId,array $context):string{return $this->revoked?'revoked':($context['version']===$this->version?'current':'superseded');}
    public function install(int $ownerId,string $operation,array $context,array $data):array{if($this->installFail)throw new RuntimeException('AUDIT-PRIVATE-INSTALL-DETAIL');++$this->installs;return ['result'=>$data,'context'=>$context];}
    public function applyCandidates(int $ownerId,array $context,array $data,array $request):array{++$this->adoptions;return ['context'=>$context,'result'=>['applied'=>$request['candidate_ids']??[]]];}
}
final class AuditEngine implements ProfileAiEngine {
    public int $calls=0,$statuses=0;public bool $available=true;public ?Closure $hook=null;public ?Throwable $failure=null;
    public function __construct(private AuditJobRepository $repository,private AuditWorkflow $workflow){}
    public function status():array{++$this->statuses;return ['available'=>$this->available,'model'=>'audit-synthetic'];}
    public function generate(string $operation,array $input):array{++$this->calls;auditCheck('model_call_'.$this->calls.'_outside_all_transactions',$this->repository->depth===0&&$this->workflow->depth===0);if($this->hook){$hook=$this->hook;$this->hook=null;$hook();}if($this->failure)throw $this->failure;return ['data'=>['candidates'=>[['id'=>'candidate-1']],'review_items'=>[]],'metrics'=>self::metrics()];}
    public static function metrics():array{return ['model'=>'audit-synthetic','llm_calls'=>1,'duration_ms'=>7,'usage'=>['prompt_tokens'=>11,'completion_tokens'=>13,'total_tokens'=>24,'reported'=>true]];}
}
$checks=[];
function auditCheck(string $name,bool $pass):void{global $checks;$checks[]=['name'=>$name,'passed'=>$pass];if(!$pass)throw new RuntimeException($name);}
function auditDeny(string $name,string $code,callable $call):void{try{$call();}catch(ProfileException $e){auditCheck($name,$e->errorCode===$code);return;}throw new RuntimeException($name.' did not reject');}
function auditWorld(?callable $clock=null):array{$r=new AuditJobRepository();$w=new AuditWorkflow();$e=new AuditEngine($r,$w);$s=new ProfileAiJobService($r,$w,fn()=>$e,$clock??fn()=>'2026-11-11 12:00:00');return [$r,$w,$e,$s];}
try {
[$repo,$flow,$engine,$service]=auditWorld();
auditDeny('unsupported_operation','INVALID_AI_OPERATION',fn()=>$service->submit(1,'publish',[],'audit-operation'));
auditDeny('missing_request_key','IDEMPOTENCY_KEY_REQUIRED',fn()=>$service->submit(1,'extract',[],''));
$engine->available=false;auditDeny('unavailable_is_explicit','AI_UNAVAILABLE',fn()=>$service->submit(1,'extract',[],'audit-unavailable'));
auditCheck('unavailable_created_no_job_or_model_call',$repo->inner->jobs===[]&&$engine->calls===0);$engine->available=true;
$job=$service->submit(1,'extract',['source'=>'a'],'audit-submit');
auditCheck('submit_is_queued_and_does_not_generate',$job['execution_status']==='queued'&&$engine->calls===0);
auditCheck('owner_view_omits_private_input',!str_contains(json_encode($job),'AUDIT-PRIVATE-INPUT')&&!isset($job['context'],$job['input']));
for($i=0;$i<3;++$i){$service->get(1,$job['id']);$service->capabilities(1);}auditCheck('reads_do_not_generate',$engine->calls===0);
auditCheck('same_request_key_returns_same_job',$service->submit(1,'extract',['source'=>'a'],'audit-submit')['id']===$job['id']);
auditDeny('changed_request_key_payload_conflicts','IDEMPOTENCY_CONFLICT',fn()=>$service->submit(1,'extract',['source'=>'b'],'audit-submit'));
foreach(['get','cancel'] as $method)auditDeny('foreign_'.$method,'AI_JOB_NOT_FOUND',fn()=>$service->$method(2,$job['id']));
auditDeny('foreign_retry','AI_JOB_NOT_FOUND',fn()=>$service->retry(2,$job['id'],'audit-other-retry'));
auditDeny('foreign_apply','AI_JOB_NOT_FOUND',fn()=>$service->apply(2,$job['id'],[],'audit-other-apply'));
$done=$service->work($job['id']);auditCheck('work_persists_success_and_actual_metrics',$done['execution_status']==='succeeded'&&$done['metrics']['usage']['total_tokens']===24&&$flow->installs===1);
auditCheck('worker_claim_is_idempotent',$service->work($job['id'])===null&&$engine->calls===1);
auditCheck('generation_does_not_adopt',$flow->adoptions===0);
$applied=$service->apply(1,$job['id'],['candidate_ids'=>['candidate-1']],'audit-adopt');$replay=$service->apply(1,$job['id'],['candidate_ids'=>['candidate-1']],'audit-adopt');
auditCheck('explicit_adoption_replay_does_not_duplicate',$flow->adoptions===1&&$applied===$replay);
auditDeny('changed_adoption_receipt_conflicts','IDEMPOTENCY_CONFLICT',fn()=>$service->apply(1,$job['id'],['candidate_ids'=>[]],'audit-adopt'));
$cancel=$service->submit(1,'extract',[],'audit-cancel');$service->cancel(1,$cancel['id']);$again=$service->cancel(1,$cancel['id']);
auditCheck('cancel_is_idempotent_and_prevents_work',$again['execution_status']==='cancelled'&&$again['applicability']==='revoked'&&$service->work($cancel['id'])===null&&$engine->calls===1);
auditDeny('cancelled_job_cannot_retry','AI_RETRY_NOT_ALLOWED',fn()=>$service->retry(1,$cancel['id'],'audit-cancel-retry'));
foreach(['cancel','version','revoke','owner_denied'] as $change){
    [$r,$w,$e,$s]=auditWorld();$j=$s->submit(1,'extract',[],'audit-late-'.$change);
    $e->hook=function()use($change,$s,$j,$w){if($change==='cancel')$s->cancel(1,$j['id']);elseif($change==='version')++$w->version;elseif($change==='revoke')$w->revoked=true;else $w->denied=true;};
    $result=$s->work($j['id']);
    auditCheck('late_'.$change.'_cannot_install_or_expose_result',$w->installs===0&&$result['result']===null&&$result['applicability']!== 'current');
    auditCheck('late_'.$change.'_retains_actual_call_metric',$result['metrics']['llm_calls']===1);
}
foreach(['version','revoke','owner_denied'] as $change){
    [$r,$w,$e,$s]=auditWorld();$j=$s->submit(1,'extract',[],'audit-stale-'.$change);
    if($change==='version')++$w->version;elseif($change==='revoke')$w->revoked=true;else $w->denied=true;
    $s->work($j['id']);$stored=$r->find($j['id']);
    auditCheck('preflight_'.$change.'_prevents_model',$e->calls===0&&$stored['execution_status']==='cancelled'&&$stored['input']===[]&&$stored['applicability']!=='current');
}
[$repo,$flow,$engine,$service]=auditWorld();$engine->failure=new ProfileAiFailure('AI_TIMEOUT',AuditEngine::metrics());
$job=$service->submit(1,'extract',[],'audit-fail');$failed=$service->work($job['id']);
auditCheck('failure_is_explicit_and_accounted',$failed['execution_status']==='failed'&&$failed['error_code']==='AI_TIMEOUT'&&$failed['metrics']['llm_calls']===1&&$failed['result']===null);
$service->get(1,$job['id']);auditCheck('failed_read_does_not_retry',$engine->calls===1);
for($attempt=2;$attempt<=3;++$attempt){$next=$service->retry(1,$job['id'],'audit-retry-'.$attempt);auditCheck('retry_'.$attempt.'_new_job_and_supersedes_old',$next['id']!==$job['id']&&$next['attempt']===$attempt&&$repo->find($job['id'])['applicability']==='superseded');auditCheck('retry_'.$attempt.'_same_key_replays',$service->retry(1,$job['id'],'audit-retry-'.$attempt)['id']===$next['id']);$service->work($next['id']);$job=$next;}
auditDeny('retry_budget_has_no_fourth_attempt','AI_RETRY_LIMIT',fn()=>$service->retry(1,$job['id'],'audit-retry-4'));
[$repo,$flow,$engine,$service]=auditWorld();$engine->failure=new RuntimeException('AUDIT-PRIVATE-TRANSPORT-DETAIL');$job=$service->submit(1,'extract',[],'audit-exception');$failed=$service->work($job['id']);
auditCheck('unexpected_exception_is_sanitized',$failed['error_code']==='AI_EXECUTION_FAILED'&&!str_contains(json_encode($failed),'AUDIT-PRIVATE-TRANSPORT-DETAIL'));
[$repo,$flow,$engine,$service]=auditWorld();$flow->installFail=true;$job=$service->submit(1,'extract',[],'audit-install-fail');$failed=$service->work($job['id']);
auditCheck('install_failure_keeps_call_accounting_without_result',$failed['execution_status']==='failed'&&$failed['error_code']==='AI_INSTALL_FAILED'&&$failed['metrics']['llm_calls']===1&&$failed['result']===null&&!str_contains(json_encode($failed),'AUDIT-PRIVATE-INSTALL-DETAIL'));
[$repo,$flow,$engine,$service]=auditWorld();$a=$service->submit(1,'extract',[],'audit-active-1');$service->submit(1,'extract',[],'audit-active-2');
auditDeny('active_budget_blocks_third','AI_ACTIVE_LIMIT',fn()=>$service->submit(1,'extract',[],'audit-active-3'));$service->cancel(1,$a['id']);auditCheck('cancel_releases_active_budget',$service->submit(1,'extract',[],'audit-active-3')['execution_status']==='queued');
[$repo,$flow,$engine,$service]=auditWorld();for($i=0;$i<20;++$i){$j=$service->submit(1,'extract',[],'audit-daily-'.$i);$service->cancel(1,$j['id']);}
auditDeny('cancel_does_not_bypass_daily_budget','AI_DAILY_LIMIT',fn()=>$service->submit(1,'extract',[],'audit-daily-20'));
$now='2026-11-11 12:00:00';[$repo,$flow,$engine,$service]=auditWorld(static function()use(&$now):string{return $now;});
$job=$service->submit(1,'extract',[],'audit-lease-late');$retry=null;
$engine->hook=function()use(&$now,&$retry,$service,$job,$engine):void{
    $now='2026-11-11 12:01:59';$running=$service->get(1,$job['id']);
    auditCheck('lease_not_expired_before_120_seconds',$running['execution_status']==='running'&&$running['error_code']===null);
    $now='2026-11-11 12:02:00';$expired=$service->get(1,$job['id']);
    auditCheck('lease_expires_exactly_at_120_seconds',$expired['execution_status']==='failed'&&$expired['error_code']==='AI_WORKER_INTERRUPTED'&&$expired['applicability']==='current'&&$expired['result']===null);
    auditCheck('interrupted_usage_is_unknown',$expired['metrics']['llm_calls']===null&&$expired['metrics']['accounting_complete']===false&&$expired['metrics']['usage']['total_tokens']===null);
    auditCheck('expiry_read_does_not_call_again',$engine->calls===1);
    $retry=$service->retry(1,$job['id'],'audit-lease-explicit-retry');
    auditCheck('expired_job_can_only_queue_explicit_retry',$retry['execution_status']==='queued'&&$retry['attempt']===2&&$engine->calls===1);
};
$late=$service->work($job['id']);
auditCheck('late_worker_cannot_install_after_expiry_retry',$flow->installs===0&&$late['execution_status']==='failed'&&$late['applicability']==='superseded'&&$late['error_code']==='AI_WORKER_INTERRUPTED'&&$late['result']===null);
auditCheck('late_worker_backfills_actual_accounting',$late['metrics']['llm_calls']===1&&$late['metrics']['accounting_complete']===true&&$late['metrics']['usage']['total_tokens']===24);
$retried=$service->work($retry['id']);auditCheck('new_worker_installs_retry_only',$retried['execution_status']==='succeeded'&&$flow->installs===1&&$engine->calls===2);
$now='2026-11-11 12:00:00';[$repo,$flow,$engine,$service]=auditWorld(static function()use(&$now):string{return $now;});
$expired=[];foreach([1,1,2]as$i=>$owner){$j=$service->submit($owner,'extract',[],'audit-expired-budget-'.$i);$stored=$repo->find($j['id']);$stored['execution_status']='running';$stored['started_at']=$now;$repo->save($stored);$expired[]=$j;}
$now='2026-11-11 12:02:01';$fresh=$service->submit(1,'extract',[],'audit-after-expiry');
auditCheck('submit_recovers_own_expired_active_budget',$fresh['execution_status']==='queued'&&$repo->find($expired[0]['id'])['execution_status']==='failed'&&$repo->find($expired[1]['id'])['execution_status']==='failed');
auditCheck('submit_recovery_is_owner_scoped',$repo->find($expired[2]['id'])['execution_status']==='running');
auditCheck('expired_budget_recovery_issues_no_model_calls',$engine->calls===0);
auditCheck('worker_recovery_handles_remaining_owner',$service->recoverExpired()===1&&$repo->find($expired[2]['id'])['execution_status']==='failed'&&$engine->calls===0);
echo json_encode(['status'=>'passed','passed'=>count($checks),'checks'=>$checks,'external_requests'=>0,'real_llm_calls'=>0,'scope'=>'Independent ProfileAiJobService ports: synthetic workflow and engine; actual SQL/HTTP checked separately'],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE),PHP_EOL;
}catch(Throwable $e){echo json_encode(['status'=>'failed','passed'=>count(array_filter($checks,fn($c)=>$c['passed'])),'checks'=>$checks,'error'=>$e->getMessage()],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE),PHP_EOL;exit(1);}
