<?php
declare(strict_types=1);
/** Test-only worker and compact SQL readback, restricted to the dedicated audit clone. */
$app=require __DIR__.'/s6_http_bootstrap.php';require __DIR__.'/s6_audit_support.php';
$action=$argv[2]??'';$mode=$argv[4]??'success';if(!in_array($mode,['success','delay','fail','unknown'],true))throw new RuntimeException('Unsupported synthetic mode.');s6IndependentInject($app,$mode);
if($action==='work'){$result=$app->getModule('matcher-onboarding')->getAiJobService()->work($argv[3]??'');echo json_encode($result,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),PHP_EOL;return;}
if(in_array($action,['watch','run'],true)){$controller=new humhub\modules\matcherOnboarding\commands\AiWorkerController('ai-worker',$app->getModule('matcher-onboarding'));$controller->interval=1;exit($action==='watch'?$controller->actionWatch():$controller->actionRun());}
if($action==='age-running'){
    $id=$argv[3]??'';$job=(new yii\db\Query())->from('{{%matcher_profile_ai_job}}')->where(['id'=>$id])->one($app->db);
    $username=$job?(new yii\db\Query())->select('username')->from('{{%user}}')->where(['id'=>$job['owner_id']])->scalar($app->db):null;
    if(!is_string($username)||!str_starts_with($username,'s6_')||!in_array($job['execution_status'],['queued','running'],true))throw new RuntimeException('Only queued/running synthetic jobs can be aged.');
    $changed=$app->db->createCommand()->update('{{%matcher_profile_ai_job}}',['execution_status'=>'running','started_at'=>gmdate('Y-m-d H:i:s',time()-121)],['id'=>$id])->execute();echo json_encode(['aged'=>$changed]),PHP_EOL;return;
}
if($action==='journal'){$file=$app->runtimePath.'/independent-ai-journal.jsonl';$lines=is_file($file)?file($file,FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES):[];$rows=array_map(fn($line)=>json_decode($line,true,512,JSON_THROW_ON_ERROR),$lines);echo json_encode(['entered'=>count(array_filter($rows,fn($r)=>$r['event']==='entered')),'completed'=>count(array_filter($rows,fn($r)=>$r['event']==='completed')),'active_transactions'=>count(array_filter($rows,fn($r)=>$r['active_transaction']))],JSON_THROW_ON_ERROR),PHP_EOL;return;}
if($action==='inspect'){
    $owner=(int)($argv[3]??0);$user=(new yii\db\Query())->select('username')->from('{{%user}}')->where(['id'=>$owner])->scalar($app->db);
    if(!is_string($user)||!str_starts_with($user,'s6_'))throw new RuntimeException('Synthetic owner required.');
    $jobs=(new yii\db\Query())->from('{{%matcher_profile_ai_job}}')->where(['owner_id'=>$owner])->all($app->db);
    $out=[];foreach($jobs as $job)$out[]=['id'=>$job['id'],'execution_status'=>$job['execution_status'],'applicability'=>$job['applicability'],'operation'=>$job['operation'],'has_input'=>!in_array($job['input_json'],['[]','{}','null',null],true),'has_result'=>!in_array($job['result_json'],['[]','{}','null',null],true),'has_receipts'=>!in_array($job['receipts_json'],['[]','{}','null',null],true)];
    echo json_encode(['jobs'=>$out,'count'=>count($out)],JSON_THROW_ON_ERROR),PHP_EOL;return;
}
if($action==='revoke-space'){
    $parts=explode(':',$argv[3]??'');if(count($parts)!==2)throw new RuntimeException('Expected synthetic owner:space.');[$owner,$space]=array_map('intval',$parts);
    $user=(new yii\db\Query())->select('username')->from('{{%user}}')->where(['id'=>$owner])->scalar($app->db);if(!is_string($user)||!str_starts_with($user,'s6_'))throw new RuntimeException('Synthetic owner required.');
    $changed=$app->db->createCommand()->delete('{{%space_membership}}',['user_id'=>$owner,'space_id'=>$space])->execute();echo json_encode(['removed'=>$changed]),PHP_EOL;return;
}
throw new RuntimeException('Unsupported audit action.');
