<?php
declare(strict_types=1);
/** Fixed attachment observations and bounded lifecycle/guard exercise, no arbitrary IDs. */
if(PHP_SAPI!=='cli'||count($argv)!==2||!in_array($argv[1],['snapshot','expire-fixed','cleanup','native-veto'],true)){exit(2);}
$operation=$argv[1];$argv[1]='snapshot';ob_start();require __DIR__.'/c05b-fixture.php';$fixtureOutput=ob_get_clean();
if(substr_count($fixtureOutput,"\n__CHAT_CONTROL_RESULT__\n")!==1){exit(2);}
$fixture=json_decode(explode("\n__CHAT_CONTROL_RESULT__\n",$fixtureOutput,2)[1],true,32,JSON_THROW_ON_ERROR);
ob_start();$probeStage='scope';
try{
    $ids=$fixture['synthetic_ids'];$conversationId=$ids['conversation_id'];$actors=$ids['actors'];
    if($db->schema->getTableSchema('matcher_chat_attachment',true)===null){throw new RuntimeException('Attachment schema absent.');}
    $ownedRows=static fn():array=>(new yii\db\Query())->from('matcher_chat_attachment')->where(['message_id'=>$conversationId])->orderBy('attachment_id')->all($db);
    $rows=$ownedRows();
    if(count($rows)>80||count($rows)!==(int)(new yii\db\Query())->from('matcher_chat_attachment')->count('*',$db)){throw new RuntimeException('Unowned attachment metadata.');}
    foreach($rows as $r){if(!in_array((int)$r['user_id'],[$actors['a'],$actors['b']],true)){throw new RuntimeException('Unowned attachment actor.');}}
    // Root-only observation of this nonce-owned synthetic mount; no public API grant implied.
    $physicalPath=static function(string $guid)use($backend):string{
        if(preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/D',$guid)!==1){throw new RuntimeException('Invalid owned guid.');}
        return $backend.'/.runtime/chat-upgrade-files/data/file/'.substr($guid,0,1).'/'.substr($guid,1,1).'/'.$guid.'/file';
    };
    $checks=[];
    if($operation==='expire-fixed'){
        $probeStage='expire-owned-fixed-key';
        $row=(new yii\db\Query())->from('matcher_chat_attachment')->where(['message_id'=>$conversationId,'user_id'=>$actors['a'],'client_upload_id'=>'a05b0000-0000-4000-8000-000000000007'])->one($db);
        if(!$row||!in_array($row['state'],['staged','expired'],true)){throw new RuntimeException('Fixed expirable key absent or bound.');}
        if($row['state']==='staged'){$db->createCommand()->update('matcher_chat_attachment',['expires_at'=>time()-1],['attachment_id'=>$row['attachment_id'],'state'=>'staged'])->execute();}
    }
    if($operation==='cleanup'){
        $probeStage='real-cleanup';
        foreach(['a','b'] as $role){$app->user->switchIdentity(humhub\modules\user\models\User::findOne($actors[$role]));$chat->attachments($actors[$role])->cleanup();}
    }
    if($operation==='native-veto'){
        $probeStage='native-veto';$row=null;
        foreach($rows as $candidate){if($candidate['state']==='bound'&&(int)$candidate['user_id']===$actors['a']){$row=$candidate;break;}}
        if(!$row){throw new RuntimeException('Bound owned file required.');}
        $app->user->switchIdentity(humhub\modules\user\models\User::findOne($actors['a']));
        $getFile=static function()use($row){$f=humhub\modules\file\models\File::findOne((int)$row['file_id']);if(!$f){throw new RuntimeException('Bound native file absent.');}return $f;};
        $original=$getFile();$beforeBytes=hash_file('sha256',$physicalPath($row['file_guid']));$nativeAttrs=static fn():array=>(new yii\db\Query())->from('file')->where(['id'=>$row['file_id']])->one($db);$beforeAttrs=$nativeAttrs();
        $operations=[
            'native-model-delete'=>static fn()=>$getFile()->delete(),
            'native-bypass-public-update'=>static fn()=>$getFile()->updateAttributes(['public'=>1]),
            'native-bypass-unbind-update'=>static fn()=>$getFile()->updateAttributes(['object_model'=>null,'object_id'=>null,'standalone'=>0]),
            'native-storage-overwrite'=>static fn()=>$getFile()->getStore()->setContent('Synthetic unauthorized overwrite'),
            'native-storage-delete'=>static fn()=>$getFile()->getStore()->delete(),
        ];
        foreach($operations as $name=>$call){$denied=false;try{$call();}catch(Throwable $e){$denied=$e instanceof yii\web\HttpException && $e->statusCode===404;}if(!$denied||$nativeAttrs()!==$beforeAttrs||!hash_equals($beforeBytes,hash_file('sha256',$physicalPath($row['file_guid'])))){throw new RuntimeException('Native mutation escaped guard.');}$checks[]=$name;}
    }
    $probeStage='snapshot';$summaries=[];
    foreach($ownedRows() as $r){
        $native=$r['file_id']===null?null:humhub\modules\file\models\File::findOne((int)$r['file_id']);
        $disk=$physicalPath($r['file_guid']);$exists=is_file($disk)&&!is_link($disk);
        $summaries[]=['id'=>$r['attachment_id'],'upload_key'=>$r['client_upload_id'],'user_id'=>(int)$r['user_id'],'state'=>$r['state'],'file_id'=>$r['file_id']===null?null:(int)$r['file_id'],'file_guid'=>$r['file_guid'],'native_row'=>$native!==null,'bytes_exist'=>$exists,'bytes_sha256'=>$exists?hash_file('sha256',$disk):null,'size'=>(int)$r['size'],'entry_id'=>$r['entry_id']===null?null:(int)$r['entry_id'],'cleaned'=>$r['cleaned_at']!==null];
    }
    $result=['status'=>'passed','action'=>$operation,'database'=>$chatConfig['database'],'fixture'=>'chat-c05b-attachment-v1','attachments'=>$summaries,'checks'=>$checks,'legacy_preserved'=>$fixture['legacy_preserved'],'credentials_returned'=>false];
    ob_end_clean();echo PHP_EOL,'__CHAT_CONTROL_RESULT__',PHP_EOL,json_encode($result,JSON_THROW_ON_ERROR),PHP_EOL;
}catch(Throwable $e){while(ob_get_level()>0){ob_end_clean();}fwrite(STDERR,json_encode(['status'=>'failed','stage'=>$probeStage,'type'=>get_class($e),'file'=>basename($e->getFile()),'line'=>$e->getLine(),'reason'=>'Fixed attachment probe refused.']).PHP_EOL);exit(1);}
