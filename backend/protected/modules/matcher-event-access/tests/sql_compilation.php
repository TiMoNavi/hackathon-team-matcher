<?php
declare(strict_types=1);
$backend=dirname(__DIR__,4);
require $backend.'/protected/vendor/autoload.php';
require $backend.'/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub',$backend.'/protected/humhub');
Yii::setAlias('@humhub/modules/matcherEventAccess',dirname(__DIR__));
use humhub\modules\matcherEventAccess\adapters\persistence\SqlEventAccessStore;
use humhub\modules\matcherEventAccess\adapters\native\{NativeMembershipGateway,NativeMembershipLifecycle,LockedInvitePermission};
use yii\db\{Connection,Command,Query,Transaction};
$checks=0;
function verify(bool $value,string $label): void{global $checks;++$checks;if(!$value)throw new RuntimeException($label);}
final class OfflineTransaction extends Transaction
{
    public function getIsActive(){return true;}
}
final class RecordingCommand extends Command
{
    public function queryAll($fetchMode=null){$this->record();return [];}
    public function queryOne($fetchMode=null){$this->record();return false;}
    private function record(): void
    {
        preg_match_all('/:[A-Za-z_][A-Za-z0-9_]*/',$this->getSql(),$matches);
        $keys=array_values(array_unique($matches[0]));sort($keys);
        $bound=array_keys($this->params);sort($bound);
        verify($keys===$bound&&$keys!==[],'Every compiled SQL placeholder retains its bound value.');
        verify(array_keys($this->pendingParams)===array_keys($this->params),'PDO bindings survive final SQL construction.');
        verify($this->queryCacheDuration===-1,'Locked/current reads do not use query cache.');
        $this->db->captured[]=['sql'=>$this->getSql(),'params'=>$this->params];
    }
}
final class RecordingConnection extends Connection
{
    public array $captured=[];
    public bool $activeTransaction=true;
    public function open(){throw new RuntimeException('Offline regression must never open a database.');}
    public function getTransaction(){return $this->activeTransaction?new OfflineTransaction(['db'=>$this]):null;}
    public function createCommand($sql=null,$params=[])
    {return (new RecordingCommand(['db'=>$this,'sql'=>$sql]))->bindValues($params);}
}
$dsn='mysql:host=offline.invalid;dbname=synthetic';$cache=new \yii\caching\ArrayCache();
// MySQL's compiler probes server version for DDL types; seed only that synthetic compiler fact.
$cache->set(['yii\\db\\mysql\\QueryBuilder::supportsFractionalSeconds',$dsn],'8.0.0');
$db=new RecordingConnection(['dsn'=>$dsn,'driverName'=>'mysql','enableSchemaCache'=>true,'schemaCache'=>$cache]);
$store=new SqlEventAccessStore($db);
$id='inv-'.str_repeat('a',32);$digest=str_repeat('b',64);
verify($store->invitation($id)===null,'Invitation lookup records a compiled command.');
$store->invitationByDigest($digest);
$store->receipt('receipt-'.str_repeat('c',32));
$store->receiptFor($id,42);
$store->replay(str_repeat('d',64));
verify(count($db->captured)===5,'All five store lookup shapes compile.');
foreach($db->captured as $command)verify(str_ends_with($command['sql'],' FOR UPDATE'),'Store current reads retain row locking.');
verify(in_array($id,$db->captured[0]['params'],true)&&in_array(42,$db->captured[3]['params'],true),'Store preserves string and integer values.');
$gateway=new NativeMembershipGateway($db,new NativeMembershipLifecycle($db));
$read=new ReflectionMethod($gateway,'read');
$query=(new Query())->from(['m'=>'space_membership'])->leftJoin(['b'=>'contentcontainer_blocked_users'],'[[b.user_id]]=:actor',[':actor'=>42])->where(['m.space_id'=>7,'m.user_id'=>42,'m.status'=>3]);
$read->invoke($gateway,$query,true);
$locked=end($db->captured);
verify(str_ends_with($locked['sql'],' FOR UPDATE')&&($locked['params'][':actor']??null)===42&&count($locked['params'])===4,'Native read keeps explicit join and generated predicate bindings.');
$read->invoke($gateway,$query,false);
$unlocked=end($db->captured);
verify(!str_ends_with($unlocked['sql'],' FOR UPDATE')&&$unlocked['params']===$locked['params'],'Explicit unlocked reads preserve the same bindings.');
$permission=new LockedInvitePermission($db);
$current=new ReflectionMethod($permission,'current');
$current->invoke($permission,'contentcontainer_permission',['contentcontainer_id'=>7,'group_id'=>'member','module_id'=>'space','permission_id'=>'InviteUsers']);
$permissionRead=end($db->captured);
verify(str_ends_with($permissionRead['sql'],' FOR UPDATE')&&array_values($permissionRead['params'])===[7,'member','space','InviteUsers'],'Permission row-lock command retains all permission scope values.');
$current->invoke($permission,'contentcontainer_default_permission',['contentcontainer_class'=>'SyntheticSpace','group_id'=>'member','module_id'=>'space','permission_id'=>'InviteUsers']);
verify(count(end($db->captured)['params'])===4,'Default permission lookup retains all scope bindings.');
$db->activeTransaction=false;
$store->receiptFor($id,42);
verify(!str_ends_with(end($db->captured)['sql'],' FOR UPDATE'),'Autocommit receipt reads avoid a transaction lock suffix.');
echo json_encode(['checks'=>$checks,'passed'=>true,'network_calls'=>0,'database_calls'=>0],JSON_THROW_ON_ERROR).PHP_EOL;

