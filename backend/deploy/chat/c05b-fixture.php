<?php
declare(strict_types=1);
/** Fixed C05B synthetic attachment fixture; never resets C04/C05A rows. */
if (PHP_SAPI !== 'cli' || count($argv) !== 2 || !in_array($argv[1], ['prepare', 'snapshot', 'unfriend', 'refriend', 'block', 'unblock'], true)) { exit(2); }
ob_start(); $stage = 'bootstrap';
try {
    $action = $argv[1]; $app = require __DIR__ . '/bootstrap.php'; $db = $app->db;
    $chat = $app->moduleManager->getModule('matcher-chat', false);
    if ($chatConfig['modules'] !== ['mail', 'matcher-chat-ui', 'matcher-chat'] || !$chat || !$chat->isEnabled) { throw new RuntimeException('Fixed modules absent.'); }
    $query = static fn(string $t): yii\db\Query => (new yii\db\Query())->from($t);
    $count = static fn(string $t): int => (int)$query($t)->count('*', $db);
    $old = [];
    foreach (['_chat_c04_fixture' => 'chat-c04-synthetic-v1', '_chat_c05_fixture' => 'chat-c05-text-v1'] as $table => $spec) {
        $row = $query($table)->where(['id' => 1])->one($db);
        if (!$row || $row['spec'] !== $spec || !hash_equals($chatConfig['nonce'], $row['nonce'])) { throw new RuntimeException('Previous provenance absent.'); }
        $old[$table] = json_decode($row['payload_json'], true, 16, JSON_THROW_ON_ERROR);
    }
    $oldActors = array_merge(array_values($old['_chat_c04_fixture']['actors']), array_values($old['_chat_c05_fixture']['actors']));
    $oldConversations = array_merge(array_values($old['_chat_c04_fixture']['conversations']), [$old['_chat_c05_fixture']['conversation_id']]);
    if (count(array_unique($oldActors)) !== 5 || count(array_unique($oldConversations)) !== 4) { throw new RuntimeException('Previous fixture shape changed.'); }
    $legacy = [];
    foreach (['user' => ['id' => $oldActors], 'profile' => ['user_id' => $oldActors], 'message' => ['id' => $oldConversations],
        'user_message' => ['message_id' => $oldConversations], 'message_entry' => ['message_id' => $oldConversations],
        'matcher_chat_conversation' => ['message_id' => $oldConversations], 'matcher_chat_member' => ['message_id' => $oldConversations],
        'matcher_chat_entry_sequence' => ['message_id' => $oldConversations], 'matcher_chat_read_state' => ['message_id' => $oldConversations],
        'matcher_chat_send_receipt' => ['message_id' => $oldConversations], 'user_friendship' => ['user_id' => $oldActors]] as $table => $where) {
        $rows = $query($table)->where($where)->all($db);
        usort($rows, static fn(array $a, array $b): int => strcmp(json_encode($a), json_encode($b)));
        $legacy[$table] = $rows;
    }
    if (count($legacy['message_entry']) !== 19 || count($legacy['matcher_chat_send_receipt']) !== 11 || count($legacy['user_friendship']) !== 2) { throw new RuntimeException('Previous data count changed.'); }
    $legacyHash = hash('sha256', json_encode($legacy, JSON_THROW_ON_ERROR));
    $file = $chatRuntime . '/c05b-fixture.json'; $table = '_chat_c05b_fixture';
    $exists = $db->schema->getTableSchema($table, true) !== null;
    if (!file_exists($file)) {
        if ($action !== 'prepare' || $exists || is_link($file)) { throw new RuntimeException('New fixture ownership absent.'); }
        foreach (['user'=>5,'profile'=>5,'message'=>4,'user_message'=>8,'message_entry'=>19,'file'=>0,'space'=>0,'user_friendship'=>2,'contentcontainer_blocked_users'=>0] as $t=>$n) {
            if ($count($t)!==$n) { throw new RuntimeException('Unexpected initial baseline.'); }
        }
        $actors=[];
        foreach (['a','b','outsider'] as $role) { $actors[$role]=['username'=>'chat_c05b_'.$role,'password'=>bin2hex(random_bytes(24))]; }
        $private=['kind'=>'chat-c05b-attachment-v1','nonce'=>$chatConfig['nonce'],'actors'=>$actors];
        $handle=fopen($file,'x'); if (!$handle) { throw new RuntimeException('Private marker refused.'); }
        try { chmod($file,0600); $bytes=json_encode($private,JSON_THROW_ON_ERROR); if(fwrite($handle,$bytes)!==strlen($bytes)||!fflush($handle)){throw new RuntimeException('Private marker failed.');} } finally { fclose($handle); }
    }
    chatPrivatePath($file,0600); $private=json_decode(file_get_contents($file),true,16,JSON_THROW_ON_ERROR);
    if (($private['kind']??null)!=='chat-c05b-attachment-v1'||!hash_equals($chatConfig['nonce'],$private['nonce']??'')||array_keys($private['actors']??[])!==['a','b','outsider']) { throw new RuntimeException('Private scope changed.'); }
    foreach($private['actors'] as $role=>$record){if(($record['username']??null)!=='chat_c05b_'.$role||preg_match('/^[a-f0-9]{48}$/D',$record['password']??'')!==1){throw new RuntimeException('Private shape changed.');}}
    if (!$exists) {
        if($action!=='prepare'){throw new RuntimeException('Fixture marker absent.');}
        $db->createCommand()->createTable($table,['id'=>'integer NOT NULL PRIMARY KEY','spec'=>'varchar(64) NOT NULL','nonce'=>'char(64) NOT NULL','payload_json'=>'text NOT NULL'],'ENGINE=InnoDB')->execute();
    }
    $marker=$query($table)->where(['id'=>1])->one($db);
    if(!$marker){
        if($action!=='prepare'||$count($table)!==0||$count('user')!==5||$count('message')!==4||$count('message_entry')!==19||$count('file')!==0){throw new RuntimeException('Unowned new rows refused.');}
        $queue=$count('queue');$stage='prepare-owned-synthetic';$tx=$db->beginTransaction();
        try {
            $users=[];
            foreach($private['actors'] as $role=>$record){
                $user=new humhub\modules\user\models\User(['username'=>$record['username'],'email'=>$record['username'].'@example.invalid','status'=>1,'language'=>'en-US']);
                if(!$user->save()){throw new RuntimeException('Synthetic user failed.');}
                $user->profile->firstname='Synthetic';$user->profile->lastname='Chat C05B '.$role;
                if(!$user->profile->save()){throw new RuntimeException('Synthetic profile failed.');}
                $password=new humhub\modules\user\models\Password(['user_id'=>$user->id]);$password->setPassword($record['password']);
                if(!$password->save()){throw new RuntimeException('Synthetic password failed.');}$users[$role]=$user;
            }
            $app->user->switchIdentity($users['a']);$message=new humhub\modules\mail\models\Message(['title'=>'Synthetic C05B attachments']);
            if(!$message->save()){throw new RuntimeException('Synthetic conversation failed.');}
            foreach(['a','b'] as $i=>$role){$member=new humhub\modules\mail\models\UserMessage(['message_id'=>$message->id,'user_id'=>$users[$role]->id,'is_originator'=>$i===0?1:0]);$member->informAfterAdd=false;if(!$member->save()){throw new RuntimeException('Synthetic member failed.');}}
            foreach([['a','b'],['b','a']] as [$from,$to]){$db->createCommand()->insert('user_friendship',['user_id'=>$users[$from]->id,'friend_user_id'=>$users[$to]->id,'created_at'=>gmdate('Y-m-d H:i:s')])->execute();}
            $state=['actors'=>array_map(static fn($u):int=>(int)$u->id,$users),'conversation_id'=>(int)$message->id,'legacy_hash'=>$legacyHash,'queue_count'=>$queue];
            if($count('queue')!==$queue){throw new RuntimeException('Unexpected queue write.');}
            $db->createCommand()->insert($table,['id'=>1,'spec'=>$private['kind'],'nonce'=>$chatConfig['nonce'],'payload_json'=>json_encode($state,JSON_THROW_ON_ERROR)])->execute();$tx->commit();
        }catch(Throwable $e){if($tx->isActive){$tx->rollBack();}throw $e;}
        $marker=$query($table)->where(['id'=>1])->one($db);
    }
    $stage='validate-owned-scope';
    if($count($table)!==1||$marker['spec']!==$private['kind']||!hash_equals($chatConfig['nonce'],$marker['nonce'])){throw new RuntimeException('Marker changed.');}
    $state=json_decode($marker['payload_json'],true,16,JSON_THROW_ON_ERROR);
    if(!in_array(array_keys($state),[['actors','conversation_id','legacy_hash','queue_count'],['actors','conversation_id','legacy_hash','queue_count','revocation_probe']],true)||array_keys($state['actors'])!==['a','b','outsider']||!hash_equals($state['legacy_hash'],$legacyHash)){throw new RuntimeException('Previous rows changed.');}
    $pair=[$state['actors']['a'],$state['actors']['b']];sort($pair);$id=$state['conversation_id'];
    $revoked=isset($state['revocation_probe']);
    if($revoked&&($state['revocation_probe']!==['spec'=>'chat-c05b-revocation-v1','removed_user_id'=>$state['actors']['b']]||$action!=='snapshot')){throw new RuntimeException('Terminal variant cannot mutate or readmit.');}
    $expectedMembers=$revoked?[$state['actors']['a']]:$pair;
    if(count(array_unique($state['actors']))!==3||array_intersect($state['actors'],$oldActors)||in_array($id,$oldConversations,true)){throw new RuntimeException('Overlapping scope.');}
    foreach($state['actors'] as $role=>$uid){
        if(!is_int($uid)||$uid<1){throw new RuntimeException('Invalid owned ID.');}
        $user=humhub\modules\user\models\User::findOne(['id'=>$uid,'username'=>$private['actors'][$role]['username'],'status'=>1]);
        $password=humhub\modules\user\models\Password::findOne(['user_id'=>$uid]);
        if(!$user||!$password||!$password->validatePassword($private['actors'][$role]['password'])){throw new RuntimeException('Owned actor changed.');}
    }
    if(!$query('message')->where(['id'=>$id,'title'=>'Synthetic C05B attachments'])->exists($db)||array_map('intval',$query('user_message')->select('user_id')->where(['message_id'=>$id])->orderBy('user_id')->column($db))!==$expectedMembers){throw new RuntimeException('Owned conversation changed.');}
    foreach(['user'=>8,'profile'=>8,'message'=>5,'user_message'=>($revoked?9:10),'space'=>0,'queue'=>$state['queue_count']] as $t=>$n){if($count($t)!==$n){throw new RuntimeException('Unexpected global count.');}}
    $files=$query('file')->all($db);if(count($files)>80){throw new RuntimeException('File bound exceeded.');}
    foreach($files as $f){if(!in_array((int)$f['created_by'],$pair,true)){throw new RuntimeException('Unowned file.');}}
    if($action==='prepare'){$chat->admission()->acceptExistingDirect($id,$pair,'chat-c05b-attachment-v1:direct');}
    $managed=$query('matcher_chat_conversation')->where(['message_id'=>$id])->one($db);
    if(!$managed||!in_array($managed['status'],$revoked?['active','revoked']:['active'],true)||$managed['admission_ref']!=='chat-c05b-attachment-v1:direct'){throw new RuntimeException('Attachment admission changed.');}
    $friendWhere=['or',['user_id'=>$pair[0],'friend_user_id'=>$pair[1]],['user_id'=>$pair[1],'friend_user_id'=>$pair[0]]];
    $friends=(int)$query('user_friendship')->where($friendWhere)->count('*',$db);
    if(!in_array($friends,[0,2],true)||$count('user_friendship')!==2+$friends){throw new RuntimeException('Unowned friendship rows.');}
    $container=(int)$query('user')->select('contentcontainer_id')->where(['id'=>$state['actors']['a']])->scalar($db);
    $blockWhere=['contentcontainer_id'=>$container,'user_id'=>$state['actors']['b']];
    if((int)$query('contentcontainer_blocked_users')->where($blockWhere)->count('*',$db)!==$count('contentcontainer_blocked_users')){throw new RuntimeException('Unowned block rows.');}
    $entries=$query('message_entry')->where(['message_id'=>$id])->orderBy('id')->all($db);
    if(count($entries)>32||$count('message_entry')!==19+count($entries)){throw new RuntimeException('Message bound exceeded.');}
    foreach($entries as $entry){if(!in_array((int)$entry['user_id'],$pair,true)||!$query('matcher_chat_send_receipt')->where(['entry_id'=>$entry['id'],'message_id'=>$id,'user_id'=>$entry['user_id']])->exists($db)||!$query('matcher_chat_entry_sequence')->where(['entry_id'=>$entry['id'],'message_id'=>$id])->exists($db)){throw new RuntimeException('Unowned message.');}}
    if($count('matcher_chat_send_receipt')!==11+count($entries)){throw new RuntimeException('Unexpected receipts.');}
    $stage='fixed-relation-transition';
    if($action==='unfriend'){$db->createCommand()->delete('user_friendship',$friendWhere)->execute();}
    if($action==='refriend'&&$friends===0){$tx=$db->beginTransaction();try{foreach([[$pair[0],$pair[1]],[$pair[1],$pair[0]]] as [$from,$to]){$db->createCommand()->insert('user_friendship',['user_id'=>$from,'friend_user_id'=>$to,'created_at'=>gmdate('Y-m-d H:i:s')])->execute();}$tx->commit();}catch(Throwable $e){if($tx->isActive){$tx->rollBack();}throw $e;}}
    if($action==='block'&&!$query('contentcontainer_blocked_users')->where($blockWhere)->exists($db)){$db->createCommand()->insert('contentcontainer_blocked_users',$blockWhere)->execute();}
    if($action==='unblock'){$db->createCommand()->delete('contentcontainer_blocked_users',$blockWhere)->execute();}
    $result=['status'=>'passed','action'=>$action,'fixture'=>$private['kind'],'database'=>$chatConfig['database'],
        'synthetic_ids'=>['actors'=>$state['actors'],'conversation_id'=>$id],'legacy_preserved'=>true,'legacy_hash'=>$legacyHash,
        'terminal_revocation'=>$revoked,'managed_status'=>$managed['status'],'message_count'=>count($entries),'total_message_count'=>$count('message_entry'),'file_count'=>count($files),
        'messages_hash'=>hash('sha256',json_encode($entries,JSON_THROW_ON_ERROR)),'last_seq'=>(int)$managed['last_seq'],
        'read_state'=>$query('matcher_chat_read_state')->select(['user_id','read_seq','generation'])->where(['message_id'=>$id])->orderBy('user_id')->all($db),
        'native_seen'=>$query('user_message')->select(['user_id','last_viewed'])->where(['message_id'=>$id])->orderBy('user_id')->all($db),
        'friendship_rows'=>(int)$query('user_friendship')->where($friendWhere)->count('*',$db),'blocked_rows'=>$count('contentcontainer_blocked_users'),'queue_count'=>$count('queue'),'credentials_returned'=>false];
    ob_end_clean();echo PHP_EOL,'__CHAT_CONTROL_RESULT__',PHP_EOL,json_encode($result,JSON_THROW_ON_ERROR),PHP_EOL;
}catch(Throwable $e){while(ob_get_level()>0){ob_end_clean();}fwrite(STDERR,json_encode(['status'=>'failed','stage'=>$stage,'type'=>get_class($e),'reason'=>'Fixed C05B scope refused.']).PHP_EOL);exit(1);}
