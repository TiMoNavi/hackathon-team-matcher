<?php
declare(strict_types=1);
/** Post-HTTP assertions against the isolated audit clone; no application data is emitted. */
$app=require dirname(__DIR__,3).'/matcher-onboarding/tests/integration/s5b_http_bootstrap.php';
$fixturePath=$argv[2]??'';
if(!str_contains($fixturePath,'/.runtime/') || !str_contains($fixturePath,'s5b'))throw new RuntimeException('Use the S5-B synthetic fixture.');
$fixture=json_decode(file_get_contents($fixturePath),true,512,JSON_THROW_ON_ERROR);
$owner=(int)$fixture['users']['viewer'];
$username=(new yii\db\Query())->select('username')->from('{{%user}}')->where(['id'=>$owner])->scalar($app->db);
if(!is_string($username)||!str_starts_with($username,'s5b_'))throw new RuntimeException('Only isolated synthetic owners are allowed.');
$checks=[];
function verify(string $name,bool $ok):void {global $checks;$checks[]=['name'=>$name,'passed'=>$ok];}
$sources=(new yii\db\Query())->from('{{%matcher_profile_source}}')->where(['owner_id'=>$owner])->all($app->db);
verify('invalid_web_inputs_created_no_source',count($sources)===1 && $sources[0]['kind']==='text');
$source=$sources[0];
verify('deleted_source_persisted_scrubbed',$source['status']==='deleted' && $source['external_id']===null && $source['canonical_url']===null && $source['latest_snapshot_id']===null);
$snapshots=(int)(new yii\db\Query())->from('{{%matcher_profile_source_snapshot}}')->where(['source_id'=>$source['id']])->count('*',$app->db);
verify('all_original_and_refreshed_snapshots_physically_removed',$snapshots===0);
$jobs=(new yii\db\Query())->from('{{%matcher_profile_source_job}}')->where(['owner_id'=>$owner])->all($app->db);
verify('job_receipts_contain_no_original_text',!str_contains(json_encode($jobs),'AUDIT-S5B-PRIVATE-SOURCE-ONLY'));
verify('jobs_revoked_after_source_deletion',$jobs!==[] && array_unique(array_column($jobs,'applicability'))===['revoked']);
verify('job_receipts_only_hold_references',array_reduce($jobs,fn($ok,$j)=>$ok&&array_diff(array_keys(json_decode($j['result_json'],true)),['reused_source_id','snapshot_id','source_id','source_version','draft_id','applied','skipped','generation_mode','llm_calls'])===[],true));
$profile=$app->getModule('matcher-user-profile')->getProfileService()->getProfile($owner,$owner,humhub\modules\matcherProfile\domain\ProfileScope::global());
verify('confirmed_adopted_project_survives_source_delete',in_array('project',array_column($profile['attributes'],'key'),true));
verify('ordinary_profile_contains_no_original_text',!str_contains(json_encode($profile),'AUDIT-S5B-PRIVATE-SOURCE-ONLY'));
$failed=array_values(array_filter($checks,fn($c)=>!$c['passed']));
echo json_encode(['status'=>$failed===[]?'passed':'failed','passed'=>count($checks)-count($failed),'failed'=>count($failed),'checks'=>$checks,'scope'=>'direct SQL readback after independent HTTP flow; synthetic isolated owner only','source_text_in_report'=>false],JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),PHP_EOL;
exit($failed===[]?0:1);
