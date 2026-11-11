<?php
declare(strict_types=1);
/** Independent actual-MySQL audit, exact clone and exact synthetic namespace only. */
$target = getenv('MATCHER_S73_TEST_DB') ?: ($argv[1] ?? '');
if ($target !== 'humhub_profile_s73_test_audit_b7a2c940') { throw new RuntimeException('The exact independent S73 audit clone is required.'); }
$app = require dirname(__DIR__, 2) . '/matcher-onboarding/tests/integration/s73_http_bootstrap.php';
use yii\db\{Query, Expression};
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\user\models\User;
$names = array_map(static fn(int $n): string => sprintf('s73_sim_%03d', $n), range(1, 400));
$users = [];
foreach ((new Query())->select(['id','username','contentcontainer_id'])->from('{{%user}}')->where(['username'=>$names])->all($app->db) as $row) {
    if (!preg_match('/^s73_sim_(\d{3})$/D', $row['username'], $match)) { throw new RuntimeException('Unexpected synthetic namespace.'); }
    $users[(int)$match[1]] = ['id'=>(int)$row['id'], 'container'=>(int)$row['contentcontainer_id']];
}
ksort($users); if (array_keys($users)!==range(1,400)) { throw new RuntimeException('Exactly 400 actual synthetic users must be installed.'); }
$dataset=json_decode(file_get_contents(dirname(__DIR__,5).'/docs/用户画像收集/examples/s73-people_2026-11-12.json'),true,512,JSON_THROW_ON_ERROR);
$spaces=[];
foreach ($dataset['spaces'] as $key=>$info) {
    $matches=(new Query())->select(['id','contentcontainer_id'])->from('{{%space}}')->where(['name'=>$info['name']])->all($app->db);
    if (count($matches)!==1) { throw new RuntimeException('Synthetic Space is not unique.'); }
    $spaces[$key]=['id'=>(int)$matches[0]['id'],'container'=>(int)$matches[0]['contentcontainer_id']];
}
$action=$argv[2]??'metadata'; $value=$argv[3]??'';
$viewer=$users[321]['id']; $peer=$users[322]['id']; $candidate=$users[323]['id']; $rare=$users[400]['id'];
$allIds=array_column($users,'id');
$states=(new Query())->select(['id','user_id','scope_key','revision','permission_version','identity_version'])->from('{{%matcher_profile_state}}')->where(['user_id'=>$allIds])->all($app->db);
$stateIds=array_column($states,'id'); $byState=array_column($states,null,'id');
function emit(array $result): never { echo json_encode($result,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR).PHP_EOL; exit; }
if ($action==='side_effects') {
    $counts=[]; foreach (['message','user_message','message_entry','notification','queue','matcher_profile_ai_job'] as $table) {
        if ($app->db->schema->getTableSchema($table,true)!==null) { $counts[$table]=(int)(new Query())->from($table)->count('*',$app->db); }
    }
    $counts['synthetic_ai_jobs']=(int)(new Query())->from('{{%matcher_profile_ai_job}}')->where(['owner_id'=>$allIds])->count('*',$app->db);
    emit($counts);
}
if ($action==='metadata') {
    $counts=[]; foreach($spaces as $key=>$space) {
        $counts[$key]=['members'=>(int)(new Query())->from('{{%space_membership}}')->where(['space_id'=>$space['id'],'user_id'=>$allIds,'status'=>3])->count('*',$app->db), 'optin'=>(int)(new Query())->from('{{%matcher_recommendation_discovery_settings}}')->where(['space_id'=>$space['id'],'owner_id'=>$allIds,'discoverable'=>1])->count('*',$app->db)];
    }
    $keys=['nickname','direction','interest','event_goal','headline','bio','seeking','role','skill','project','event_role','event_contribution','event_seeking','mbti','personality','collaboration_preference','communication_preference','event_contact_preference','event_collaboration_mode','event_availability'];
    $rows=(new Query())->select(['state_id','last_confirmed_at'])->from('{{%matcher_profile_attribute}}')->where(['state_id'=>$stateIds,'field_key'=>$keys,'visibility'=>'authenticated','confirmation'=>'confirmed'])->all($app->db);
    $identity=(new Query())->select(['state_id','last_confirmed_at'=>'created_at'])->from('{{%matcher_profile_draft}}')->where(['state_id'=>$stateIds,'draft_kind'=>'identity','origin'=>'identity_change','status'=>'confirmed'])->all($app->db);
    $dates=[]; foreach(array_merge($rows,$identity) as $row) {
        $s=$byState[$row['state_id']]; if(!$row['last_confirmed_at']) continue;
        $old=$dates[$s['user_id']][$s['scope_key']]??'';
        $normalized=(new DateTimeImmutable($row['last_confirmed_at'],new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.u\Z');
        $dates[$s['user_id']][$s['scope_key']]=max($old,$normalized);
    }
    $latest=[]; foreach($spaces as $key=>$space) { foreach($users as $u) {
        $last=max($dates[$u['id']]['global']??'', $dates[$u['id']]['space:'.$space['id']]??'');
        $latest[$key][$u['id']]=(new DateTimeImmutable($last,new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z');
    }}
    $attributeCount=(int)(new Query())->from('{{%matcher_profile_attribute}}')->where(['state_id'=>$stateIds,'confirmation'=>'confirmed'])->count('*',$app->db);
    $draftCount=(int)(new Query())->from('{{%matcher_profile_draft}}')->where(['state_id'=>$stateIds,'status'=>'editing'])->count('*',$app->db);
    $versions=[]; foreach($states as $s) { $versions[$s['user_id'].':'.$s['scope_key']]=array_map('intval',array_intersect_key($s,array_flip(['revision','permission_version','identity_version']))); }
    emit(['database'=>$target,'users'=>array_map(static fn(array $u):int=>$u['id'],$users),'spaces'=>array_map(static fn(array $s):int=>$s['id'],$spaces),'counts'=>$counts,'profile_counts'=>['states'=>count($states),'confirmed_attributes'=>$attributeCount,'editing_drafts'=>$draftCount],'latest_confirmations'=>$latest,'versions'=>$versions,
        'fixture_baseline'=>[
            'enabled_accounts'=>(int)(new Query())->from('{{%user}}')->where(['id'=>$allIds,'status'=>User::STATUS_ENABLED])->count('*',$app->db),
            'audit_friendships'=>(int)(new Query())->from('{{%user_friendship}}')->where(['or',['user_id'=>$viewer,'friend_user_id'=>[$peer,$users[8]['id']]],['user_id'=>[$peer,$users[8]['id']],'friend_user_id'=>$viewer]])->count('*',$app->db),
            'audit_blocks'=>(int)(new Query())->from('{{%contentcontainer_blocked_users}}')->where(['or',['contentcontainer_id'=>$users[321]['container'],'user_id'=>$candidate],['contentcontainer_id'=>$users[323]['container'],'user_id'=>$viewer],['contentcontainer_id'=>$spaces['primary']['container'],'user_id'=>$candidate]])->count('*',$app->db),
        ]]);
}
if ($action==='relationship' || $action==='hidden_friend') {
    if ($action==='hidden_friend') {
        $match=[]; foreach($dataset['people'] as $p) { foreach($p['global']['attributes'] as $a) { if($a['key']==='skill' && $a['visibility']==='friends' && str_contains($a['value']['code']??'','friends-sentinel')) $match[]=$p['number']; }}
        if (!$match) throw new RuntimeException('Friends sentinel fixture missing.'); $peer=$users[min($match)]['id'];
    }
    if(!in_array($value,['none','pending_out','pending_in','friend'],true)) throw new RuntimeException('Unsupported relationship.');
    $app->db->createCommand()->delete('{{%user_friendship}}',['or',['user_id'=>$viewer,'friend_user_id'=>$peer],['user_id'=>$peer,'friend_user_id'=>$viewer]])->execute();
    $links=match($value){'friend'=>[[$viewer,$peer],[$peer,$viewer]],'pending_out'=>[[$viewer,$peer]],'pending_in'=>[[$peer,$viewer]],default=>[]};
    foreach($links as [$from,$to]) $app->db->createCommand()->insert('{{%user_friendship}}',['user_id'=>$from,'friend_user_id'=>$to,'created_at'=>'2026-11-12 00:00:00'])->execute();
    emit(['status'=>'ok','peer_id'=>$peer]);
}
if ($action==='block') {
    if(!in_array($value,['none','outgoing','incoming','space'],true)) throw new RuntimeException('Unsupported block.');
    $pairs=['outgoing'=>[$users[321]['container'],$candidate],'incoming'=>[$users[323]['container'],$viewer],'space'=>[$spaces['primary']['container'],$candidate]];
    foreach($pairs as [$container,$id]) $app->db->createCommand()->delete('{{%contentcontainer_blocked_users}}',['contentcontainer_id'=>$container,'user_id'=>$id])->execute();
    if($value!=='none') {[$container,$id]=$pairs[$value];$app->db->createCommand()->insert('{{%contentcontainer_blocked_users}}',['contentcontainer_id'=>$container,'user_id'=>$id])->execute();}
    emit(['status'=>'ok']);
}
if ($action==='membership') {
    if(!in_array($value,['candidate_remove','candidate_restore','viewer_remove','viewer_restore'],true)) throw new RuntimeException('Unsupported membership.');
    $who=str_starts_with($value,'candidate')?$candidate:$viewer;
    $app->db->createCommand()->update('{{%space_membership}}',['status'=>str_ends_with($value,'restore')?3:2],['user_id'=>$who,'space_id'=>$spaces['primary']['id']])->execute();
    emit(['status'=>'ok']);
}
if ($action==='account') {
    if(!in_array($value,['disable','restore'],true)) throw new RuntimeException('Unsupported account transition.');
    $app->db->createCommand()->update('{{%user}}',['status'=>$value==='restore'?User::STATUS_ENABLED:User::STATUS_DISABLED],['id'=>$candidate])->execute();
    emit(['status'=>'ok']);
}
if ($action==='rare_visibility') {
    if(!in_array($value,['authenticated','friends','private'],true)) throw new RuntimeException('Unsupported visibility.');
    $all=[]; foreach($dataset['people'] as $p) foreach($p['global']['attributes'] as $a) if($a['key']==='skill' && $a['visibility']==='authenticated') {$c=$a['value']['code'];$all[$c]=($all[$c]??0)+1;}
    $rareCodes=[]; foreach($dataset['people'][399]['global']['attributes'] as $a) if($a['key']==='skill' && $a['visibility']==='authenticated' && $all[$a['value']['code']]===1) $rareCodes[]=$a['value']['code'];
    if(!$rareCodes) throw new RuntimeException('Unique rare skill missing.'); $code=end($rareCodes);
    $scope=ProfileScope::global(); $service=$app->getModule('matcher-user-profile')->getProfileService(); $profile=$service->getProfile($rare,$rare,$scope);
    $found=array_values(array_filter($profile['attributes'],static fn(array $a):bool=>$a['key']==='skill'&&($a['value']['code']??'')===$code));
    if(count($found)!==1) throw new RuntimeException('Expected one rare attribute.');
    $service->setVisibilities($rare,$rare,$scope,$profile['revision'],[['attribute_id'=>$found[0]['attribute_id'],'visibility'=>$value]]);
    emit(['status'=>'ok']);
}
if ($action==='nickname') {
    if(!in_array($value,['private','friends','draft','restore'],true)) throw new RuntimeException('Unsupported nickname transition.');
    $state=(new Query())->select('id')->from('{{%matcher_profile_state}}')->where(['user_id'=>$peer,'scope_key'=>'global'])->scalar($app->db);
    $app->db->createCommand()->update('{{%matcher_profile_attribute}}',['visibility'=>in_array($value,['private','friends'],true)?$value:'authenticated','confirmation'=>$value==='draft'?'draft':'confirmed'],['state_id'=>$state,'field_key'=>'nickname'])->execute();
    // Fault injection changes semantic values, never restores old versions.
    $app->db->createCommand()->update('{{%matcher_profile_state}}',['revision'=>new Expression('revision + 1'),'permission_version'=>new Expression('permission_version + 1'),'identity_version'=>new Expression('identity_version + 1')],['id'=>$state])->execute();
    emit(['status'=>'ok']);
}
throw new RuntimeException('Unknown independent S73 action.');
