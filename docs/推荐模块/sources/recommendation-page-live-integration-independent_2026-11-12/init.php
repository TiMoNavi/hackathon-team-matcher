<?php
declare(strict_types=1);require __DIR__.'/bootstrap.php';
new yii\console\Application(['id'=>'independent-fixture-init','basePath'=>__DIR__,'components'=>['db'=>['class'=>yii\db\Connection::class,'dsn'=>'sqlite:'.__DIR__.'/review.sqlite'],'log'=>['class'=>yii\log\Dispatcher::class,'targets'=>[]]]]);
$db=Yii::$app->db;
foreach([
'CREATE TABLE user (id INTEGER PRIMARY KEY,status INTEGER,visibility INTEGER,contentcontainer_id INTEGER,updated_at TEXT)',
'CREATE TABLE space (id INTEGER PRIMARY KEY,status INTEGER,visibility INTEGER,contentcontainer_id INTEGER,join_policy INTEGER,updated_at TEXT)',
'CREATE TABLE space_membership (id INTEGER PRIMARY KEY,user_id INTEGER,space_id INTEGER,status INTEGER,group_id TEXT,created_at TEXT,updated_at TEXT)',
'CREATE TABLE contentcontainer_blocked_users (id INTEGER PRIMARY KEY,contentcontainer_id INTEGER,user_id INTEGER)',
'CREATE TABLE review_current (actor_id INTEGER PRIMARY KEY,space_id INTEGER,revision TEXT)',
'CREATE TABLE review_flags (name TEXT PRIMARY KEY,value TEXT)',
'CREATE TABLE matcher_auth_import (owner_id INTEGER PRIMARY KEY,provider_subject TEXT,state TEXT,source_id TEXT)',
'CREATE TABLE user_auth (id INTEGER PRIMARY KEY,user_id INTEGER,source TEXT,source_id TEXT)',
'CREATE TABLE matcher_profile_state (id INTEGER PRIMARY KEY,user_id INTEGER,scope_key TEXT,space_id INTEGER,revision INTEGER,permission_version INTEGER,identity_version INTEGER,current_revision_id TEXT)',
'CREATE TABLE matcher_profile_attribute (id INTEGER PRIMARY KEY,state_id INTEGER,scope_key TEXT,attribute_id TEXT,field_key TEXT,storage_kind TEXT,native_binding TEXT,value_json TEXT,visibility TEXT,confirmation TEXT,last_confirmed_at TEXT,display_label TEXT,sort_order INTEGER,schema_version INTEGER)',
'CREATE TABLE matcher_profile_source (id TEXT PRIMARY KEY,owner_id INTEGER,kind TEXT,version INTEGER,status TEXT,last_job_id TEXT,latest_snapshot_id TEXT,created_at TEXT,updated_at TEXT)',
] as $sql)$db->createCommand($sql)->execute();
use humhub\modules\user\models\User;use humhub\modules\space\models\{Space,Membership};
foreach([1,2,3] as $id){$db->createCommand()->insert('user',['id'=>$id,'status'=>User::STATUS_ENABLED,'visibility'=>User::VISIBILITY_ALL,'contentcontainer_id'=>100+$id,'updated_at'=>'2026-11-12 00:00:00'])->execute();$db->createCommand()->insert('review_current',['actor_id'=>$id,'space_id'=>7,'revision'=>'fixture-selection-A'])->execute();}
foreach([7,8] as $id)$db->createCommand()->insert('space',['id'=>$id,'status'=>Space::STATUS_ENABLED,'visibility'=>1,'contentcontainer_id'=>200+$id,'join_policy'=>1,'updated_at'=>'2026-11-12 00:00:00'])->execute();
foreach([[1,7],[2,7],[3,8],[1,8]] as $i=>[$id,$space])$db->createCommand()->insert('space_membership',['id'=>$i+1,'user_id'=>$id,'space_id'=>$space,'status'=>Membership::STATUS_MEMBER,'group_id'=>'member','created_at'=>'2026-11-12 00:00:00','updated_at'=>'2026-11-12 00:00:00'])->execute();
foreach([1,2,3] as $id)foreach(['global','space:7','space:8'] as $i=>$scope)$db->createCommand()->insert('matcher_profile_state',['id'=>$id*10+$i,'user_id'=>$id,'scope_key'=>$scope,'space_id'=>$i===0?null:($i===1?7:8),'revision'=>1,'permission_version'=>1,'identity_version'=>$i===0?1:0,'current_revision_id'=>null])->execute();
function attr(int $owner,string $id,string $key,array $value,string $scope='global',string $visibility='authenticated',string $confirmation='confirmed'):void{
 Yii::$app->db->createCommand()->insert('matcher_profile_attribute',['state_id'=>$owner*10+($scope==='global'?0:1),'scope_key'=>$scope,'attribute_id'=>$id,'field_key'=>$key,'storage_kind'=>'inline','native_binding'=>null,'value_json'=>json_encode($value),'visibility'=>$visibility,'confirmation'=>$confirmation,'last_confirmed_at'=>'2026-11-12 00:00:00','display_label'=>null,'sort_order'=>0,'schema_version'=>2])->execute();
}
attr(1,'own-needed','event_seeking',['skill_codes'=>['php'],'role_codes'=>['engineering']],'space:7');
attr(1,'own-direction','direction',['code'=>'robotics','label'=>'机器人']);
attr(1,'own-private','skill',['code'=>'private-canary','label'=>'私有虚构技能'],'global','private');
attr(1,'own-draft','skill',['code'=>'draft-canary','label'=>'未确认虚构技能'],'global','authenticated','unconfirmed');
attr(2,'candidate-skill','skill',['code'=>'php','label'=>'PHP']);attr(2,'candidate-direction','direction',['code'=>'robotics','label'=>'机器人']);
attr(2,'candidate-offer','event_contribution',['skill_codes'=>['php']],'space:7');attr(2,'candidate-role','event_role',['code'=>'engineering','label'=>'工程'],'space:7');
$id='11111111-1111-1111-1111-111111111111';
$db->createCommand()->insert('matcher_auth_import',['owner_id'=>1,'provider_subject'=>'101','state'=>'succeeded','source_id'=>$id])->execute();
$db->createCommand()->insert('user_auth',['user_id'=>1,'source'=>'github','source_id'=>'101'])->execute();
$db->createCommand()->insert('matcher_profile_source',['id'=>$id,'owner_id'=>1,'kind'=>'github','version'=>1,'status'=>'ready','last_job_id'=>null,'latest_snapshot_id'=>'synthetic-snapshot','created_at'=>'2026-11-12 00:00:00','updated_at'=>'2026-11-12 00:00:00'])->execute();
humhub\modules\matcherRecommendation\adapters\analysis\SelfAnalysisSelectionSchema::install($db);
humhub\modules\matcherRecommendation\adapters\native\CurrentEventSelectionSchema::install($db);
echo json_encode(['created'=>true,'database'=>'isolated temporary SQLite','user_enabled'=>User::STATUS_ENABLED,'user_disabled'=>User::STATUS_DISABLED,'member'=>Membership::STATUS_MEMBER]),PHP_EOL;
