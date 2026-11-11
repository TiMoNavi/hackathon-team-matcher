<?php
declare(strict_types=1);
/** Uses only the S5B clone bootstrap; creates synthetic users and never contacts providers. */
$app=require dirname(__DIR__,3).'/matcher-onboarding/tests/integration/s5b_http_bootstrap.php';
use humhub\modules\matcherProfile\application\ProfileSourceService;
use humhub\modules\matcherProfile\domain\ports\ProfileSourceReader;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\adapters\persistence\SqlProfileSourceRepository;
use humhub\modules\matcherProfile\adapters\persistence\SourceSchemaInstaller;
use yii\db\Query;
use humhub\modules\matcherProfile\adapters\persistence\SourceKindSchemaUpgrade;
use humhub\modules\matcherProfile\domain\ports\IdentifiedProfileSourceReader;
$checks=[];$ok=static function(string $name,bool $test)use(&$checks):void{if(!$test)throw new RuntimeException($name);$checks[]=$name;};
$deny=static function(string $name,callable $perform,int $status)use($ok):void{try{$perform();}catch(ProfileException $e){$ok($name,$e->httpStatus===$status);return;}throw new RuntimeException($name);};
try {
    $db=$app->db;
    // Isolate the legacy CHECK exercise in a temporary, synthetic prefixed table.
    $prefix='s5b_kind_'.bin2hex(random_bytes(4)).'_';$table=$prefix.'matcher_profile_source';
    $constraint='mw_'.substr(hash('sha256',$prefix),0,8).'_source_kind';
    $probe=new yii\db\Connection(['dsn'=>$db->dsn,'username'=>$db->username,'password'=>$db->password,'charset'=>$db->charset,'tablePrefix'=>$prefix,'enableLogging'=>false,'enableProfiling'=>false,'enableSchemaCache'=>false]);
    $quoted=$db->quoteTableName($table);$quotedCheck=$db->quoteColumnName($constraint);
    try {
        $db->createCommand('CREATE TABLE '.$quoted.' (id int NOT NULL PRIMARY KEY,kind varchar(16) NOT NULL,payload text NOT NULL,CONSTRAINT '.$quotedCheck." CHECK (kind IN ('github','resume'))) ENGINE=InnoDB")->execute();
        $db->createCommand()->batchInsert($table,['id','kind','payload'],[[1,'github','Synthetic unchanged legacy GitHub'],[2,'resume','Synthetic unchanged legacy resume']])->execute();
        $before=$db->createCommand('SELECT * FROM '.$quoted.' ORDER BY id')->queryAll();
        $upgraded=(new SourceKindSchemaUpgrade($probe))->install();$ok('old_source_kind_check_upgraded',$upgraded['constraint_changed']===true);
        $ok('legacy_source_rows_unchanged_by_kind_upgrade',$before===$db->createCommand('SELECT * FROM '.$quoted.' ORDER BY id')->queryAll());
        $ok('kind_upgrade_repeat_is_noop',(new SourceKindSchemaUpgrade($probe))->install()['constraint_changed']===false);
        $db->createCommand()->batchInsert($table,['id','kind','payload'],[[3,'web','Synthetic web'],[4,'text','Synthetic text']])->execute();
        $ok('upgraded_check_accepts_all_four_kinds',(int)$db->createCommand('SELECT COUNT(*) FROM '.$quoted)->queryScalar()===4);
        try{$db->createCommand()->insert($table,['id'=>5,'kind'=>'unsupported','payload'=>'Synthetic invalid'])->execute();throw new LogicException('Expected kind rejection');}catch(yii\db\Exception){$ok('upgraded_check_still_rejects_unknown_kind',true);}
        $db->createCommand('ALTER TABLE '.$quoted.' DROP CHECK '.$quotedCheck.', ADD CONSTRAINT '.$quotedCheck." CHECK (kind IN ('github','resume','web','text','other'))")->execute();
        try{(new SourceKindSchemaUpgrade($probe))->install();throw new LogicException('Expected conflicting constraint refusal');}catch(RuntimeException $e){$ok('unexpected_constraint_is_not_silently_overwritten',$e->getMessage()==='The existing source kind CHECK conflicts with the supported upgrade.');}
        $ok('conflicting_upgrade_keeps_rows',(int)$db->createCommand('SELECT COUNT(*) FROM '.$quoted)->queryScalar()===4);
    }finally{$probe->close();$db->createCommand('DROP TABLE IF EXISTS '.$quoted)->execute();}
    $legacyTables=['matcher_profile_source','matcher_profile_source_snapshot','matcher_profile_source_job'];$legacyFingerprints=[];
    foreach($legacyTables as $table)$legacyFingerprints[$table]=hash('sha256',json_encode((new Query())->from('{{%'.$table.'}}')->orderBy('id')->all($db)));
    $db=$app->db;$p1=$app->getModule('matcher-user-profile');(new SourceSchemaInstaller($db))->install();(new SourceSchemaInstaller($db))->install();$ok('source_schema_repeated_installation',true);
    foreach($legacyTables as $table)$ok($table.'_rows_unchanged_after_install',$legacyFingerprints[$table]===hash('sha256',json_encode((new Query())->from('{{%'.$table.'}}')->orderBy('id')->all($db))));
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
    $readers=['github'=>$reader];
    foreach(['resume','web','text'] as $kind)$readers[$kind]=new class($db,$kind) implements IdentifiedProfileSourceReader {
        public int $calls=0;public bool $outsideTransactions=true;public ?string $failure=null;public ?Closure $hook=null;
        public function __construct(private yii\db\Connection $db,private string $type){}
        public function kind():string{return $this->type;}
        public function status(int $ownerId):array{return ['available'=>true,'kind'=>$this->type];}
        public function identify(int $ownerId,array $input):array{
            if(($input['ownership']??null)!=='self')throw new ProfileException('SOURCE_OWNERSHIP_REQUIRED','Declare the source.');
            $value=$input[$this->type==='web'?'url':'text']??null;if(!is_string($value))throw new ProfileException('INVALID_SOURCE','Provide source input.');
            return ['external_id'=>$this->type.':'.hash('sha256',$value),'canonical_url'=>$this->type==='web'?$value:null,'label'=>'Synthetic SQL '.$this->type,'ownership_basis'=>'self_declared'];
        }
        public function read(int $ownerId,array $input):array{
            ++$this->calls;$this->outsideTransactions=$this->outsideTransactions&&!($this->db->getTransaction()?->isActive??false);
            $identity=$this->type==='resume'?['external_id'=>'sha256:'.str_repeat('a',64),'canonical_url'=>null,'label'=>'Synthetic SQL resume']:$this->identify($ownerId,$input);unset($identity['ownership_basis']);
            if($this->hook){$h=$this->hook;$this->hook=null;$h($input);}if($this->failure)throw new ProfileException($this->failure,'Synthetic private provider diagnostic',502);
            return $identity+['raw_text'=>'Private synthetic SQL '.$this->type.' text','sections'=>[['id'=>'p1','label'=>'Project','text'=>'Synthetic imported project','locator'=>['line'=>1]]],'candidates'=>[['id'=>'project','key'=>'project','value'=>['title'=>'S5B imported project','contribution'=>'Own backend'],'evidence'=>['p1']],['id'=>'city','key'=>'city','value'=>'Imported city','evidence'=>['p1']]],'metadata'=>['generation_mode'=>'rules','llm_calls'=>0]];
        }
    };
    $allService=new ProfileSourceService($repository,$workflow,$p1->getAccessPolicy(),fn($kind)=>$readers[$kind]??null);
    $resume=$allService->import($owner,'resume',[],'s5b-sql-resume',str_repeat('a',64));$ok('resume_still_roundtrips_after_schema_upgrade',$resume['kind']==='resume'&&$resume['status']==='ready');
    $url='https://example.test/s5b-profile';$webInput=['url'=>$url,'ownership'=>'self'];
    $readers['web']->failure='WEB_FETCH_FAILED';$web=$allService->import($owner,'web',$webInput,'s5b-sql-web-failure');$ok('failed_website_saves_original_target',$web['status']==='failed'&&$web['canonical_url']===$url);
    $ok('failed_website_identity_persisted',$repository->findSource($web['id'])['canonical_url']===$url);
    $readers['web']->failure=null;$readers['web']->hook=static function(array $input)use($ok,$webInput):void{$ok('website_retry_rebuilds_original_server_input',$input===$webInput);};
    $web=$allService->refresh($owner,$web['id'],1,[],'s5b-sql-web-retry');$ok('website_retry_after_failed_first_read',$web['version']===2&&$web['status']==='ready');
    $ok('website_snapshot_json_self_declaration',$web['snapshot']['metadata']['ownership_basis']==='self_declared');
    $textInput=['text'=>"City: Synthetic city\nProject: SQL imported project",'ownership'=>'self'];$text=$allService->import($owner,'text',$textInput,'s5b-sql-text-first');
    $ok('text_snapshot_native_json',$db->createCommand('SELECT JSON_TYPE(content_json) FROM {{%matcher_profile_source_snapshot}} WHERE id=:id',[':id'=>$text['latest_snapshot_id']])->queryScalar()==='OBJECT');
    $ok('text_is_stored_without_canonical_url',$text['canonical_url']===null&&$text['status']==='ready');
    $ok('four_source_kinds_coexist',count(array_unique(array_column($allService->list($owner)['sources'],'kind')))===4);
    $ok('all_external_parsers_run_outside_transactions',array_filter($readers,fn($r)=>!$r->outsideTransactions)===[]);
    $ok('web_import_replay_has_no_io',$allService->import($owner,'web',$webInput,'s5b-sql-web-reuse')['id']===$web['id']&&$readers['web']->calls===2);
    $ok('text_import_replay_has_no_io',$allService->import($owner,'text',$textInput,'s5b-sql-text-first')['id']===$text['id']&&$readers['text']->calls===1);
    $deny('text_changed_content_requires_new_source',fn()=>$allService->refresh($owner,$text['id'],1,['text'=>'Different text','ownership'=>'self'],'s5b-sql-text-change'),409);
    $deny('website_refresh_forbids_changing_target',fn()=>$allService->refresh($owner,$web['id'],2,$webInput,'s5b-sql-web-target'),422);
    $deny('website_source_owner_isolation',fn()=>$allService->get($other,$web['id']),404);$deny('text_source_owner_isolation',fn()=>$allService->get($other,$text['id']),404);
    $importDraft=$workflow->createDraft($owner,null);$importDraft=$workflow->updateDraft($owner,null,$importDraft['id'],$importDraft['draft_version'],[['key'=>'city','value'=>'Own city','visibility'=>'private']]);
    $selected=$allService->apply($owner,$web['id'],2,$importDraft['id'],$importDraft['draft_version'],['project','city'],'s5b-sql-web-apply');$importDraft=$selected['draft'];
    $ok('web_candidate_adoption_preserves_manual_field',$selected['applied']===['project']&&$selected['skipped'][0]['reason']==='existing_value');
    $values=array_column($importDraft['preview_attributes'],null,'key');$ok('web_adoption_preserves_existing_privacy',$values['city']['visibility']==='private'&&$values['project']['visibility']==='authenticated');
    $same=$allService->apply($owner,$text['id'],1,$importDraft['id'],$importDraft['draft_version'],['project'],'s5b-sql-text-dedup');$ok('cross_kind_candidates_do_not_duplicate',$same['applied']===[]&&$same['skipped'][0]['reason']==='same_value');
    foreach([$web,$text] as $candidateSource){
        $rollbackDraft=$workflow->createDraft($owner,null);$beforeJobs=(int)(new Query())->from('{{%matcher_profile_source_job}}')->where(['owner_id'=>$owner])->count('*',$db);
        try{$faultService->apply($owner,$candidateSource['id'],$candidateSource['version'],$rollbackDraft['id'],$rollbackDraft['draft_version'],['project'],'s5b-sql-fault-'.$candidateSource['kind']);throw new LogicException('Expected receipt failure');}catch(RuntimeException $e){$ok($candidateSource['kind'].'_receipt_failure_exercised',$e->getMessage()==='Synthetic failure after draft and receipt writes');}
        $afterDraft=$workflow->getDraft($owner,null,$rollbackDraft['id']);$ok($candidateSource['kind'].'_adoption_and_receipt_roll_back_together',$afterDraft['fields']===[]&&$afterDraft['draft_version']===$rollbackDraft['draft_version']&&(int)(new Query())->from('{{%matcher_profile_source_job}}')->where(['owner_id'=>$owner])->count('*',$db)===$beforeJobs);
    }
    $readers['web']->hook=function()use($allService,$owner,$web):void{$allService->refresh($owner,$web['id'],3,[],'s5b-sql-web-newer');};$latest=$allService->refresh($owner,$web['id'],2,[],'s5b-sql-web-older');
    $ok('website_late_result_respects_newer_source_version',$latest['version']===4&&$latest['status']==='ready');
    $oldJob=(new Query())->from('{{%matcher_profile_source_job}}')->where(['source_id'=>$web['id'],'source_version'=>3])->one($db);$ok('website_late_read_marked_superseded',$oldJob['applicability']==='superseded');
    $readers['text']->hook=function()use($allService,$owner,$text):void{$allService->delete($owner,$text['id'],2);};$deletedText=$allService->refresh($owner,$text['id'],1,$textInput,'s5b-sql-text-delete-flight');
    $ok('text_late_result_cannot_restore_deleted_source',$deletedText['status']==='deleted'&&$deletedText['snapshot']===null);
    $ok('text_delete_removes_all_snapshots',(int)(new Query())->from('{{%matcher_profile_source_snapshot}}')->where(['source_id'=>$text['id']])->count('*',$db)===0);
    $ok('text_delete_revokes_jobs',(int)(new Query())->from('{{%matcher_profile_source_job}}')->where(['source_id'=>$text['id']])->andWhere(['<>','applicability','revoked'])->count('*',$db)===0);
    $ok('web_text_imports_stay_unconfirmed',$p1->getProfileService()->getProfile($owner,$owner,ProfileScope::global())['attributes']===[]);
    $ok('source_jobs_never_copy_pasted_text',!str_contains(json_encode((new Query())->from('{{%matcher_profile_source_job}}')->where(['owner_id'=>$owner])->all($db)),'Private synthetic SQL text text'));
    echo json_encode(['status'=>'passed','passed'=>count($checks),'checks'=>$checks,'external_requests'=>0,'llm_calls'=>0],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE).PHP_EOL;
}catch(Throwable $error){fwrite(STDERR,json_encode(['status'=>'failed','type'=>get_class($error),'check'=>$error instanceof RuntimeException&&!$error instanceof yii\db\Exception?$error->getMessage():'SQL integration failed without exposing diagnostics']).PHP_EOL);exit(1);}
