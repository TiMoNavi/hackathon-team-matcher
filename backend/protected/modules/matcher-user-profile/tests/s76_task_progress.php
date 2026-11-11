<?php
declare(strict_types=1);
/** S7.6 A: synthetic owner/Space workflow, memory ports and temporary SQLite only. */
$moduleRoot = dirname(__DIR__);
$backend = dirname($moduleRoot, 3);
spl_autoload_register(static function(string $class) use ($moduleRoot): void {
    $prefix = implode(chr(92), ['humhub', 'modules', 'matcherProfile']).chr(92);
    if (str_starts_with($class, $prefix)) {
        $path = $moduleRoot.'/'.str_replace(chr(92), '/', substr($class, strlen($prefix))).'.php';
        if (is_file($path)) require $path;
    }
});
use humhub\modules\matcherProfile\application\ProfileAiJobService;
use humhub\modules\matcherProfile\application\ProfileSourceService;
use humhub\modules\matcherProfile\application\ProfileService;
use humhub\modules\matcherProfile\application\QuestionService;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ports\ProfileAiWorkflow;
use humhub\modules\matcherProfile\domain\ports\ProfileAiJobRepository;
use humhub\modules\matcherProfile\domain\ports\ProfileSourceRepository;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileAiJobRepository;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileSourceRepository;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileRepository;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileWorkflow;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileAccessPolicy;
use humhub\modules\matcherProfile\adapters\memory\InMemoryQuestionRepository;
use humhub\modules\matcherProfile\adapters\persistence\SqlProfileAiJobRepository;

final class S76TaskWorkflow implements ProfileAiWorkflow
{
    public array $users = [1, 2], $members = [10 => [1, 2]], $versions = ['session-a' => 1];
    public int $captures = 0, $installs = 0, $adoptions = 0, $checks = 0;
    public function transaction(int $ownerId, ?int $spaceId, callable $callback, bool $writable = true): mixed
    {
        if ($ownerId < 1) throw new ProfileException('AUTHENTICATION_REQUIRED', 'Sign in.', 401);
        if (!in_array($ownerId, $this->users, true)) throw new ProfileException('PROFILE_ACCESS_DENIED', 'Unavailable account.', 403);
        return $callback();
    }
    public function capture(int $ownerId, string $operation, array $request): array { ++$this->captures; throw new LogicException('Progress cannot capture.'); }
    public function applicability(int $ownerId, array $context): string
    {
        ++$this->checks;
        if (!in_array($ownerId, $this->members[$context['space_id']] ?? [], true)) return 'revoked';
        return ($context['version'] ?? 1) === ($this->versions[$context['session_id']] ?? 1) ? 'current' : 'superseded';
    }
    public function install(int $ownerId, string $operation, array $context, array $data): array { ++$this->installs; throw new LogicException('Progress cannot install.'); }
    public function applyCandidates(int $ownerId, array $context, array $data, array $request): array { ++$this->adoptions; throw new LogicException('Progress cannot apply.'); }
}
/** Existing third-party/fake repositories need not implement the new optional query. */
final class S76LegacyJobs implements ProfileAiJobRepository
{
    public function __construct(public InMemoryProfileAiJobRepository $inner) {}
    public function transaction(callable $callback): mixed { return $this->inner->transaction($callback); }
    public function find(string $id, bool $lock = false): ?array { return $this->inner->find($id, $lock); }
    public function save(array $job): void { $this->inner->save($job); }
    public function nextQueued(): ?string { return $this->inner->nextQueued(); }
    public function expiredRunning(string $before, ?int $ownerId = null): array { return $this->inner->expiredRunning($before, $ownerId); }
    public function countActive(int $ownerId): int { return $this->inner->countActive($ownerId); }
    public function countSince(int $ownerId, string $since): int { return $this->inner->countSince($ownerId, $since); }
    public function revokeSource(string $sourceId): void { $this->inner->revokeSource($sourceId); }
}
final class S76Sources implements ProfileSourceRepository
{
    public int $snapshotReads = 0;
    public function __construct(public InMemoryProfileSourceRepository $inner) {}
    public function transaction(callable $callback): mixed { return $this->inner->transaction($callback); }
    public function listSources(int $ownerId): array { return $this->inner->listSources($ownerId); }
    public function hasSourceHistory(int $ownerId, string $kind): bool { return $this->inner->hasSourceHistory($ownerId, $kind); }
    public function findSource(string $id, bool $lock = false): ?array { return $this->inner->findSource($id, $lock); }
    public function findSourceKey(int $ownerId, string $kind, string $key): ?array { return $this->inner->findSourceKey($ownerId, $kind, $key); }
    public function saveSource(array $source): void { $this->inner->saveSource($source); }
    public function findSnapshot(string $id): ?array { ++$this->snapshotReads; return $this->inner->findSnapshot($id); }
    public function saveSnapshot(array $snapshot): void { $this->inner->saveSnapshot($snapshot); }
    public function purgeSnapshots(string $sourceId): void { $this->inner->purgeSnapshots($sourceId); }
    public function findJob(string $id): ?array { return $this->inner->findJob($id); }
    public function saveJob(array $job): void { $this->inner->saveJob($job); }
    public function changeJobApplicability(string $sourceId, string $applicability): void { $this->inner->changeJobApplicability($sourceId, $applicability); }
}
$checks = [];
function s76check(string $name, bool $pass): void { global $checks; if (!$pass) throw new RuntimeException($name); $checks[] = $name; }
function s76reject(string $name, string $code, callable $call): void
{
    try { $call(); } catch (ProfileException $e) { s76check($name, $e->errorCode === $code); return; }
    throw new RuntimeException($name.' did not reject');
}
function s76schema(string $name, array $progress): void
{
    $keys = array_keys($progress); sort($keys);
    $expected = ['schema_version','state','phase','label_code','message','updated_at','poll_after_ms','percent','next_actions']; sort($expected);
    s76check($name, $keys === $expected && $progress['schema_version'] === 1 && $progress['percent'] === null
        && is_int($progress['poll_after_ms']) && array_is_list($progress['next_actions']) && is_string($progress['message']));
}
function s76job(string $id, string $status = 'queued', string $operation = 'extract', string $session = 'session-a', int $owner = 1): array
{
    return ['id'=>$id, 'owner_id'=>$owner, 'space_id'=>10, 'operation'=>$operation, 'request_hash'=>str_repeat('a',64),
        'execution_status'=>$status, 'applicability'=>'current', 'error_code'=>$status === 'failed' ? 'AI_TIMEOUT' : null, 'attempt'=>1, 'retry_of'=>null,
        'context'=>['session_id'=>$session,'space_id'=>10,'version'=>1,'private_context'=>'PRIVATE-S76-CONTEXT'],
        'input'=>['private'=>'PRIVATE-S76-INPUT'], 'result'=>['value'=>'PRIVATE-S76-RESULT'], 'metrics'=>['model'=>'PRIVATE-S76-MODEL'],
        'receipts'=>['value'=>'PRIVATE-S76-RECEIPT'], 'created_at'=>'2026-11-12 10:00:00', 'updated_at'=>'2026-11-12 10:00:00',
        'started_at'=>$status === 'running' ? '2026-11-12 10:00:00' : null, 'finished_at'=>null];
}
try {
    $now = '2026-11-12 10:01:59'; $engineResolutions = 0;
    $resolver = static function() use (&$engineResolutions): never { ++$engineResolutions; throw new LogicException('Engine resolution is forbidden in progress.'); };
    $clock = static function() use (&$now): string { return $now; };
    $repo = new InMemoryProfileAiJobRepository(); $flow = new S76TaskWorkflow();
    $service = new ProfileAiJobService($repo, $flow, $resolver, $clock);
    foreach (['extract'=>'extracting','questions'=>'preparing_questions','compose'=>'composing_profile'] as $operation=>$phase) {
        foreach (['queued','running','succeeded','failed','cancelled'] as $status) {
            $id = $operation.'-'.$status; $repo->save(s76job($id,$status,$operation));
            $task = $service->getProgress(1,$id); $p = $task['progress'];
            s76schema($id.'_schema', $p);
            s76check($id.'_real_state_and_phase', $task['execution_status'] === $status && $p['state'] === ($status === 'succeeded' ? 'ready' : $status) && $p['phase'] === $phase);
            s76check($id.'_poll_and_indeterminate_percent', $p['poll_after_ms'] === (in_array($status,['queued','running'],true) ? 1000 : 0) && $p['percent'] === null);
            s76check($id.'_private_projection', !str_contains(json_encode($task),'PRIVATE-S76-') && !isset($task['result'],$task['input'],$task['context'],$task['metrics'],$task['receipts']));
        }
    }
    $full = $service->get(1,'extract-succeeded'); $stored = $repo->find('extract-succeeded');
    s76check('job_dto_keeps_all_legacy_fields', array_diff(['id','job_id','owner_id','space_id','operation','execution_status','applicability','error_code','attempt','retry_of','metrics','created_at','updated_at','started_at','finished_at','generation_mode','result'],array_keys($full)) === [] && $full['result'] === $stored['result']);
    s76check('full_and_compact_job_use_same_projection', $full['progress'] === $service->getProgress(1,'extract-succeeded')['progress']);
    s76reject('foreign_job_hidden','AI_JOB_NOT_FOUND',fn()=>$service->getProgress(2,'extract-succeeded'));
    s76reject('missing_job_hidden','AI_JOB_NOT_FOUND',fn()=>$service->getProgress(1,'missing'));
    s76reject('anonymous_task_denied','AUTHENTICATION_REQUIRED',fn()=>$service->getProgress(0,'extract-succeeded'));
    $flow->users=[2]; s76reject('disabled_owner_denied','PROFILE_ACCESS_DENIED',fn()=>$service->getProgress(1,'extract-succeeded')); $flow->users=[1,2];
    $before = $repo->jobs; $first = $service->getProgress(1,'questions-queued'); $second = $service->getProgress(1,'questions-queued');
    s76check('stable_task_poll_does_not_write', $first === $second && $before === $repo->jobs);
    $now = '2026-11-12 10:02:00'; $expired = $service->getProgress(1,'extract-running');
    s76check('lease_recovery_at_120_seconds', $expired['execution_status'] === 'failed' && $expired['error_code'] === 'AI_WORKER_INTERRUPTED' && $expired['progress']['next_actions'] === ['retry','use_rules']);
    $recovered = $repo->find('extract-running'); s76check('lease_recovery_retains_unknown_accounting', $recovered['metrics']['llm_calls'] === null && $recovered['metrics']['accounting_complete'] === false);
    s76check('second_lease_poll_is_stable', $expired === $service->getProgress(1,'extract-running') && $recovered === $repo->find('extract-running'));
    $limited = $repo->find('extract-failed'); $limited['attempt'] = 3; $repo->save($limited);
    s76check('retry_exhaustion_has_no_retry_action', !in_array('retry',$service->getProgress(1,'extract-failed')['progress']['next_actions'],true));
    $oneAttempt = new ProfileAiJobService($repo,$flow,$resolver,$clock,['attempts'=>1]);
    s76check('configured_retry_limit_is_respected', !in_array('retry',$oneAttempt->getProgress(1,'questions-failed')['progress']['next_actions'],true));
    $cancelled = $service->cancel(1,'extract-queued');
    s76check('cancel_keeps_original_execution_and_applicability', $cancelled['execution_status'] === 'cancelled' && $cancelled['applicability'] === 'revoked' && $cancelled['progress']['state'] === 'revoked' && $cancelled['progress']['poll_after_ms'] === 0);
    s76check('cancelled_projection_has_no_retry', !in_array('retry',$cancelled['progress']['next_actions'],true));
    $flow->versions['session-a']=2; $superseded=$service->getProgress(1,'extract-succeeded');
    s76check('changed_inputs_override_success', $superseded['execution_status']==='succeeded' && $superseded['applicability']==='superseded' && $superseded['progress']['state']==='superseded' && $superseded['progress']['next_actions']===['reconcile']);
    s76check('invalidated_result_is_erased', $repo->find('extract-succeeded')['input']===[] && $repo->find('extract-succeeded')['result']===[] && $repo->find('extract-succeeded')['receipts']===[]);
    $flow->versions['session-a']=1; $flow->members[10]=[2]; $revoked=$service->getProgress(1,'questions-queued');
    s76check('removed_space_member_revokes_queued_task', $revoked['execution_status']==='cancelled' && $revoked['applicability']==='revoked' && $revoked['progress']['poll_after_ms']===0 && $revoked['progress']['next_actions']===[]);
    $flow->members[10]=[1,2];
    $legacy=new ProfileAiJobService(new S76LegacyJobs($repo),$flow,$resolver,$clock);
    s76check('legacy_repository_still_supports_single_job', $legacy->getProgress(1,'extract-failed')['id']==='extract-failed');
    s76reject('legacy_repository_reports_missing_session_capability','AI_PROGRESS_UNAVAILABLE',fn()=>$legacy->progressForSession(1,'session-a'));

    // Twenty-one row look-ahead, exact context isolation, and all ten live tasks retained.
    $repo=new InMemoryProfileAiJobRepository(); $service=new ProfileAiJobService($repo,$flow,$resolver,$clock);
    for($i=0;$i<35;++$i) { $j=s76job(sprintf('history-%02d',$i),'succeeded'); $j['updated_at']=sprintf('2026-11-12 11:00:%02d',$i); $repo->save($j); }
    for($i=0;$i<10;++$i) $repo->save(s76job(sprintf('active-%02d',$i)));
    $repo->save(s76job('foreign-owner','queued','extract','session-a',2));
    $repo->save(s76job('foreign-session','queued','extract','session-b'));
    $unbound=s76job('unbound');unset($unbound['context']['session_id']);$repo->save($unbound);
    $numeric=s76job('numeric-session');$numeric['context']['session_id']=123;$repo->save($numeric);
    $repo->save(s76job('case-session','queued','extract','SESSION-A'));
    $snapshot=$repo->jobs;$batch=$service->progressForSession(1,'session-a');
    s76check('session_maximum_twenty_plus_has_more',count($batch['tasks'])===20 && $batch['has_more']===true);
    s76check('all_ten_active_tasks_precede_history',array_column(array_slice($batch['tasks'],0,10),'id')===array_map(fn($i)=>sprintf('active-%02d',$i),range(9,0)));
    s76check('history_is_recent_first',array_column(array_slice($batch['tasks'],10),'id')===array_map(fn($i)=>sprintf('history-%02d',$i),range(34,25)));
    s76check('batch_is_exact_owner_and_session',array_intersect(array_column($batch['tasks'],'id'),['foreign-owner','foreign-session','unbound','numeric-session','case-session'])===[]);
    s76check('numeric_context_does_not_match_string_session',$service->progressForSession(1,'123')===['tasks'=>[],'has_more'=>false]);
    s76check('other_session_only_its_saved_task',array_column($service->progressForSession(1,'session-b')['tasks'],'id')===['foreign-session']);
    s76check('other_owner_only_its_saved_task',array_column($service->progressForSession(2,'session-a')['tasks'],'id')===['foreign-owner']);
    s76check('empty_session_is_empty_without_fabrication',$service->progressForSession(1,'missing')===['tasks'=>[],'has_more'=>false]);
    s76check('batch_poll_does_not_write_or_copy_private_text',$snapshot===$repo->jobs && !str_contains(json_encode($batch),'PRIVATE-S76-'));
    s76check('memory_query_caps_caller_limit',count($repo->forSession(1,'session-a',10000))===21 && count($repo->forSession(1,'session-a',1))===1);
    $exactRepo=new InMemoryProfileAiJobRepository();foreach(array_slice($repo->forSession(1,'session-a'),0,20) as $j)$exactRepo->save($j);
    $exact=new ProfileAiJobService($exactRepo,$flow,$resolver,$clock);$exactBatch=$exact->progressForSession(1,'session-a');
    s76check('exactly_twenty_has_no_false_more',count($exactBatch['tasks'])===20 && $exactBatch['has_more']===false);
    $stale=$repo->find('active-09');$stale['context']['version']=0;$repo->save($stale);
    $expired=$repo->find('active-08');$expired['execution_status']='running';$expired['started_at']='2026-11-12 09:00:00';$repo->save($expired);
    $batch=$service->progressForSession(1,'session-a');
    s76check('session_revalidates_expired_and_changed_tasks',$repo->find('active-09')['applicability']==='superseded' && $repo->find('active-08')['execution_status']==='failed');
    s76check('session_reorders_after_invalidation',array_column(array_slice($batch['tasks'],0,8),'id')===array_map(fn($i)=>sprintf('active-%02d',$i),range(7,0)));
    s76check('progress_has_no_model_capture_install_or_apply',$engineResolutions===0 && $flow->captures===0 && $flow->installs===0 && $flow->adoptions===0);

    // Source polling only returns the owner resource and its own read-job summary.
    $profiles=new InMemoryProfileRepository();$access=new InMemoryProfileAccessPolicy();$access->users=[1,2];
    $profileService=new ProfileService($profiles,$access);$workflow=new InMemoryProfileWorkflow($profiles,$profileService,$access);
    $sources=new S76Sources(new InMemoryProfileSourceRepository());$readerResolutions=0;
    $sourceService=new ProfileSourceService($sources,$workflow,$access,static function()use(&$readerResolutions):never{++$readerResolutions;throw new LogicException('No reader during progress.');});
    foreach(['github','resume','web','text'] as $kind) {
        $source=['id'=>'source-'.$kind,'owner_id'=>1,'kind'=>$kind,'source_key'=>'PRIVATE-S76-SOURCEKEY','version'=>1,'status'=>'ready',
            'label'=>'PRIVATE-S76-LABEL','external_id'=>'PRIVATE-S76-EXTERNAL','canonical_url'=>'https://example.invalid/PRIVATE-S76-URL',
            'latest_snapshot_id'=>'snapshot-'.$kind,'last_job_id'=>'read-'.$kind,'created_at'=>'2026-11-12 10:00:00','updated_at'=>'2026-11-12 10:00:00','deleted_at'=>null];
        $sources->saveSource($source);
        $sources->saveSnapshot(['id'=>'snapshot-'.$kind,'source_id'=>$source['id'],'version'=>1,'created_at'=>$source['created_at'],'content'=>['raw_text'=>'PRIVATE-S76-RAW','candidates'=>[['value'=>'PRIVATE-S76-CANDIDATE']]]]);
        $sources->saveJob(['id'=>'read-'.$kind,'owner_id'=>1,'source_id'=>$source['id'],'source_version'=>1,'operation'=>'import','request_hash'=>'PRIVATE-S76-HASH','execution_status'=>'succeeded','applicability'=>'current','error_code'=>null,'result'=>['snapshot_id'=>'snapshot-'.$kind],'created_at'=>$source['created_at'],'updated_at'=>$source['updated_at']]);
        $progress=$sourceService->getProgress(1,$source['id']); s76schema($kind.'_source_schema',$progress['progress']);
        s76check($kind.'_source_compact_and_ready',!str_contains(json_encode($progress),'PRIVATE-S76-') && !isset($progress['snapshot'],$progress['latest_snapshot_id'],$progress['canonical_url'],$progress['label']) && $progress['status']==='ready' && $progress['last_job']['applicability']==='current' && $progress['progress']['poll_after_ms']===0);
    }
    s76check('source_progress_never_loads_snapshots_or_readers',$sources->snapshotReads===0 && $readerResolutions===0);
    $original=$sourceService->get(1,'source-github');s76check('source_dto_keeps_original_snapshot_and_fields',$original['snapshot']['raw_text']==='PRIVATE-S76-RAW' && $original['label']==='PRIVATE-S76-LABEL' && $original['progress']===$sourceService->getProgress(1,'source-github')['progress']);
    s76reject('foreign_source_progress_hidden','SOURCE_NOT_FOUND',fn()=>$sourceService->getProgress(2,'source-github'));
    s76reject('anonymous_source_progress_denied','AUTHENTICATION_REQUIRED',fn()=>$sourceService->getProgress(0,'source-github'));
    $access->users=[2];s76reject('disabled_source_owner_denied','PROFILE_ACCESS_DENIED',fn()=>$sourceService->getProgress(1,'source-github'));$access->users=[1,2];
    foreach(['running'=>['reading_source',1000,[]],'failed'=>['failed',0,['refresh_source']]] as $status=>$expected) {
        $source=$sources->findSource('source-text');$source['status']=$status;$sources->saveSource($source);
        $job=$sources->findJob('read-text');$job['execution_status']=$status;$job['error_code']=$status==='failed'?'SOURCE_READ_FAILED':null;$sources->saveJob($job);
        $progress=$sourceService->getProgress(1,'source-text');
        s76check('source_'.$status.'_reflects_real_read',$progress['status']===$status && $progress['last_job']['execution_status']===$status && $progress['progress']['state']===$expected[0] && $progress['progress']['poll_after_ms']===$expected[1] && $progress['progress']['next_actions']===$expected[2]);
    }
    $source=$sources->findSource('source-text');$source['status']='ready';++$source['version'];$sources->saveSource($source);
    $superseded=$sourceService->getProgress(1,'source-text');s76check('source_old_read_cannot_appear_current',$superseded['last_job']['applicability']==='superseded' && $superseded['progress']['state']==='superseded');
    $source=$sources->findSource('source-github');$source['last_job_id']='read-web';$sources->saveSource($source);
    s76check('source_rejects_another_source_job_summary',$sourceService->getProgress(1,'source-github')['last_job']===null);
    $source['last_job_id']='read-github';$sources->saveSource($source);$job=$sources->findJob('read-github');$job['owner_id']=2;$sources->saveJob($job);
    s76check('source_rejects_foreign_owner_job_summary',$sourceService->getProgress(1,'source-github')['last_job']===null);
    $access->maintenance=true;s76check('maintenance_keeps_source_progress_available',$sourceService->getProgress(1,'source-resume')['status']==='ready');$access->maintenance=false;
    $before=[$sources->inner->sources,$sources->inner->jobs,$sources->inner->snapshots];$readCount=$sources->snapshotReads;
    $sourceService->getProgress(1,'source-resume');$sourceService->getProgress(1,'source-resume');
    s76check('source_polls_are_stable_without_side_effects',$before===[$sources->inner->sources,$sources->inner->jobs,$sources->inner->snapshots] && $readCount===$sources->snapshotReads && $readerResolutions===0);
    $deleted=$sourceService->delete(1,'source-resume',1);s76check('delete_keeps_explicit_revoked_progress',$deleted['progress']['state']==='revoked' && $deleted['last_job']['applicability']==='revoked' && $deleted['progress']['poll_after_ms']===0);
    s76reject('deleted_source_progress_not_readable','SOURCE_NOT_FOUND',fn()=>$sourceService->getProgress(1,'source-resume'));

    // A completed legacy AI batch may be stale for values while its private counts remain readable.
    $access->memberships[10]=[1];$questionRepo=new InMemoryQuestionRepository();
    $questionService=new QuestionService($questionRepo,$workflow);
    $questionRepo->saveBatch(['id'=>'legacy-ai-batch','owner_id'=>1,'space_id'=>10,'version'=>7,
        'generation_mode'=>'ai','policy_version'=>str_repeat('b',64),
        'questions'=>[['id'=>'q1','text'=>'PRIVATE-S76-OLD-QUESTION'],['id'=>'q2','text'=>'PRIVATE-S76-OLD-QUESTION'],['id'=>'q3','text'=>'PRIVATE-S76-OLD-QUESTION']]]);
    $questionRepo->saveAnswer(['id'=>'a1','batch_id'=>'legacy-ai-batch','question_id'=>'q1','answer_type'=>'free_text','free_text'=>'PRIVATE-S76-OLD-ANSWER']);
    $questionRepo->saveAnswer(['id'=>'a2','batch_id'=>'legacy-ai-batch','question_id'=>'q2','answer_type'=>'skipped','free_text'=>'']);
    s76reject('legacy_ai_value_read_remains_blocked','AI_RESULT_NOT_APPLICABLE',fn()=>$questionService->get(1,'legacy-ai-batch'));
    $legacyCounts=$questionService->getProgressCounts(1,'legacy-ai-batch',1);
    s76check('legacy_ai_counts_bypass_only_stale_value_hash',$legacyCounts===['questions'=>['total'=>3,'answered'=>1,'skipped'=>1,'remaining'=>1,'current_index'=>1],'batch_version'=>7]);
    s76check('legacy_ai_counts_contain_no_question_answer_or_metadata',!str_contains(json_encode($legacyCounts),'PRIVATE-S76-') && array_keys($legacyCounts)===['questions','batch_version']);
    s76check('legacy_count_index_clamps_to_saved_questions',$questionService->getProgressCounts(1,'legacy-ai-batch',500)['questions']['current_index']===2 && $questionService->getProgressCounts(1,'legacy-ai-batch',-10)['questions']['current_index']===0);
    s76reject('legacy_counts_foreign_owner_hidden','QUESTION_BATCH_NOT_FOUND',fn()=>$questionService->getProgressCounts(2,'legacy-ai-batch'));
    s76reject('legacy_counts_missing_batch_hidden','QUESTION_BATCH_NOT_FOUND',fn()=>$questionService->getProgressCounts(1,'missing-batch'));
    $access->memberships[10]=[];s76reject('legacy_counts_live_space_membership_required','PROFILE_ACCESS_DENIED',fn()=>$questionService->getProgressCounts(1,'legacy-ai-batch'));$access->memberships[10]=[1];
    $access->users=[2];s76reject('legacy_counts_live_account_required','PROFILE_ACCESS_DENIED',fn()=>$questionService->getProgressCounts(1,'legacy-ai-batch'));$access->users=[1,2];
    $access->maintenance=true;$countState=serialize([$questionRepo->batches,$questionRepo->answerRows,$profiles->states]);
    $questionService->getProgressCounts(1,'legacy-ai-batch');$questionService->getProgressCounts(1,'legacy-ai-batch');
    s76check('historical_counts_do_not_change_saved_data',$countState===serialize([$questionRepo->batches,$questionRepo->answerRows,$profiles->states]));$access->maintenance=false;
    $empty=$questionRepo->findBatch('legacy-ai-batch');$empty['id']='empty-global-batch';$empty['space_id']=null;$empty['questions']=[];$questionRepo->saveBatch($empty);
    s76check('empty_global_history_has_no_invented_current_question',$questionService->getProgressCounts(1,'empty-global-batch')===['questions'=>['total'=>0,'answered'=>0,'skipped'=>0,'remaining'=>0,'current_index'=>null],'batch_version'=>7]);

    // Exercise the actual SQL query on a fresh in-memory database with no app config.
    require $backend.'/protected/vendor/autoload.php';
    require $backend.'/protected/vendor/yiisoft/yii2/Yii.php';
    $db=new yii\db\Connection(['dsn'=>'sqlite::memory:','enableLogging'=>false,'enableProfiling'=>false,'schemaCache'=>null,'queryCache'=>null]);$db->open();
    $columns=['id'=>'TEXT PRIMARY KEY','owner_id'=>'INTEGER','space_id'=>'INTEGER','operation'=>'TEXT','request_hash'=>'TEXT','execution_status'=>'TEXT','applicability'=>'TEXT','error_code'=>'TEXT','attempt'=>'INTEGER','retry_of'=>'TEXT','context_json'=>'TEXT','input_json'=>'TEXT','result_json'=>'TEXT','metrics_json'=>'TEXT','receipts_json'=>'TEXT','created_at'=>'TEXT','updated_at'=>'TEXT','started_at'=>'TEXT','finished_at'=>'TEXT'];
    $db->createCommand()->createTable('matcher_profile_ai_job',$columns)->execute();
    $db->createCommand()->createIndex('ai_job_owner_created','matcher_profile_ai_job',['owner_id','created_at'])->execute();
    foreach($repo->jobs as $job) { foreach(['context','input','result','metrics','receipts'] as $key){$job[$key.'_json']=json_encode($job[$key],JSON_THROW_ON_ERROR);unset($job[$key]);}$db->createCommand()->insert('matcher_profile_ai_job',$job)->execute(); }
    $sql=new SqlProfileAiJobRepository($db);
    s76check('sql_and_memory_order_and_limit_match',$sql->forSession(1,'session-a',1000)==$repo->forSession(1,'session-a',1000));
    s76check('sql_and_memory_exact_owner_match',$sql->forSession(2,'session-a')==$repo->forSession(2,'session-a'));
    s76check('sql_and_memory_exact_session_match',$sql->forSession(1,'session-b')==$repo->forSession(1,'session-b'));
    s76check('sql_session_json_number_does_not_match_string',$sql->forSession(1,'123')===[]);
    s76check('sql_session_comparison_is_case_sensitive',array_column($sql->forSession(1,'SESSION-A'),'id')===['case-session']);
    s76check('sql_query_parameterizes_session_input',$sql->forSession(1,"session-a' OR 1=1 --")===[]);
    $plan=$db->createCommand("EXPLAIN QUERY PLAN SELECT * FROM matcher_profile_ai_job WHERE owner_id=:owner AND json_type(context_json, '$.session_id')='text' AND json_extract(context_json, '$.session_id')=:session ORDER BY CASE WHEN applicability='current' AND execution_status IN ('queued','running') THEN 0 ELSE 1 END ASC,updated_at DESC,created_at DESC,id DESC LIMIT 21",[':owner'=>1,':session'=>'session-a'])->queryAll();
    s76check('sqlite_query_uses_existing_owner_index',str_contains(json_encode($plan),'ai_job_owner_created'));$db->close();
    $rules=file_get_contents($moduleRoot.'/config.php');
    $route=strpos($rules, "'api/v1/me/profile/sources/<id:[a-f0-9-]+>/progress' => 'matcher-user-profile/source/progress'");
    $fallback=strpos($rules, "'api/v1/me/<unknown:.*>'");
    s76check('source_progress_route_precedes_generic_fallback',$route!==false && $fallback!==false && $route<$fallback);
    // Parse actual route literals without bootstrapping HumHub or loading any application config.
    $extractRules=static function(string $path):array {
        $code=file_get_contents($path);$code=substr($code,strpos($code,"'urlManagerRules'"));$code=explode("'events'",$code)[0];
        preg_match_all("/'([^']+)'[[:space:]]*=>[[:space:]]*'([^']+)'/",$code,$pairs,PREG_SET_ORDER);
        $out=[];foreach($pairs as $pair)$out[$pair[1]]=$pair[2];return $out;
    };
    $p1rules=$extractRules($moduleRoot.'/config.php');$p2rules=$extractRules(dirname($moduleRoot).'/matcher-onboarding/config.php');
    foreach(['P1_before_P2'=>array_merge($p1rules,$p2rules),'P2_before_P1'=>array_merge($p2rules,$p1rules),'P2_disabled'=>$p1rules] as $name=>$routes) {
        $manager=new yii\web\UrlManager(['enablePrettyUrl'=>true,'showScriptName'=>false,'rules'=>$routes,'cache'=>null]);
        $request=new yii\web\Request(['scriptUrl'=>'/index.php','scriptFile'=>__FILE__,'hostInfo'=>'http://localhost','pathInfo'=>'api/v1/me/profile/ai-jobs/11111111-1111-4111-a111-111111111111/progress']);
        $matched=$manager->parseRequest($request);
        s76check($name.'_reserves_AI_progress_without_owner_fallback',$matched[0]==='matcher-onboarding/api/ai-job-progress' && $matched[1]===['id'=>'11111111-1111-4111-a111-111111111111']);
    }
    echo json_encode(['status'=>'passed','passed'=>count($checks),'checks'=>$checks,'external_requests'=>0,'real_llm_calls'=>0,'engine_resolutions'=>$engineResolutions,'reader_resolutions'=>$readerResolutions,'sqlite'=>'temporary memory only','mysql'=>'not exercised in this offline test','scope'=>'P1 S7.6 task/source progress; HTTP/real MySQL are independently tested'],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE),PHP_EOL;
} catch (Throwable $e) {
    echo json_encode(['status'=>'failed','passed'=>count($checks),'checks'=>$checks,'error'=>$e->getMessage(),'type'=>get_class($e),'location'=>basename($e->getFile()).':'.$e->getLine()],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE),PHP_EOL; exit(1);
}
