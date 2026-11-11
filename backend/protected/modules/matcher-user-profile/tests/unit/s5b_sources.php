<?php
declare(strict_types=1);
$root=dirname(__DIR__,2);
spl_autoload_register(static function(string $class)use($root):void{$prefix='humhub\\modules\\matcherProfile\\';if(str_starts_with($class,$prefix)){$p=$root.'/'.str_replace(chr(92),'/',substr($class,strlen($prefix))).'.php';if(is_file($p))require $p;}});
use humhub\modules\matcherProfile\application\ProfileSourceService;
use humhub\modules\matcherProfile\application\ProfileService;
use humhub\modules\matcherProfile\domain\ports\IdentifiedProfileSourceReader;
use humhub\modules\matcherProfile\domain\ports\ProfileSourceRepository;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileRepository;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileAccessPolicy;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileWorkflow;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileSourceRepository;

final class S5BFixtureReader implements IdentifiedProfileSourceReader
{
    public int $calls=0,$identifications=0;public ?Closure $hook=null;public ?string $failure=null;public bool $wrongUrl=false;
    public function __construct(private string $type){}
    public function kind():string{return $this->type;}
    public function status(int $ownerId):array{return ['kind'=>$this->type,'available'=>true,'provider_user_id'=>'3101'];}
    public function identify(int $ownerId,array $input):array
    {
        ++$this->identifications;
        if(($input['ownership']??null)!=='self')throw new ProfileException('SOURCE_OWNERSHIP_REQUIRED','Declare your own source.');
        $allowed=$this->type==='web'?['url','ownership']:['text','label','ownership'];
        if(array_diff(array_keys($input),$allowed)!==[])throw new ProfileException('INVALID_SOURCE','Unsupported input.');
        $value=$this->type==='web'?($input['url']??null):($input['text']??null);
        if(!is_string($value)||$value==='')throw new ProfileException('INVALID_SOURCE','Provide source input.');
        if($this->type==='text')$value=str_replace(["\r\n","\r"],"\n",$value);
        return ['external_id'=>$this->type.':'.hash('sha256',$value),'canonical_url'=>$this->type==='web'?$value:null,'label'=>$input['label']??'Synthetic '.$this->type,'ownership_basis'=>'self_declared'];
    }
    public function read(int $ownerId,array $input):array
    {
        ++$this->calls;
        $identity=match($this->type){'github'=>['external_id'=>'github:3101','canonical_url'=>'https://github.com/synthetic','label'=>'Synthetic GitHub'],'resume'=>['external_id'=>'sha256:'.str_repeat('a',64),'canonical_url'=>null,'label'=>'Synthetic resume'],default=>$this->identify($ownerId,$input)};
        if($this->hook){$hook=$this->hook;$this->hook=null;$hook($input);}
        if($this->failure)throw new ProfileException($this->failure,'Sensitive fake transport diagnostics',502);
        if($this->wrongUrl)$identity['canonical_url']='https://example.test/replacement';
        unset($identity['ownership_basis']);
        return $identity+['raw_text'=>'Synthetic private '.$this->type.' source','sections'=>[['id'=>'s1','label'=>'Fact','text'=>'City: Synthetic city','locator'=>['line'=>1]]],'candidates'=>[['id'=>'city','key'=>'city','value'=>'Synthetic city','evidence'=>['s1']],['id'=>'project','key'=>'project','value'=>['title'=>'Synthetic shared project'],'evidence'=>['s1']]],'metadata'=>['llm_calls'=>0]];
    }
}
$checks=[];
function ok(bool $value,string $name):void{global $checks;if(!$value)throw new RuntimeException($name);$checks[]=$name;}
function deny(callable $call,string $code,string $name):void{try{$call();}catch(ProfileException $e){ok($e->errorCode===$code,$name);return;}throw new RuntimeException('Expected '.$code.': '.$name);}
$profiles=new InMemoryProfileRepository();$access=new InMemoryProfileAccessPolicy();$access->users=[1,2];$access->memberships=[10=>[1]];
$profileService=new ProfileService($profiles,$access);$workflow=new InMemoryProfileWorkflow($profiles,$profileService,$access);$repo=new InMemoryProfileSourceRepository();$workflow->participants=[$repo];
$readers=[];foreach(['github','resume','web','text'] as $kind)$readers[$kind]=new S5BFixtureReader($kind);
$service=new ProfileSourceService($repo,$workflow,$access,fn($kind)=>$readers[$kind]??null);
$capabilities=$service->capabilities(1);ok(array_keys($capabilities['readers'])===['github','resume','web','text'],'four_reader_capabilities');
ok(array_sum(array_map(fn($r)=>$r->calls+$r->identifications,$readers))===0,'capabilities_do_not_identify_or_read');
$github=$service->import(1,'github',[],'s5b-github-import');$resume=$service->import(1,'resume',[],'s5b-resume-import',str_repeat('a',64));
ok($github['external_id']==='github:3101'&&$resume['external_id']==='sha256:'.str_repeat('a',64),'legacy_reader_identity_unchanged');
deny(fn()=>$service->import(1,'web',['url'=>'https://example.test/profile'],'s5b-no-ownership'),'SOURCE_OWNERSHIP_REQUIRED','self_declaration_required_before_source');
ok(count($repo->sources)===2&&$readers['web']->calls===0,'invalid_identity_has_no_storage_or_read');
$url='https://example.test/profile';$input=['url'=>$url,'ownership'=>'self'];
$readers['web']->hook=function(array $actual)use($repo,$url):void{$s=array_values(array_filter($repo->sources,fn($s)=>$s['kind']==='web'))[0];ok($s['canonical_url']===$url&&$s['status']==='running','original_url_saved_before_read');};
$readers['web']->failure='WEB_FETCH_FAILED';$web=$service->import(1,'web',$input,'s5b-web-first');
ok($web['status']==='failed'&&$web['canonical_url']===$url,'failed_first_read_retains_retry_target');
ok($web['last_job']['error_code']==='WEB_FETCH_FAILED'&&!str_contains(json_encode($repo->jobs),'Sensitive'),'read_failure_keeps_only_error_code');
ok($service->import(1,'web',$input,'s5b-web-first')['id']===$web['id']&&$readers['web']->calls===1,'failed_import_replay_does_not_fetch');
deny(fn()=>$service->refresh(1,$web['id'],1,['url'=>'https://example.test/other','ownership'=>'self'],'s5b-web-change'),'INVALID_SOURCE','refresh_rejects_caller_target');
$readers['web']->failure=null;$readers['web']->hook=function(array $actual)use($input):void{ok($actual===$input,'web_refresh_reconstructs_original_input');};
$web=$service->refresh(1,$web['id'],1,[],'s5b-web-recover');ok($web['status']==='ready'&&$web['version']===2,'failed_website_can_recover');
ok($web['snapshot']['metadata']['ownership_basis']==='self_declared','snapshot_retains_self_declaration_basis');
ok($service->import(1,'web',$input,'s5b-web-other-key')['id']===$web['id']&&$readers['web']->calls===2,'website_same_url_reuses_snapshot');
deny(fn()=>$service->import(1,'web',['url'=>'https://example.test/other','ownership'=>'self'],'s5b-web-other-key'),'IDEMPOTENCY_CONFLICT','same_request_key_cannot_switch_identity');
$readers['web']->wrongUrl=true;$changed=$service->refresh(1,$web['id'],2,[],'s5b-web-reader-change');ok($changed['status']==='failed'&&$changed['last_job']['error_code']==='SOURCE_IDENTITY_CHANGED'&&$changed['canonical_url']===$url,'reader_cannot_replace_original_canonical_url');$readers['web']->wrongUrl=false;
$web=$service->refresh(1,$web['id'],3,[],'s5b-web-reader-recover');
$textInput=['text'=>"City: Synthetic city\r\nProject: Synthetic shared project",'label'=>'Synthetic text','ownership'=>'self'];$text=$service->import(1,'text',$textInput,'s5b-text-first');
ok($text['status']==='ready'&&$text['canonical_url']===null,'text_shares_snapshot_contract_without_url');
$normalized=$textInput;$normalized['text']=str_replace("\r\n","\n",$normalized['text']);
ok($service->import(1,'text',$normalized,'s5b-text-normalized')['id']===$text['id']&&$readers['text']->calls===1,'normalized_text_identity_deduplicates');
deny(fn()=>$service->refresh(1,$text['id'],1,['text'=>'Changed text','ownership'=>'self'],'s5b-text-changed'),'SOURCE_IDENTITY_CHANGED','changed_text_requires_new_source');
deny(fn()=>$service->refresh(1,$text['id'],1,[],'s5b-text-missing'),'SOURCE_OWNERSHIP_REQUIRED','text_refresh_requires_source_input');
$text=$service->refresh(1,$text['id'],1,$normalized,'s5b-text-retry');ok($text['version']===2,'same_text_can_retry');
ok(count($service->list(1)['sources'])===4,'all_four_kinds_coexist');
ok(array_filter($service->list(1)['sources'],fn($s)=>$s['snapshot']!==null)===[],'all_list_entries_omit_private_text');
deny(fn()=>$service->get(2,$text['id']),'SOURCE_NOT_FOUND','text_private_to_owner');deny(fn()=>$service->get(2,$web['id']),'SOURCE_NOT_FOUND','web_private_to_owner');
$draft=$workflow->createDraft(1,null);$draft=$workflow->updateDraft(1,null,$draft['id'],$draft['draft_version'],[['key'=>'city','value'=>'Hand edited city','visibility'=>'friends']]);
$adopted=$service->apply(1,$web['id'],$web['version'],$draft['id'],$draft['draft_version'],['city','project'],'s5b-web-apply');$draft=$adopted['draft'];
ok($adopted['applied']===['project']&&$adopted['skipped'][0]['reason']==='existing_value','website_adoption_preserves_hand_edits');
$values=array_column($draft['preview_attributes'],null,'key');ok($values['city']['visibility']==='friends'&&$values['project']['visibility']==='authenticated','adoption_preserves_existing_privacy_default_new');
$dedup=$service->apply(1,$text['id'],$text['version'],$draft['id'],$draft['draft_version'],['project'],'s5b-text-apply');ok($dedup['applied']===[]&&$dedup['skipped'][0]['reason']==='same_value','text_and_web_candidates_deduplicate');
ok($profileService->getProfile(1,1,ProfileScope::global())['attributes']===[],'imports_remain_unconfirmed');
$readers['web']->hook=function()use($service,$web):void{$service->refresh(1,$web['id'],5,[],'s5b-web-newer-flight');};$late=$service->refresh(1,$web['id'],4,[],'s5b-web-older-flight');
ok($late['version']===6&&$late['status']==='ready','late_website_result_cannot_replace_newer_read');
$oldJobs=array_values(array_filter($repo->jobs,fn($job)=>$job['source_id']===$web['id']&&$job['source_version']===5));ok($oldJobs[0]['applicability']==='superseded','late_website_job_marked_superseded');
$readers['text']->hook=function()use($service,$text):void{$service->delete(1,$text['id'],3);};$deleted=$service->refresh(1,$text['id'],2,$normalized,'s5b-text-delete-flight');
ok($deleted['status']==='deleted'&&$deleted['snapshot']===null,'late_text_result_cannot_restore_deletion');
ok(array_filter($repo->snapshots,fn($s)=>$s['source_id']===$text['id'])===[],'text_delete_purges_all_private_versions');
ok(array_filter($repo->jobs,fn($j)=>$j['source_id']===$text['id']&&$j['applicability']!=='revoked')===[],'text_delete_revokes_all_jobs');
ok($service->capabilities(1)['readers']['text']['imported_before'],'deleted_text_remains_import_history');
ok($workflow->getDraft(1,null,$draft['id'])['draft_version']===$draft['draft_version'],'deleting_source_preserves_explicitly_adopted_draft');
$repo->failSnapshot=true;$before=count($repo->snapshots);
try{$service->refresh(1,$web['id'],6,[],'s5b-web-snapshot-failure');throw new LogicException('Expected persistence failure');}catch(RuntimeException $e){ok($e->getMessage()==='Synthetic storage failure','snapshot_failure_propagates');}
$stalled=$service->get(1,$web['id']);ok($stalled['status']==='running'&&$stalled['version']===7&&$stalled['snapshot']===null&&count($repo->snapshots)===$before,'snapshot_failure_rolls_back_finalization');
ok($stalled['last_job']['execution_status']==='running','snapshot_failure_does_not_claim_success');$repo->failSnapshot=false;
ok($service->refresh(1,$web['id'],7,[],'s5b-web-snapshot-recover')['status']==='ready','snapshot_failure_can_retry_explicitly');
for($i=count($service->list(1)['sources']);$i<20;++$i)$service->import(1,'text',['text'=>'Synthetic source '.$i,'ownership'=>'self'],'s5b-limit-'.$i);
ok(count($service->list(1)['sources'])===20,'twenty_source_limit_counts_all_kinds');deny(fn()=>$service->import(1,'web',['url'=>'https://example.test/overflow','ownership'=>'self'],'s5b-source-overflow'),'SOURCE_LIMIT_REACHED','shared_source_limit_rejects_twenty_first');
$missing=new ProfileSourceService($repo,$workflow,$access,fn($kind)=>in_array($kind,['github','resume'],true)?$readers[$kind]:null);ok(!$missing->capabilities(1)['readers']['web']['enabled']&&!$missing->capabilities(1)['readers']['text']['enabled'],'optional_web_module_unavailable_is_explicit');
ok($missing->get(1,$github['id'])['status']==='ready','legacy_source_works_without_web_module');
echo json_encode(['status'=>'passed','passed'=>count($checks),'checks'=>$checks,'database_calls'=>0,'external_requests'=>0,'llm_calls'=>0],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE).PHP_EOL;
