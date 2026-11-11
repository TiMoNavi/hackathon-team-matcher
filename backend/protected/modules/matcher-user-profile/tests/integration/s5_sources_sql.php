<?php
declare(strict_types=1);
/** Uses only the S5 clone bootstrap; creates synthetic users and never contacts providers. */
$app=require dirname(__DIR__,3).'/matcher-onboarding/tests/integration/s5_http_bootstrap.php';
use humhub\modules\matcherProfile\application\ProfileSourceService;
use humhub\modules\matcherProfile\domain\ports\ProfileSourceReader;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\adapters\persistence\SqlProfileSourceRepository;
use humhub\modules\matcherProfile\adapters\persistence\SourceSchemaInstaller;
use yii\db\Query;
$checks=[];$ok=static function(string $name,bool $test)use(&$checks):void{if(!$test)throw new RuntimeException($name);$checks[]=$name;};
$deny=static function(string $name,callable $perform,int $status)use($ok):void{try{$perform();}catch(ProfileException $e){$ok($name,$e->httpStatus===$status);return;}throw new RuntimeException($name);};
try {
    $db=$app->db;$p1=$app->getModule('matcher-user-profile');(new SourceSchemaInstaller($db))->install();(new SourceSchemaInstaller($db))->install();$ok('source_schema_repeated_installation',true);
    foreach(['matcher_profile_source','matcher_profile_source_snapshot','matcher_profile_source_job'] as $table)$ok($table.'_exists',$db->schema->getTableSchema('{{%'.$table.'}}',true)!==null);
    $users=[];foreach(['owner','other'] as $role){$u=new humhub\modules\user\models\User();$u->username='s5_source_'.$role.'_'.bin2hex(random_bytes(4));$u->email=$u->username.'@example.invalid';$u->status=1;$u->language='en-US';$u->save(false);$p=new humhub\modules\user\models\Profile();$p->user_id=$u->id;$p->save(false);$users[$role]=(int)$u->id;}
    $owner=$users['owner'];$other=$users['other'];$repository=new SqlProfileSourceRepository($db);
    $reader=new class($db) implements ProfileSourceReader {
        public int $calls=0;public bool $outsideTransactions=true;public ?Closure $hook=null;
        public function __construct(private yii\db\Connection $db){}
        public function kind():string{return 'github';}
        public function status(int $ownerId):array{return ['available'=>true,'provider_user_id'=>'2002','linked'=>true];}
        public function read(int $ownerId,array $input):array{++$this->calls;$this->outsideTransactions=$this->outsideTransactions&&!($this->db->getTransaction()?->isActive??false);if($this->hook){$h=$this->hook;$this->hook=null;$h();}return ['external_id'=>'github:2002','label'=>'Synthetic SQL GitHub','canonical_url'=>'https://github.com/synthetic-sql','raw_text'=>'Private synthetic SQL original','sections'=>[['id'=>'p1','label'=>'Project','text'=>'Private synthetic SQL original','locator'=>['line'=>1]]],'candidates'=>[['id'=>'project','key'=>'project','value'=>['title'=>'Synthetic SQL project','contribution'=>'Backend API'],'evidence'=>['p1']],['id'=>'city','key'=>'city','value'=>'Imported city','evidence'=>['p1']]],'metadata'=>['generation_mode'=>'rules','llm_calls'=>0]];}
    };
    $factory=fn()=>new ProfileSourceService($repository,$p1->getProfileWorkflow(),$p1->getAccessPolicy(),fn($kind)=>$kind==='github'?$reader:null);$service=$factory();
    $source=$service->import($owner,'github',[],'sql-source-first');$ok('read_executes_outside_database_transaction',$reader->outsideTransactions);$ok('source_and_job_saved_ready',$source['status']==='ready'&&$source['last_job']['execution_status']==='succeeded');
    $ok('snapshot_is_native_json_object',$db->createCommand('SELECT JSON_TYPE(content_json) FROM {{%matcher_profile_source_snapshot}} WHERE id=:id',[':id'=>$source['latest_snapshot_id']])->queryScalar()==='OBJECT');
    $reloaded=$factory()->get($owner,$source['id']);$ok('structured_snapshot_roundtrips_mysql',$reloaded['snapshot']['raw_text']===$source['snapshot']['raw_text']&&$reloaded['snapshot']['candidates'][0]['value']==$source['snapshot']['candidates'][0]['value']);
    $ok('list_omits_private_text',$service->list($owner)['sources'][0]['snapshot']===null);$deny('other_user_cannot_read_source',fn()=>$service->get($other,$source['id']),404);
    $ok('same_key_does_not_repeat_read',$service->import($owner,'github',[],'sql-source-first')['id']===$source['id']&&$reader->calls===1);
    $ok('new_key_reuses_source_without_network',$service->import($owner,'github',[],'sql-source-new-key')['id']===$source['id']&&$reader->calls===1);
    $workflow=$p1->getProfileWorkflow();$draft=$workflow->createDraft($owner,null);$draft=$workflow->updateDraft($owner,null,$draft['id'],$draft['draft_version'],[['key'=>'city','value'=>'Handwritten city','visibility'=>'friends']]);
    $result=$service->apply($owner,$source['id'],1,$draft['id'],$draft['draft_version'],['project','city'],'sql-apply-1');$draft=$result['draft'];$ok('candidate_adoption_preserves_existing_value',$result['applied']===['project']&&$result['skipped'][0]['reason']==='existing_value');
    $ok('import_stays_unconfirmed',$p1->getProfileService()->getProfile($owner,$owner,ProfileScope::global())['attributes']===[]);
    $again=$service->apply($owner,$source['id'],1,$draft['id'],$draft['draft_version'],['project'],'sql-apply-duplicate');$ok('mysql_json_order_does_not_duplicate_project',$again['applied']===[]&&$again['skipped'][0]['reason']==='same_value'&&$again['draft']['draft_version']===$draft['draft_version']);
    $deny('old_draft_version_rejected',fn()=>$service->apply($owner,$source['id'],1,$draft['id'],1,['project'],'sql-apply-stale'),409);
    $refreshed=$service->refresh($owner,$source['id'],1,[],'sql-refresh-1');$ok('refresh_keeps_two_private_versions',(int)(new Query())->from('{{%matcher_profile_source_snapshot}}')->where(['source_id'=>$source['id']])->count('*',$db)===2);
    $ok('old_task_marked_superseded',$repository->findJob($source['last_job_id'])['applicability']==='superseded');$deny('stale_source_version_rejected',fn()=>$service->apply($owner,$source['id'],1,$draft['id'],$draft['draft_version'],['project'],'sql-apply-old-source'),409);
    $ok('refresh_replay_not_refetched',$service->refresh($owner,$source['id'],1,[],'sql-refresh-1')['version']===2&&$reader->calls===2);
    $faultRepository=new class($repository) implements \humhub\modules\matcherProfile\domain\ports\ProfileSourceRepository {
        public function __construct(private SqlProfileSourceRepository $inner){}
        public function transaction(callable $callback):mixed{return $this->inner->transaction($callback);}
        public function listSources(int $id):array{return $this->inner->listSources($id);}
        public function hasSourceHistory(int $id,string $kind):bool{return $this->inner->hasSourceHistory($id,$kind);}
        public function findSource(string $id,bool $lock=false):?array{return $this->inner->findSource($id,$lock);}
        public function findSourceKey(int $id,string $kind,string $key):?array{return $this->inner->findSourceKey($id,$kind,$key);}
        public function saveSource(array $source):void{$this->inner->saveSource($source);}
        public function findSnapshot(string $id):?array{return $this->inner->findSnapshot($id);}
        public function saveSnapshot(array $snapshot):void{$this->inner->saveSnapshot($snapshot);}
        public function purgeSnapshots(string $id):void{$this->inner->purgeSnapshots($id);}
        public function findJob(string $id):?array{return $this->inner->findJob($id);}
        public function saveJob(array $job):void{$this->inner->saveJob($job);if($job['operation']==='apply')throw new RuntimeException('Synthetic failure after draft and receipt writes');}
        public function changeJobApplicability(string $id,string $value):void{$this->inner->changeJobApplicability($id,$value);}
    };
    $faultService=new ProfileSourceService($faultRepository,$workflow,$p1->getAccessPolicy(),fn($kind)=>$reader);$faultDraft=$workflow->createDraft($owner,null);
    $jobCount=(int)(new Query())->from('{{%matcher_profile_source_job}}')->where(['owner_id'=>$owner])->count('*',$db);
    try{$faultService->apply($owner,$source['id'],2,$faultDraft['id'],$faultDraft['draft_version'],['project'],'sql-apply-rollback');throw new LogicException('Failure was not reached');}catch(RuntimeException $error){$ok('failure_after_draft_and_receipt_writes_reached',$error->getMessage()==='Synthetic failure after draft and receipt writes');}
    $after=$workflow->getDraft($owner,null,$faultDraft['id']);$ok('failed_adoption_rolls_back_draft_fields_and_version',$after['fields']===[]&&$after['draft_version']===$faultDraft['draft_version']);
    $ok('failed_adoption_rolls_back_receipt',(int)(new Query())->from('{{%matcher_profile_source_job}}')->where(['owner_id'=>$owner])->count('*',$db)===$jobCount);
    $reader->hook=function()use($service,$owner,$source){$service->delete($owner,$source['id'],3);};$late=$service->refresh($owner,$source['id'],2,[],'sql-late-delete');$ok('late_result_does_not_restore_deleted_source',$late['status']==='deleted'&&$late['snapshot']===null);
    $ok('deletion_erases_all_snapshot_versions',(int)(new Query())->from('{{%matcher_profile_source_snapshot}}')->where(['source_id'=>$source['id']])->count('*',$db)===0);
    $ok('jobs_keep_references_without_original_text',!str_contains(json_encode((new Query())->from('{{%matcher_profile_source_job}}')->where(['source_id'=>$source['id']])->all($db)),'Private synthetic SQL original'));
    $ok('all_related_jobs_revoked',(int)(new Query())->from('{{%matcher_profile_source_job}}')->where(['source_id'=>$source['id']])->andWhere(['<>','applicability','revoked'])->count('*',$db)===0);
    $ok('deleted_metadata_is_minimal',$late['external_id']===null&&$late['canonical_url']===null);$ok('deleted_source_history_prevents_automatic_import',$service->capabilities($owner)['readers']['github']['imported_before']===true);
    $ok('adopted_draft_retained_after_source_delete',$workflow->getDraft($owner,null,$draft['id'])['draft_version']===$draft['draft_version']);$deny('deleted_source_details_not_available',fn()=>$service->get($owner,$source['id']),404);
    $fresh=$service->import($owner,'github',[],'sql-explicit-reimport');$ok('explicit_reimport_uses_fresh_identity',$fresh['id']!==$source['id']);
    echo json_encode(['status'=>'passed','passed'=>count($checks),'checks'=>$checks,'external_requests'=>0,'llm_calls'=>0],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE).PHP_EOL;
}catch(Throwable $error){fwrite(STDERR,json_encode(['status'=>'failed','type'=>get_class($error),'check'=>$error instanceof RuntimeException&&!$error instanceof yii\db\Exception?$error->getMessage():'SQL integration failed without exposing diagnostics']).PHP_EOL);exit(1);}
