<?php
declare(strict_types=1);
$root=dirname(__DIR__,2);
spl_autoload_register(static function(string $class)use($root):void{$prefix=implode(chr(92),['humhub','modules','matcherProfile']).chr(92);if(str_starts_with($class,$prefix)){$p=$root.'/'.str_replace(chr(92),'/',substr($class,strlen($prefix))).'.php';if(is_file($p))require $p;}});
use humhub\modules\matcherProfile\application\ProfileSourceService;
use humhub\modules\matcherProfile\application\ProfileService;
use humhub\modules\matcherProfile\domain\ports\ProfileSourceReader;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileRepository;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileAccessPolicy;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileWorkflow;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileSourceRepository;
final class SyntheticSourceReader implements ProfileSourceReader
{
    public int $calls=0;public bool $available=true;public ?string $failure=null;public ?Closure $hook=null;public array $content;
    public function __construct(private string $type) {$this->content=['external_id'=>$type==='github'?'github:1001':'sha256:'.str_repeat('a',64),'label'=>'Synthetic source','canonical_url'=>$type==='github'?'https://github.com/synthetic':null,'raw_text'=>'Synthetic private source text','sections'=>[['id'=>'p1','label'=>'Introduction','text'=>'Synthetic private source text','locator'=>['line'=>1]]],'candidates'=>[['id'=>'bio','key'=>'bio','value'=>'Imported synthetic bio','evidence'=>['p1']],['id'=>'headline','key'=>'headline','value'=>'Imported headline','evidence'=>['p1']],['id'=>'project','key'=>'project','value'=>['title'=>'Synthetic project'],'evidence'=>['p1']]],'metadata'=>['generation_mode'=>'rules','llm_calls'=>0]];}
    public function kind():string{return $this->type;}
    public function status(int $ownerId):array{return ['kind'=>$this->type,'available'=>$this->available,'provider_user_id'=>'1001','linked'=>$this->available,'reason'=>$this->available?null:'NOT_LINKED'];}
    public function read(int $ownerId,array $input):array{++$this->calls;$result=$this->content;if($this->hook){$hook=$this->hook;$this->hook=null;$hook();}if($this->failure)throw new ProfileException($this->failure,'Secret raw provider diagnostic must not be retained.',502);return $result;}
}
$checks=[];
function check(bool $value,string $name):void{global $checks;if(!$value)throw new RuntimeException($name);$checks[]=$name;}
function reject(callable $call,string $code,string $name):void{try{$call();}catch(ProfileException $e){check($e->errorCode===$code,$name);return;}throw new RuntimeException('Expected '.$code.': '.$name);}
$profiles=new InMemoryProfileRepository();$access=new InMemoryProfileAccessPolicy();$access->users=[1,2];$access->memberships=[10=>[1]];$profileService=new ProfileService($profiles,$access);$workflow=new InMemoryProfileWorkflow($profiles,$profileService,$access);$repo=new InMemoryProfileSourceRepository();$workflow->participants=[$repo];$github=new SyntheticSourceReader('github');$resume=new SyntheticSourceReader('resume');$readers=['github'=>$github,'resume'=>$resume];$service=new ProfileSourceService($repo,$workflow,$access,fn($k)=>$readers[$k]??null);
check($service->capabilities(1)['readers']['github']['available']===true&&$github->calls===0,'capability_check_never_fetches');
check($service->list(1)['sources']===[],'new_owner_has_no_sources');
check($service->capabilities(1)['readers']['github']['imported_before']===false,'new_github_can_auto_import_once');
reject(fn()=>$service->list(0),'AUTHENTICATION_REQUIRED','anonymous_sources_rejected');
$g=$service->import(1,'github',[],'synthetic-key-1');check($g['status']==='ready'&&$g['version']===1,'github_import_stores_ready_source');check($g['snapshot']['raw_text']==='Synthetic private source text','original_text_retained_privately');check(count($g['snapshot']['sections'])===1&&count($g['snapshot']['candidates'])===3,'structured_sections_and_candidates_retained');
check($g['generation_mode']==='rules'&&$g['llm_calls']===0,'rules_zero_models');
check($service->list(1)['sources'][0]['snapshot']===null,'list_has_no_source_text');
check($service->list(2)['sources']===[],'other_owner_list_is_separate');
reject(fn()=>$service->get(2,$g['id']),'SOURCE_NOT_FOUND','source_details_owner_only');
check($service->import(1,'github',[],'synthetic-key-1')['id']===$g['id']&&$github->calls===1,'same_import_key_does_not_refetch');
check($service->import(1,'github',[],'synthetic-key-new')['id']===$g['id']&&$github->calls===1,'new_import_key_reuses_saved_github');
reject(fn()=>$service->import(1,'resume',[],'synthetic-key-new',str_repeat('a',64)),'IDEMPOTENCY_CONFLICT','deduplicated_import_still_claims_request_key');
$global=ProfileScope::global();$manual=$profileService->startDraft(1,1,$global);$manual=$profileService->updateDraft(1,1,$global,$manual['id'],$manual['draft_version'],[['key'=>'headline','value'=>'Handwritten pending headline','visibility'=>'private']]);
$applied=$service->apply(1,$g['id'],1,$manual['id'],$manual['draft_version'],['bio','headline','project'],'apply-key-first');
check(count($applied['applied'])===2&&$applied['skipped']===[['candidate_id'=>'headline','reason'=>'existing_value']],'adoption_preserves_existing_single_field');
$draft=$applied['draft'];$values=array_column($draft['preview_attributes'],null,'key');check($values['headline']['value']==='Handwritten pending headline'&&$values['headline']['visibility']==='private','manual_text_and_visibility_preserved');
check($values['bio']['visibility']==='authenticated','new_candidate_uses_default_visibility');
check($profileService->getProfile(1,1,$global)['attributes']===[],'adoption_does_not_publish');
check($service->apply(1,$g['id'],1,$manual['id'],$manual['draft_version'],['bio','headline','project'],'apply-key-first')['draft']['draft_version']===$draft['draft_version'],'apply_replay_keeps_same_draft_version');
$dedup=$service->apply(1,$g['id'],1,$draft['id'],$draft['draft_version'],['bio','project'],'apply-key-duplicate');check($dedup['applied']===[]&&$dedup['draft']['draft_version']===$draft['draft_version'],'same_values_do_not_duplicate_or_advance_draft');
reject(fn()=>$service->apply(1,$g['id'],1,$draft['id'],1,['bio'],'apply-key-stale'),'DRAFT_VERSION_CONFLICT','stale_draft_rejected');
reject(fn()=>$service->apply(1,$g['id'],1,$draft['id'],$draft['draft_version'],['bogus'],'apply-key-bogus'),'INVALID_SOURCE','unknown_candidate_rejected');
$foreign=$profileService->startDraft(2,2,$global);reject(fn()=>$service->apply(1,$g['id'],1,$foreign['id'],1,['bio'],'apply-key-foreign'),'PROFILE_NOT_FOUND','foreign_draft_rejected');
$space=$workflow->createDraft(1,10);reject(fn()=>$service->apply(1,$g['id'],1,$space['id'],1,['bio'],'apply-key-space'),'PROFILE_NOT_FOUND','source_targets_global_draft_only');
$g2=$service->refresh(1,$g['id'],1,[],'refresh-key-1');check($g2['version']===2&&$g2['snapshot']['id']!==$g['snapshot']['id'],'refresh_creates_versioned_snapshot');
check(count($repo->snapshots)===2,'older_snapshot_retained_until_delete');
check($repo->jobs[$g['last_job_id']]['applicability']==='superseded','old_read_marked_superseded');
check($service->refresh(1,$g['id'],1,[],'refresh-key-1')['version']===2&&$github->calls===2,'refresh_replay_does_not_fetch');
reject(fn()=>$service->refresh(1,$g['id'],1,[],'refresh-key-stale'),'SOURCE_VERSION_CONFLICT','stale_refresh_rejected');
reject(fn()=>$service->apply(1,$g['id'],1,$draft['id'],$draft['draft_version'],['bio'],'apply-old-snapshot'),'SOURCE_VERSION_CONFLICT','old_source_cannot_apply');
$github->failure='GITHUB_RATE_LIMITED';$failed=$service->refresh(1,$g['id'],2,[],'refresh-failure');check($failed['status']==='failed'&&$failed['last_job']['error_code']==='GITHUB_RATE_LIMITED','provider_failure_saved_as_retryable_record');
check(!str_contains(json_encode($repo->jobs),'Secret raw'),'provider_diagnostics_not_persisted');
reject(fn()=>$service->apply(1,$g['id'],3,$draft['id'],$draft['draft_version'],['bio'],'apply-failed'),'SOURCE_NOT_READY','failed_source_cannot_apply');
$github->failure=null;$recovered=$service->refresh(1,$g['id'],3,[],'refresh-recovered');check($recovered['status']==='ready'&&$recovered['version']===4,'explicit_retry_recovers_source');
$github->hook=function()use($service,$g){$service->refresh(1,$g['id'],5,[],'refresh-newer-in-flight');};$late=$service->refresh(1,$g['id'],4,[],'refresh-older-in-flight');check($late['version']===6&&$late['status']==='ready','late_result_cannot_overwrite_newer_source');
$oldJob=array_values(array_filter($repo->jobs,fn($j)=>$j['operation']==='refresh'&&$j['source_version']===5))[0];check($oldJob['execution_status']==='succeeded'&&$oldJob['applicability']==='superseded','late_success_retains_superseded_status');
$github->hook=function()use($service,$g){$service->delete(1,$g['id'],7);};$deleted=$service->refresh(1,$g['id'],6,[],'refresh-delete-flight');check($deleted['status']==='deleted'&&$deleted['snapshot']===null,'late_read_cannot_restore_deleted_source');
check($repo->snapshots===[],'delete_purges_all_source_snapshots');
check($deleted['external_id']===null&&$deleted['canonical_url']===null&&$deleted['label']==='已删除来源','delete_removes_identity_metadata');
check($service->delete(1,$g['id'],7)['version']===8,'delete_retry_is_idempotent');
check($service->capabilities(1)['readers']['github']['imported_before']===true,'deleted_source_is_not_implicitly_reimported');
reject(fn()=>$service->get(1,$g['id']),'SOURCE_NOT_FOUND','deleted_source_not_readable');
check(!str_contains(json_encode([$repo->sources,$repo->snapshots,$repo->jobs]),'Synthetic private source text'),'deleted_raw_text_absent_from_all_source_storage');
check($workflow->getDraft(1,null,$draft['id'])['draft_version']===$draft['draft_version'],'explicitly_adopted_draft_kept_after_source_delete');
$again=$service->import(1,'github',[],'new-after-delete');check($again['id']!==$g['id']&&$again['status']==='ready','explicit_reimport_after_delete_creates_new_source');
$github->available=false;reject(fn()=>$service->import(1,'github',[],'unlinked-import'),'SOURCE_READER_UNAVAILABLE','unlinked_github_not_fetched');$github->available=true;
$r=$service->import(1,'resume',['tmp_path'=>'synthetic-test-only'],'resume-upload-1',str_repeat('a',64));check($r['status']==='ready'&&$r['kind']==='resume','resume_uses_same_source_contract');
check($service->import(1,'resume',[],'resume-upload-2',str_repeat('a',64))['id']===$r['id']&&$resume->calls===1,'same_resume_hash_reuses_source');
reject(fn()=>$service->refresh(1,$r['id'],1,[],'resume-other-file',str_repeat('b',64)),'SOURCE_IDENTITY_CHANGED','different_resume_requires_new_source');
$resume->content['candidates'][0]['evidence']=['missing'];$bad=$service->refresh(1,$r['id'],1,[],'resume-invalid-evidence',str_repeat('a',64));check($bad['status']==='failed'&&$bad['last_job']['error_code']==='INVALID_SOURCE','invalid_evidence_rejected');
$resume->content['candidates'][0]['evidence']=['p1'];$resume->content['candidates'][0]['key']='event_goal';$bad=$service->refresh(1,$r['id'],2,[],'resume-invalid-scope',str_repeat('a',64));check($bad['status']==='failed','Space_candidate_not_accepted_as_global');
$access->maintenance=true;reject(fn()=>$service->import(1,'github',[],'maintenance-import'),'PROFILE_MAINTENANCE','maintenance_blocks_source_writes');check($service->get(1,$again['id'])['status']==='ready','maintenance_allows_owner_reads');
echo json_encode(['status'=>'passed','passed'=>count($checks),'checks'=>$checks,'database_calls'=>0,'llm_calls'=>0],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE).PHP_EOL;
