<?php
declare(strict_types=1);
define('YII_ENABLE_ERROR_HANDLER', false);
/** Synthetic audit CLI. Every command enters the exact-target guard before DB use. */
define('MATCHER_S76_HTTP_WEB', true);
$_SERVER['SCRIPT_NAME']='/index.php'; $_SERVER['SCRIPT_FILENAME']=dirname(__DIR__,5).'/index.php';
$_SERVER['HTTP_HOST']='127.0.0.1:8105'; $_SERVER['SERVER_PORT']=8105; $_SERVER['REQUEST_URI']='/';
try { $app=require __DIR__.'/s76_audit_bootstrap.php'; } catch(Throwable $error) { fwrite(STDERR,json_encode(['error_type'=>get_class($error),'file'=>basename($error->getFile()),'line'=>$error->getLine()],JSON_THROW_ON_ERROR).PHP_EOL);exit(1); }
require __DIR__.'/s76_audit_support.php';
set_exception_handler(static function(Throwable $error):void{fwrite(STDERR,json_encode(['error_type'=>get_class($error),'file'=>basename($error->getFile()),'line'=>$error->getLine()],JSON_THROW_ON_ERROR).PHP_EOL);exit(1);});
$action=$argv[2]??''; $arg=$argv[3]??''; $mode=$argv[4]??'success';
if(!in_array($mode,['success','delay','fail','unknown'],true))throw new RuntimeException('Unsupported synthetic mode.');
s76AuditInject($app,$mode);
$out=static function(mixed $value):void{echo json_encode($value,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),PHP_EOL;};
$owner=static function(int $id)use($app):void{ $name=(new yii\db\Query())->select('username')->from('{{%user}}')->where(['id'=>$id])->scalar($app->db); if(!is_string($name)||!str_starts_with($name,'s76_audit_'))throw new RuntimeException('S76 audit synthetic owner required.'); };
$job=static function(string $id)use($app,$owner):array{ $job=$app->getModule('matcher-user-profile')->getAiJobRepository()->find($id); if(!$job)throw new RuntimeException('S76 audit job not found.');$owner($job['owner_id']);return $job; };
if($action==='work'){$job($arg);$out($app->getModule('matcher-onboarding')->getAiJobService()->work($arg));return;}
if($action==='journal'){
    $result=[];foreach(['ai','reader']as $kind){$file=$app->runtimePath.'/s76_audit-'.$kind.'-journal.jsonl';$lines=is_file($file)?file($file,FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES):[];$rows=array_map(fn($line)=>json_decode($line,true,512,JSON_THROW_ON_ERROR),$lines);$result[$kind]=['entered'=>count(array_filter($rows,fn($r)=>$r['event']==='entered')),'completed'=>count(array_filter($rows,fn($r)=>$r['event']==='completed')),'active_transactions'=>count(array_filter($rows,fn($r)=>$r['active_transaction']))];}$out($result);return;
}
if($action==='age-running'){ $j=$job($arg);if(!in_array($j['execution_status'],['queued','running'],true))throw new RuntimeException('Only active jobs can be aged.');$out(['aged'=>$app->db->createCommand()->update('{{%matcher_profile_ai_job}}',['execution_status'=>'running','started_at'=>gmdate('Y-m-d H:i:s',time()-121)],['id'=>$arg])->execute()]);return; }
if($action==='inspect'){
    $id=(int)$arg;$owner($id);$rows=(new yii\db\Query())->from('{{%matcher_profile_ai_job}}')->where(['owner_id'=>$id])->all($app->db);$jobs=[];foreach($rows as $r)$jobs[]=['id'=>$r['id'],'status'=>$r['execution_status'],'applicability'=>$r['applicability'],'has_input'=>!in_array($r['input_json'],['[]','{}','null',null],true),'has_result'=>!in_array($r['result_json'],['[]','{}','null',null],true)];$out(['jobs'=>$jobs,'count'=>count($jobs)]);return;
}
if(in_array($action,['revoke-space','restore-space'],true)){
    $parts=explode(':',$arg);if(count($parts)!==2)throw new RuntimeException('Expected owner:space.');[$id,$space]=array_map('intval',$parts);$owner($id);
    if($action==='revoke-space')$out(['changed'=>$app->db->createCommand()->delete('{{%space_membership}}',['user_id'=>$id,'space_id'=>$space])->execute()]);
    else $out(['changed'=>$app->db->createCommand()->upsert('{{%space_membership}}',['user_id'=>$id,'space_id'=>$space,'status'=>3])->execute()]);return;
}
if($action==='source-import'){
    $id=(int)$arg;$owner($id);$profile=$app->getModule('matcher-user-profile');$reader=new S76AuditReader($app,$mode);$service=new humhub\modules\matcherProfile\application\ProfileSourceService($profile->getSourceRepository(),$profile->getProfileWorkflow(),$profile->getAccessPolicy(),fn($kind)=>$kind==='text'?$reader:null);
    $suffix=($argv[5]??'')?:bin2hex(random_bytes(5));
    $source=$service->import($id,'text',['text'=>'S76_AUDIT_PRIVATE_RAW_'.$suffix.' 杭州 Python','ownership'=>'self'],'s76_audit_'.bin2hex(random_bytes(8)));$out($source);return;
}
if($action==='find-source'){
    $id=(int)$arg;$owner($id);$row=(new yii\db\Query())->select(['id','status','version'])->from('{{%matcher_profile_source}}')->where(['owner_id'=>$id])->orderBy(['created_at'=>SORT_DESC,'id'=>SORT_DESC])->one($app->db);$out($row?:null);return;
}
if($action==='legacy-completed'){
    $repo=$app->getModule('matcher-onboarding')->getOnboardingRepository();
    $repo->transaction(function()use($repo,$arg,$owner):void{$s=$repo->findSession($arg,true);if(!$s)throw new RuntimeException('Synthetic completed session required.');$owner($s['owner_id']);if($s['status']!=='completed'||!isset($s['resource_refs']['ai_metrics']['questions']))throw new RuntimeException('Synthetic AI completed session required.');unset($s['resource_refs']['completed_questions'],$s['resource_refs']['completed_batch_version']);$repo->saveSession($s);});
    $out(['legacy_completed'=>true]);return;
}
if($action==='fingerprint'){
    $result=[];foreach(['matcher_profile_state','matcher_profile_attribute','matcher_profile_draft','matcher_profile_revision','matcher_profile_question_batch','matcher_profile_question_answer','matcher_onboarding_session','matcher_profile_source','matcher_profile_source_snapshot','matcher_profile_source_job','matcher_profile_ai_job','migration']as $table){if($app->db->schema->getTableSchema('{{%'.$table.'}}',true)===null)continue;$rows=(new yii\db\Query())->from('{{%'.$table.'}}')->all($app->db);$encoded=array_map(fn($row)=>json_encode($row,JSON_THROW_ON_ERROR),$rows);sort($encoded,SORT_STRING);$result[$table]=['count'=>count($rows),'sha256'=>hash('sha256',implode('\n',$encoded))];}$out($result);return;
}
if($action==='legacy'){
    // Prefix search is parameterized and outputs only counts and hashes.
    $ids=(new yii\db\Query())->select('id')->from('{{%user}}')->where(['like','username','s7_sim_%',false])->column($app->db);
    $result=['people'=>count($ids)];foreach(['user'=>'id','profile'=>'user_id','space_membership'=>'user_id','matcher_profile_state'=>'user_id']as $table=>$key){$rows=(new yii\db\Query())->from('{{%'.$table.'}}')->where([$key=>$ids])->all($app->db);$encoded=array_map(fn($r)=>json_encode($r,JSON_THROW_ON_ERROR),$rows);sort($encoded,SORT_STRING);$result[$table]=['count'=>count($rows),'sha256'=>hash('sha256',implode('\n',$encoded))];}$out($result);return;
}
if($action==='module'){
    [$id,$operation]=array_pad(explode(':',$arg,2),2,'');if(!in_array($id,['matcher-onboarding','matcher-onboarding-ai'],true)||!in_array($operation,['disable','enable'],true))throw new RuntimeException('S76 audit module action denied.');
    $module=$app->moduleManager->getModule($id);ob_start();try{if($operation==='disable')$module->getModuleService()->disable();else $module->enable();}finally{ob_end_clean();}
    $out(['module'=>$id,'enabled'=>(new yii\db\Query())->from('{{%module_enabled}}')->where(['module_id'=>$id])->exists($app->db)]);return;
}
throw new RuntimeException('Unsupported S76 audit action.');
