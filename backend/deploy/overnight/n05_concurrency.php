<?php
declare(strict_types=1);
/** Root-run only: fixed N05 synthetic registry, private race artifacts, no arbitrary target input. */
if (PHP_SAPI !== 'cli' || count($argv) !== 2 || !in_array($argv[1] ?? '', ['prepare','winner','contender','verify'], true)) { exit(2); }
ob_start();
$checks=[];
$check=static function(string $label,bool $ok)use(&$checks):void{$checks[]=['case_id'=>$label,'pass'=>$ok];if(!$ok)throw new RuntimeException('Synthetic race assertion failed.');};
try {
    $action=$argv[1];
    $app=require __DIR__.'/bootstrap.php';
    if(!in_array('matcher-event-access',$isolatedConfig['modules'],true))throw new RuntimeException('guard');
    $read=static function(string $name)use($isolatedRuntime):array{
        $path=$isolatedRuntime.'/'.$name;
        if(!is_file($path)||is_link($path)||(fileperms($path)&0777)!==0600)throw new RuntimeException('Private race input guard.');
        $value=json_decode(file_get_contents($path),true,24,JSON_THROW_ON_ERROR);
        if(!is_array($value))throw new RuntimeException('Private race input shape.');
        return $value;
    };
    $write=static function(string $name,array $value)use($isolatedRuntime):void{
        $path=$isolatedRuntime.'/'.$name;
        if(is_link($path)||(file_exists($path)&&(!is_file($path)||(fileperms($path)&0777)!==0600)))throw new RuntimeException('Private race output guard.');
        $temporary=$path.'.pending-'.bin2hex(random_bytes(12));
        $stream=fopen($temporary,'x');
        if(!$stream)throw new RuntimeException('Private race output unavailable.');
        try{if(!chmod($temporary,0600)||fwrite($stream,json_encode($value,JSON_THROW_ON_ERROR))===false||!fflush($stream))throw new RuntimeException('Private race persistence failed.');}
        finally{fclose($stream);}
        if(!rename($temporary,$path))throw new RuntimeException('Private race replacement failed.');
    };
    $manifest=null;$deadline=microtime(true)+5;
    do{
        $manifest=$read('n05-concurrency-processes.json');
        if(($manifest['pids'][$action]??null)===getmypid())break;
        usleep(10000);
    }while(microtime(true)<$deadline);
    if(($manifest['kind']??null)!=='n05-concurrency-processes-v1'||($manifest['nonce']??null)!==$isolatedConfig['nonce']
        ||!preg_match('/^[a-f0-9]{32}$/D',(string)($manifest['run_nonce']??''))||($manifest['pids'][$action]??null)!==getmypid()
        ||!is_int($manifest['parent_pid']??null)||$manifest['parent_pid']<1)throw new RuntimeException('Process provenance guard.');
    $runNonce=$manifest['run_nonce'];
    $fixture=$read('n05-synthetic-fixtures.json');
    if(($fixture['kind']??null)!=='n05-synthetic-v1'||($fixture['nonce']??null)!==$isolatedConfig['nonce']
        ||!preg_match('/^n05_[a-f0-9]{12}$/D',(string)($fixture['prefix']??'')))throw new RuntimeException('Fixture provenance guard.');
    $users=[];
    foreach(['owner','member','target','outsider','racer_a','racer_b'] as $role){
        $record=$fixture['actors'][$role]??[];$name=$fixture['prefix'].'_'.$role;
        $user=humhub\modules\user\models\User::findOne(['id'=>$record['user_id']??null,'username'=>$name,'email'=>$name.'@example.invalid','status'=>humhub\modules\user\models\User::STATUS_ENABLED]);
        if(!$user||($record['username']??null)!==$name)throw new RuntimeException('Synthetic identity guard.');
        $users[$role]=$user;
    }
    $space=humhub\modules\space\models\Space::findOne(['id'=>$fixture['spaces']['a']??null,'name'=>$fixture['prefix'].'_space_a','created_by'=>$users['owner']->id,'status'=>humhub\modules\space\models\Space::STATUS_ENABLED]);
    if(!$space)throw new RuntimeException('Synthetic Space guard.');
    $spaceId=(int)$space->id;$db=$app->db;
    $count=static fn(string $table,array $where=[]):int=>(int)(new yii\db\Query())->from($table)->where($where)->count('*',$db);
    $lifecycle=new humhub\modules\matcherEventAccess\adapters\native\NativeMembershipLifecycle($db);
    $native=new humhub\modules\matcherEventAccess\adapters\native\NativeMembershipGateway($db,$lifecycle);
    $store=new humhub\modules\matcherEventAccess\adapters\persistence\SqlEventAccessStore($db);
    $service=new humhub\modules\matcherEventAccess\application\EventAccessService($store,$native);
    $common=['nonce'=>$isolatedConfig['nonce'],'run_nonce'=>$runNonce,'fixture_prefix'=>$fixture['prefix']];
    $valid=static function(array $value,string $kind)use($common):void{if(($value['kind']??null)!==$kind)throw new RuntimeException('Race artifact kind.');foreach($common as $k=>$v)if(($value[$k]??null)!==$v)throw new RuntimeException('Race artifact provenance.');};
    $statePath=$isolatedRuntime.'/n05-concurrency-state.json';
    if($action==='prepare'){
        if(file_exists($statePath)||is_link($statePath))throw new RuntimeException('Existing race state must be reviewed, never reset.');
        foreach(['racer_a','racer_b'] as $role){
            $actor=(int)$users[$role]->id;
            $check($role.'_has_no_a_membership',$count('space_membership',['user_id'=>$actor,'space_id'=>$spaceId])===0);
            $check($role.'_has_no_a_receipt_or_outbox',$count('matcher_event_receipt',['actor_id'=>$actor,'space_id'=>$spaceId])===0&&$count('matcher_event_outbox',['actor_id'=>$actor,'space_id'=>$spaceId])===0);
        }
        $app->user->switchIdentity($users['owner']);
        $invitation=$service->create((int)$users['owner']->id,$spaceId,gmdate('Y-m-d\TH:i:s\Z',time()+3600),1,'concurrency-create-'.$runNonce,'create_invitation');
        $check('fresh_one_use_invitation_created',$invitation['uses']===0&&$invitation['max_uses']===1&&is_string($invitation['token']));
        $state=$common+['kind'=>'n05-concurrency-state-v1','space_id'=>$spaceId,'invitation_id'=>$invitation['invitation_id'],'token'=>$invitation['token'],'winner_key'=>'concurrency-winner-'.$runNonce,'contender_key'=>'concurrency-contender-'.$runNonce,'created_at'=>microtime(true)];
        $write('n05-concurrency-state.json',$state);
    }else{
        $state=$read('n05-concurrency-state.json');$valid($state,'n05-concurrency-state-v1');
        if(($state['space_id']??null)!==$spaceId||!preg_match('/^inv-[a-f0-9]{32}$/D',(string)($state['invitation_id']??''))||!preg_match('/^[A-Za-z0-9_-]{43}$/D',(string)($state['token']??'')))throw new RuntimeException('Race state target guard.');
        if(in_array($action,['winner','contender'],true)){
            $role=$action==='winner'?'racer_a':'racer_b';$actor=(int)$users[$role]->id;$app->user->switchIdentity($users[$role]);
            $check('race_actor_still_not_a_member',$native->current($actor,$spaceId)===null);
            $thread=(int)$db->createCommand('SELECT CONNECTION_ID()')->queryScalar();
            $timing=['started_at'=>microtime(true),'connection_id'=>$thread,'pid'=>getmypid(),'transaction_attempts'=>[]];
            $begin=static function()use(&$timing,$action,$write,$common):void{
                $timing['transaction_attempts'][]=microtime(true);
                if($action==='contender'&&count($timing['transaction_attempts'])===1)$write('n05-concurrency-contender-ready.json',$common+['kind'=>'n05-concurrency-ready-v1','pid'=>getmypid(),'attempted_at'=>end($timing['transaction_attempts'])]);
            };
            $db->on(yii\db\Connection::EVENT_BEGIN_TRANSACTION,$begin);
            if($action==='winner'){
                $gateway=new class($native,$db,$read,$write,$valid,$common,$isolatedRuntime,$timing) implements humhub\modules\matcherEventAccess\domain\ports\MembershipGateway{
                    public array $hold=[];
                    public function __construct(private humhub\modules\matcherEventAccess\domain\ports\MembershipGateway $native,private yii\db\Connection $db,private Closure $read,private Closure $write,private Closure $valid,private array $common,private string $runtime,private array $timing){}
                    public function assertActor(int $a):void{$this->native->assertActor($a);}
                    public function assertIssuer(int $a,int $s):void{$this->native->assertIssuer($a,$s);}
                    public function assertCanAccept(int $a,int $s):void{$this->native->assertCanAccept($a,$s);}
                    public function current(int $a,int $s):?array{return $this->native->current($a,$s);}
                    public function joined(int $a,int $after,int $limit):array{return $this->native->joined($a,$after,$limit);}
                    public function join(int $a,int $s):array{
                        $member=$this->native->join($a,$s);
                        if(!$this->db->getTransaction()?->isActive)throw new RuntimeException('Winner must hold its real SQL transaction.');
                        $this->hold=['held_at'=>microtime(true),'pid'=>getmypid()];
                        ($this->write)('n05-concurrency-winner-hold.json',$this->common+['kind'=>'n05-concurrency-hold-v1']+$this->hold);
                        $deadline=microtime(true)+20;$ready=null;
                        while(microtime(true)<$deadline){
                            if(is_file($this->runtime.'/n05-concurrency-contender-ready.json')){$ready=($this->read)('n05-concurrency-contender-ready.json');break;}
                            usleep(10000);
                        }
                        if($ready===null)throw new RuntimeException('Contender did not reach transaction attempt.');
                        ($this->valid)($ready,'n05-concurrency-ready-v1');
                        $manifest=($this->read)('n05-concurrency-processes.json');
                        if(($manifest['pids']['contender']??null)!==($ready['pid']??null))throw new RuntimeException('Contender PID guard.');
                        $this->hold['contender_attempted_at']=$ready['attempted_at'];
                        usleep(1500000);
                        $this->hold['release_at']=microtime(true);
                        if(!$this->db->getTransaction()?->isActive)throw new RuntimeException('Winner transaction ended before release.');
                        return $member;
                    }
                };
                $subject=new humhub\modules\matcherEventAccess\application\EventAccessService($store,$gateway);
            }else{$subject=$service;}
            $receipt=null;$code=null;
            try{$receipt=$subject->redeem($actor,$state['token'],'join',$state[$action.'_key']);}
            catch(humhub\modules\matcherEventAccess\domain\EventAccessException $error){$code=$error->errorCode;$lifecycle->clearAfterFailure($actor);}
            finally{$db->off(yii\db\Connection::EVENT_BEGIN_TRANSACTION,$begin);}
            $timing['completed_at']=microtime(true);
            if($action==='winner')$timing+=$gateway->hold;
            $check('winner_join_or_contender_exhaustion',$action==='winner'?($code===null&&($receipt['outcome']??null)==='joined'&&($receipt['membership_current']??null)===true):($code==='INVITATION_UNAVAILABLE'&&$receipt===null));
            $check('race_action_closes_sql_transaction',!$db->getTransaction()?->isActive);
            if($action==='winner')$lifecycle->flush($actor);
            $write('n05-concurrency-'.$action.'-result.json',$common+['kind'=>'n05-concurrency-result-v1','action'=>$action,'receipt'=>$receipt,'error_code'=>$code,'timing'=>$timing]);
        }else{
            $winner=$read('n05-concurrency-winner-result.json');$contender=$read('n05-concurrency-contender-result.json');
            $valid($winner,'n05-concurrency-result-v1');$valid($contender,'n05-concurrency-result-v1');
            $w=$winner['timing'];$c=$contender['timing'];
            $check('result_processes_match_private_manifest',($winner['action']??null)==='winner'&&($contender['action']??null)==='contender'&&$w['pid']===$manifest['pids']['winner']&&$c['pid']===$manifest['pids']['contender']);
            $check('distinct_processes_and_mysql_connections',$w['pid']!==$c['pid']&&$w['connection_id']!==$c['connection_id']);
            $check('contender_attempt_occurs_while_winner_transaction_held',$w['held_at']<$c['transaction_attempts'][0]&&$c['transaction_attempts'][0]<$w['release_at']);
            $check('winner_holds_after_contender_attempt_at_least_1_4_seconds',$w['release_at']-$c['transaction_attempts'][0]>=1.4);
            $check('contender_waits_for_winner_commit',$c['completed_at']>=$w['release_at']&&$c['completed_at']-$c['transaction_attempts'][0]>=1.4);
            $check('exactly_one_join_and_one_unavailable',($winner['receipt']['outcome']??null)==='joined'&&$winner['error_code']===null&&$contender['receipt']===null&&$contender['error_code']==='INVITATION_UNAVAILABLE');
            $inv=(new yii\db\Query())->from('matcher_event_invitation')->where(['id'=>$state['invitation_id']])->one($db);
            $check('one_use_recorded',$inv!==false&&(int)$inv['uses']===1&&(int)$inv['max_uses']===1);
            $check('one_receipt_for_invitation',$count('matcher_event_receipt',['invitation_id'=>$state['invitation_id']])===1);
            $winnerId=(int)$users['racer_a']->id;$loserId=(int)$users['racer_b']->id;
            $check('one_native_membership_no_duplicate_or_loser',$count('space_membership',['user_id'=>$winnerId,'space_id'=>$spaceId])===1&&$count('space_membership',['user_id'=>$loserId,'space_id'=>$spaceId])===0);
            $outbox=(new yii\db\Query())->from('matcher_event_outbox')->where(['actor_id'=>$winnerId,'space_id'=>$spaceId])->orderBy(['sequence'=>SORT_ASC])->all($db);
            $sequences=array_column($outbox,'sequence');
            $check('outbox_is_nonempty_and_sequences_unique',count($outbox)>=1&&count(array_unique($sequences))===count($outbox));
            $check('outbox_all_dispatched_for_winner_membership',count(array_filter($outbox,static fn(array $r):bool=>$r['status']==='dispatched'&&(int)$r['membership_id']===$winner['receipt']['membership_id']))===count($outbox));
            $check('loser_has_no_outbox_or_receipt',$count('matcher_event_outbox',['actor_id'=>$loserId,'space_id'=>$spaceId])===0&&$count('matcher_event_receipt',['actor_id'=>$loserId,'invitation_id'=>$state['invitation_id']])===0);
            $snapshot=static function()use($db,$count,$state,$winnerId,$spaceId):array{
                return ['invitation'=>(new yii\db\Query())->from('matcher_event_invitation')->where(['id'=>$state['invitation_id']])->one($db),
                    'membership'=>(new yii\db\Query())->from('space_membership')->where(['user_id'=>$winnerId,'space_id'=>$spaceId])->all($db),
                    'receipt'=>(new yii\db\Query())->from('matcher_event_receipt')->where(['invitation_id'=>$state['invitation_id']])->all($db),
                    'outbox'=>(new yii\db\Query())->from('matcher_event_outbox')->where(['actor_id'=>$winnerId,'space_id'=>$spaceId])->orderBy(['id'=>SORT_ASC])->all($db)];
            };
            $before=$snapshot();$app->user->switchIdentity($users['racer_a']);
            $replay=$service->redeem($winnerId,$state['token'],'join',$state['winner_key']);$lifecycle->flush($winnerId);
            $check('same_key_replay_same_receipt',$replay===$winner['receipt']);
            $check('same_key_replay_no_new_native_or_module_effects',$snapshot()===$before);
            $result=$common+['kind'=>'n05-concurrency-verified-v1','status'=>'passed','checks'=>$checks,'hold_after_contender_ms'=>(int)round(1000*($w['release_at']-$c['transaction_attempts'][0])),'contender_elapsed_ms'=>(int)round(1000*($c['completed_at']-$c['transaction_attempts'][0]))];
            $write('n05-concurrency-verified.json',$result);
        }
    }
    while(ob_get_level()>0)ob_end_clean();
    echo json_encode(['kind'=>'n05-concurrency-action-v1','action'=>$action,'status'=>'passed','checks'=>count($checks),'cases'=>$checks,'synthetic_registry_only'=>true,'http_calls'=>0,'external_calls'=>0,'native_cross_entry_race_tested'=>false],JSON_THROW_ON_ERROR),PHP_EOL;
}catch(Throwable $error){
    while(ob_get_level()>0)ob_end_clean();
    echo json_encode(['kind'=>'n05-concurrency-action-v1','action'=>$argv[1]??'unknown','status'=>'failed','checks'=>count($checks),'cases'=>$checks,'error_type'=>get_class($error),'reason'=>'Synthetic concurrency check failed; private diagnostics suppressed.'],JSON_THROW_ON_ERROR),PHP_EOL;
    exit(1);
}

