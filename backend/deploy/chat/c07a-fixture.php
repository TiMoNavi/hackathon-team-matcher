<?php
declare(strict_types=1);
/** Fixed C07A provenance. Never accepts IDs/SQL or resets older fixture state. */
if (PHP_SAPI !== 'cli' || count($argv) !== 2 || !in_array($argv[1], ['baseline', 'prepare', 'snapshot', 'unfriend', 'refriend', 'block', 'unblock'], true)) { exit(2); }
ob_start(); $stage = 'bootstrap';
try {
    $action = $argv[1]; $app = require __DIR__ . '/bootstrap.php'; $db = $app->db;
    $chat = $app->moduleManager->getModule('matcher-chat', false);
    if ($chatConfig['modules'] !== ['mail', 'matcher-chat-ui', 'matcher-chat'] || !$chat || !$chat->isEnabled) { throw new RuntimeException('Fixed modules absent.'); }
    $q = static fn(string $t): yii\db\Query => (new yii\db\Query())->from($t);
    $count = static fn(string $t): int => (int)$q($t)->count('*', $db);
    $prior = [];
    foreach (['_chat_c04_fixture'=>'chat-c04-synthetic-v1', '_chat_c05_fixture'=>'chat-c05-text-v1', '_chat_c05b_fixture'=>'chat-c05b-attachment-v1'] as $table=>$spec) {
        $row = $q($table)->where(['id'=>1])->one($db);
        if (!$row || $row['spec'] !== $spec || !hash_equals($chatConfig['nonce'], $row['nonce'])) { throw new RuntimeException('Prior ownership absent.'); }
        $prior[$table] = json_decode($row['payload_json'], true, 16, JSON_THROW_ON_ERROR);
    }
    $oldActors = array_merge(array_values($prior['_chat_c04_fixture']['actors']), array_values($prior['_chat_c05_fixture']['actors']), array_values($prior['_chat_c05b_fixture']['actors']));
    $oldGroups = array_merge(array_values($prior['_chat_c04_fixture']['conversations']), [$prior['_chat_c05_fixture']['conversation_id'], $prior['_chat_c05b_fixture']['conversation_id']]);
    $last = $prior['_chat_c05b_fixture'];
    if (count(array_unique($oldActors)) !== 8 || count(array_unique($oldGroups)) !== 5 || !isset($last['revocation_probe'])
        || $q('user_message')->where(['message_id'=>$last['conversation_id'], 'user_id'=>$last['actors']['b']])->exists($db)
        || $q('matcher_chat_conversation')->where(['message_id'=>$last['conversation_id']])->scalar($db) === false) { throw new RuntimeException('Previous terminal scope missing.'); }
    if ($q('matcher_chat_conversation')->select('status')->where(['message_id'=>$last['conversation_id']])->scalar($db) !== 'revoked') { throw new RuntimeException('Old revocation cannot be restored.'); }
    $legacy = [];
    foreach (['user'=>['id'=>$oldActors], 'profile'=>['user_id'=>$oldActors], 'message'=>['id'=>$oldGroups],
        'user_message'=>['message_id'=>$oldGroups], 'message_entry'=>['message_id'=>$oldGroups],
        'matcher_chat_conversation'=>['message_id'=>$oldGroups], 'matcher_chat_member'=>['message_id'=>$oldGroups],
        'matcher_chat_entry_sequence'=>['message_id'=>$oldGroups], 'matcher_chat_read_state'=>['message_id'=>$oldGroups],
        'matcher_chat_send_receipt'=>['message_id'=>$oldGroups], 'matcher_chat_attachment'=>['message_id'=>$oldGroups],
        'matcher_chat_viewer_revision'=>['user_id'=>$oldActors], 'user_friendship'=>['user_id'=>$oldActors]] as $table=>$where) {
        $rows = $q($table)->where($where)->all($db);
        // Only the explicitly added compatibility columns are normalized across migration.
        foreach ($rows as &$row) {
            if ($table === 'matcher_chat_conversation' && array_key_exists('owner_id', $row)) { if ($row['owner_id'] !== null) { throw new RuntimeException('Legacy owner changed.'); } unset($row['owner_id']); }
            if ($table === 'matcher_chat_member' && array_key_exists('version', $row)) { if ((int)$row['version'] !== 1) { throw new RuntimeException('Legacy version changed.'); } unset($row['version']); }
        } unset($row);
        usort($rows, static fn(array $a, array $b): int => strcmp(json_encode($a), json_encode($b))); $legacy[$table] = $rows;
    }
    foreach (['file','queue','contentcontainer_blocked_users'] as $table) {
        if ($table === 'contentcontainer_blocked_users') {
            $containers = $q('user')->select('contentcontainer_id')->where(['id'=>$oldActors])->column($db);
            $rows = $q($table)->where(['or',['contentcontainer_id'=>$containers],['user_id'=>$oldActors]])->all($db);
        } else { $rows = $q($table)->all($db); }
        usort($rows, static fn(array $a, array $b): int => strcmp(json_encode($a), json_encode($b))); $legacy[$table] = $rows;
    }
    if (count($legacy['message_entry']) !== 28 || count($legacy['file']) !== 16 || count($legacy['queue']) !== 1) { throw new RuntimeException('Old fixture counts changed.'); }
    $legacyHash = hash('sha256', json_encode($legacy, JSON_THROW_ON_ERROR));
    $file = $chatRuntime . '/c07a-fixture.json'; $table = '_chat_c07a_fixture'; $stage = 'provenance';
    if (!file_exists($file)) {
        if ($action !== 'baseline' || is_link($file) || $db->schema->getTableSchema($table, true) !== null || $count('user') !== 8 || $count('message') !== 5) { throw new RuntimeException('New scope must start at reviewed baseline.'); }
        $actors=[]; foreach (['a','b','outsider'] as $role) { $actors[$role]=['username'=>'chat_c07a_'.$role, 'password'=>bin2hex(random_bytes(24))]; }
        $private=['kind'=>'chat-c07a-group-v1','nonce'=>$chatConfig['nonce'],'legacy_hash'=>$legacyHash,'actors'=>$actors];
        $handle=fopen($file,'x'); if (!$handle) { throw new RuntimeException('Private marker refused.'); }
        try { chmod($file,0600); $bytes=json_encode($private,JSON_THROW_ON_ERROR); if(fwrite($handle,$bytes)!==strlen($bytes)||!fflush($handle)){throw new RuntimeException('Private marker failed.');} } finally { fclose($handle); }
    }
    chatPrivatePath($file,0600); $private=json_decode(file_get_contents($file),true,16,JSON_THROW_ON_ERROR);
    if (($private['kind']??null)!=='chat-c07a-group-v1' || !hash_equals($chatConfig['nonce'],$private['nonce']??'') || !hash_equals($private['legacy_hash']??'',$legacyHash)
        || array_keys($private['actors']??[])!==['a','b','outsider']) { throw new RuntimeException('C07A provenance or legacy data changed.'); }
    foreach($private['actors'] as $role=>$record) { if (($record['username']??null)!=='chat_c07a_'.$role || preg_match('/^[a-f0-9]{48}$/D',$record['password']??'')!==1) { throw new RuntimeException('Private actor shape changed.'); } }
    if ($action === 'baseline') {
        ob_end_clean(); echo PHP_EOL,'__CHAT_CONTROL_RESULT__',PHP_EOL,json_encode(['status'=>'passed','action'=>$action,'database'=>$chatConfig['database'],'legacy_hash'=>$legacyHash,'legacy_preserved'=>true,'old_terminal_revoked'=>true,'credentials_returned'=>false]),PHP_EOL; exit;
    }
    if (!$db->schema->getTableSchema('matcher_chat_group_receipt', true)) { throw new RuntimeException('Group migration absent.'); }
    if ($db->schema->getTableSchema($table, true) === null) {
        if ($action !== 'prepare' || $count('user')!==8 || $count('message')!==5) { throw new RuntimeException('Fixed prepare required.'); }
        $db->createCommand()->createTable($table,['id'=>'integer NOT NULL PRIMARY KEY','spec'=>'varchar(64) NOT NULL','nonce'=>'char(64) NOT NULL','payload_json'=>'text NOT NULL'],'ENGINE=InnoDB')->execute();
    }
    $marker=$q($table)->where(['id'=>1])->one($db);
    if (!$marker) {
        if ($action!=='prepare'||$count($table)!==0||$count('user')!==8||$count('message')!==5) { throw new RuntimeException('Unowned fixture rows.'); }
        $stage='create-owned-actors'; $tx=$db->beginTransaction();
        try {
            $users=[];
            foreach($private['actors'] as $role=>$record) {
                $user=new humhub\modules\user\models\User(['username'=>$record['username'],'email'=>$record['username'].'@example.invalid','status'=>1,'language'=>'en-US']);
                if(!$user->save()){throw new RuntimeException('Synthetic user failed.');}
                $user->profile->firstname='Synthetic';$user->profile->lastname='Chat C07A '.$role;
                if(!$user->profile->save()){throw new RuntimeException('Synthetic profile failed.');}
                $password=new humhub\modules\user\models\Password(['user_id'=>$user->id]);$password->setPassword($record['password']);
                if(!$password->save()){throw new RuntimeException('Synthetic password failed.');}$users[$role]=$user;
            }
            $app->user->switchIdentity($users['a']);$message=new humhub\modules\mail\models\Message(['title'=>'Synthetic C07A existing direct']);
            if(!$message->save()){throw new RuntimeException('Synthetic direct failed.');}
            foreach(['a','b'] as $i=>$role){$member=new humhub\modules\mail\models\UserMessage(['message_id'=>$message->id,'user_id'=>$users[$role]->id,'is_originator'=>$i===0?1:0]);$member->informAfterAdd=false;if(!$member->save()){throw new RuntimeException('Synthetic member failed.');}}
            foreach([['a','b'],['b','a']] as [$from,$to]){$db->createCommand()->insert('user_friendship',['user_id'=>$users[$from]->id,'friend_user_id'=>$users[$to]->id,'created_at'=>gmdate('Y-m-d H:i:s')])->execute();}
            $state=['actors'=>array_map(static fn($u):int=>(int)$u->id,$users),'conversation_id'=>(int)$message->id,'legacy_hash'=>$legacyHash,'queue_count'=>1];
            if($count('queue')!==1||$count('message_entry')!==28){throw new RuntimeException('Unexpected fixture side effect.');}
            $db->createCommand()->insert($table,['id'=>1,'spec'=>$private['kind'],'nonce'=>$chatConfig['nonce'],'payload_json'=>json_encode($state,JSON_THROW_ON_ERROR)])->execute();$tx->commit();
        } catch(Throwable $e) { if($tx->isActive){$tx->rollBack();}throw $e; }
        $marker=$q($table)->where(['id'=>1])->one($db);
    }
    if($count($table)!==1||$marker['spec']!==$private['kind']||!hash_equals($chatConfig['nonce'],$marker['nonce'])) {throw new RuntimeException('Owned marker changed.');}
    $state=json_decode($marker['payload_json'],true,16,JSON_THROW_ON_ERROR);$actors=$state['actors'];$id=$state['conversation_id'];
    if(array_keys($state)!==['actors','conversation_id','legacy_hash','queue_count']||array_keys($actors)!==['a','b','outsider']||count(array_unique($actors))!==3||array_intersect($actors,$oldActors)||in_array($id,$oldGroups,true)||$state['legacy_hash']!==$legacyHash){throw new RuntimeException('Owned scope mismatch.');}
    foreach($actors as $role=>$uid){$u=$q('user')->where(['id'=>$uid,'username'=>$private['actors'][$role]['username'],'status'=>1])->one($db);if(!$u){throw new RuntimeException('Owned actor mismatch.');}}
    $pair=[$actors['a'],$actors['b']];sort($pair);
    if($action==='prepare'){$chat->admission()->acceptExistingDirect($id,$pair,'chat-c07a-group-v1:direct');}
    if(!$q('matcher_chat_conversation')->where(['message_id'=>$id,'type'=>'direct','status'=>'active','admission_ref'=>'chat-c07a-group-v1:direct'])->exists($db)){throw new RuntimeException('Owned direct admission missing.');}
    $where=['or',['user_id'=>$pair[0],'friend_user_id'=>$pair[1]],['user_id'=>$pair[1],'friend_user_id'=>$pair[0]]];
    $container=(int)$q('user')->select('contentcontainer_id')->where(['id'=>$actors['a']])->scalar($db);$block=['contentcontainer_id'=>$container,'user_id'=>$actors['b']];
    if($action==='unfriend'){$db->createCommand()->delete('user_friendship',$where)->execute();}
    if($action==='refriend') {foreach([[$pair[0],$pair[1]],[$pair[1],$pair[0]]] as [$a,$b]){if(!$q('user_friendship')->where(['user_id'=>$a,'friend_user_id'=>$b])->exists($db)){$db->createCommand()->insert('user_friendship',['user_id'=>$a,'friend_user_id'=>$b,'created_at'=>gmdate('Y-m-d H:i:s')])->execute();}}}
    if($action==='block'&&!$q('contentcontainer_blocked_users')->where($block)->exists($db)){$db->createCommand()->insert('contentcontainer_blocked_users',$block)->execute();}
    if($action==='unblock'){$db->createCommand()->delete('contentcontainer_blocked_users',$block)->execute();}
    $groups=$q('matcher_chat_conversation')->where(['type'=>'group'])->orderBy('message_id')->all($db);
    if(count($groups)>12||$count('user')!==11||$count('message')!==6+count($groups)||$count('message_entry')!==28||$count('file')!==16||$count('queue')!==1||$count('space')!==0){throw new RuntimeException('Unexpected global scope or side effect.');}
    foreach($groups as $group){if(!in_array((int)$group['owner_id'],array_values($actors),true)||$group['pair_low']!==null||$group['pair_high']!==null){throw new RuntimeException('Unowned group.');}}
    $groupIds=array_map(static fn($g):int=>(int)$g['message_id'],$groups);
    $invitations=$q('matcher_chat_group_invitation')->orderBy('id')->all($db);$receipts=$q('matcher_chat_group_receipt')->orderBy(['actor_id'=>SORT_ASC,'operation'=>SORT_ASC,'client_command_id'=>SORT_ASC])->all($db);
    if(count($invitations)>80||count($receipts)>160){throw new RuntimeException('Fixture growth bound exceeded.');}
    foreach($invitations as $i){if(!in_array((int)$i['message_id'],$groupIds,true)||!in_array((int)$i['inviter_id'],array_values($actors),true)||!in_array((int)$i['invitee_id'],array_values($actors),true)){throw new RuntimeException('Unowned invitation.');}}
    foreach($receipts as $r){if(!in_array((int)$r['message_id'],$groupIds,true)||!in_array((int)$r['actor_id'],array_values($actors),true)){throw new RuntimeException('Unowned receipt.');}}
    $members=$q('matcher_chat_member')->where(['message_id'=>$groupIds])->orderBy(['message_id'=>SORT_ASC,'user_id'=>SORT_ASC,'generation'=>SORT_ASC])->all($db);
    $nativeMembers=$q('user_message')->select(['message_id','user_id'])->where(['message_id'=>$groupIds])->orderBy(['message_id'=>SORT_ASC,'user_id'=>SORT_ASC])->all($db);
    $payload=['status'=>'passed','action'=>$action,'database'=>$chatConfig['database'],'fixture'=>$private['kind'],'synthetic_ids'=>['actors'=>$actors,'conversation_id'=>$id],
        'legacy_preserved'=>true,'legacy_hash'=>$legacyHash,'old_terminal_revoked'=>true,'group_count'=>count($groups),'invitation_count'=>count($invitations),'receipt_count'=>count($receipts),
        'members'=>$members,'native_members'=>$nativeMembers,'groups'=>array_map(static fn($g):array=>array_intersect_key($g,array_flip(['message_id','owner_id','status','version','last_seq'])),$groups),
        'invitations'=>$invitations,'total_message_count'=>28,'file_count'=>16,'queue_count'=>1,'friendship_rows'=>(int)$q('user_friendship')->where($where)->count('*',$db),
        'blocked_rows'=>(int)$q('contentcontainer_blocked_users')->where($block)->count('*',$db),'credentials_returned'=>false];
    ob_end_clean();echo PHP_EOL,'__CHAT_CONTROL_RESULT__',PHP_EOL,json_encode($payload,JSON_THROW_ON_ERROR),PHP_EOL;
} catch(Throwable $e) {while(ob_get_level()>0){ob_end_clean();}fwrite(STDERR,json_encode(['status'=>'failed','stage'=>$stage,'exception_type'=>get_class($e),'reason'=>'C07A fixture refused; private diagnostics suppressed.']).PHP_EOL);exit(1);}
