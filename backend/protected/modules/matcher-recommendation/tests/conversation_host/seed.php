<?php
declare(strict_types=1);
$app = require __DIR__ . '/bootstrap.php';
humhub\modules\installer\libs\InitialData::bootstrap();
$app->installationState->setInstalled();
$app->settings->set('baseUrl', 'http://127.0.0.1:8112');
$app->settings->set('mailerTransportType', 'file');
foreach (['matcher-user-profile','matcher-profile-privacy','matcher-recommendation','matcher-recommendation-ai'] as $id) {
    $module = $app->moduleManager->getModule($id, false);
    $module->enable();
}
$users = [];
for ($i=1; $i<=28; $i++) {
    $existing=humhub\modules\user\models\User::findOne(['username'=>sprintf('synthetic_audit_%02d',$i)]);
    if($existing!==null) { $users[$i]=(int)$existing->id; continue; }
    $user = new humhub\modules\user\models\User(['username'=>sprintf('synthetic_audit_%02d',$i),'email'=>sprintf('synthetic_audit_%02d@example.invalid',$i),'status'=>1,'visibility'=>1,'language'=>'en-US']);
    if (!$user->save(false)) { throw new RuntimeException('Synthetic user save failed'); }
    $user->profile->firstname='Synthetic'; $user->profile->lastname='Audit ' . $i; $user->profile->save(false);
    $password = new humhub\modules\user\models\Password(['user_id'=>$user->id]); $password->setPassword($auditConfig['login_password']); $password->save(false);
    $users[$i] = (int)$user->id;
}
$spaces=[];
foreach (['A','B'] as $name) {
    $existing=humhub\modules\space\models\Space::findOne(['name'=>'Synthetic Audit '.$name]);
    if($existing!==null) { $spaces[$name]=(int)$existing->id; continue; }
    $space = new humhub\modules\space\models\Space(['name'=>'Synthetic Audit ' . $name,'description'=>'Entirely fictional isolated acceptance data','visibility'=>1,'join_policy'=>2,'status'=>1,'created_by'=>$users[1]]);
    if (!$space->save(false)) { throw new RuntimeException('Synthetic Space save failed'); }
    $spaces[$name]=(int)$space->id;
}
foreach ($users as $i=>$id) {
    foreach (($i===1 ? ['A','B'] : ($i===28 ? ['B'] : ['A'])) as $space) {
        if(humhub\modules\space\models\Membership::findOne(['space_id'=>$spaces[$space],'user_id'=>$id])) { continue; }
        $membership = new humhub\modules\space\models\Membership(['space_id'=>$spaces[$space],'user_id'=>$id,'status'=>3,'group_id'=>'member']);
        $membership->save(false);
    }
}
$p1=$app->getModule('matcher-user-profile'); $service=$p1->getProfileService();
function auditProfile(int $id, ?int $space, array $ops, bool $confirm=true): array {
    global $service;
    $scope=$space===null ? humhub\modules\matcherProfile\domain\ProfileScope::global() : humhub\modules\matcherProfile\domain\ProfileScope::event($space);
    if($service->getProfile($id,$id,$scope)['attributes']!==[]) { return []; }
    $d=$service->startDraft($id,$id,$scope,'manual',false);
    $d=$service->updateDraft($id,$id,$scope,$d['id'],$d['draft_version'],$ops);
    return $confirm ? $service->confirmDraft($id,$id,$scope,$d['id'],$d['draft_version'],$d['base_revision']) : $d;
}
foreach ($users as $i=>$id) {
    $identity=$p1->getIdentityService()->getIdentity($id);
    if($identity['identity_version']===0) { $p1->getIdentityService()->update($id,0,['nickname'=>sprintf('虚构审计人物%02d',$i)]); }
    $visibility = $i===24 ? 'private' : ($i===25 ? 'friends' : 'authenticated');
    auditProfile($id,null,[['op'=>'upsert','key'=>'interest','value'=>['code'=>'social','label'=>'Synthetic social project'],'visibility'=>$visibility],['op'=>'upsert','key'=>'skill','value'=>['code'=>'python','label'=>'Python'],'visibility'=>$visibility]],$i!==26);
    auditProfile($id,$i===28 ? $spaces['B'] : $spaces['A'],[['op'=>'upsert','key'=>'event_role','value'=>['code'=>'backend','label'=>'Synthetic backend role'],'visibility'=>$visibility]]);
}
// Native relationship facts, deliberately separate from synthetic historical capability.
$app->db->createCommand()->insert('user_friendship',['user_id'=>$users[1],'friend_user_id'=>$users[22],'created_at'=>date('Y-m-d H:i:s')])->execute();
$app->db->createCommand()->insert('user_friendship',['user_id'=>$users[22],'friend_user_id'=>$users[1],'created_at'=>date('Y-m-d H:i:s')])->execute();
$container=humhub\modules\user\models\User::findOne($users[27])->contentcontainer_id;
$app->db->createCommand()->insert('contentcontainer_blocked_users',['contentcontainer_id'=>$container,'user_id'=>$users[1]])->execute();
file_put_contents($auditRuntime.'/fixture.json',json_encode(['users'=>$users,'spaces'=>$spaces],JSON_THROW_ON_ERROR));
echo json_encode(['users'=>count($users),'spaces'=>count($spaces),'p1_writes'=>'public draft/update/confirm','native_relationship_cases'=>['friend','blocked'],'profiles'=>'fictional']),PHP_EOL;
