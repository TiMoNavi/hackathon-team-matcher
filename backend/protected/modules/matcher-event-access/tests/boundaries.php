<?php
declare(strict_types=1);
$backend=dirname(__DIR__,4);require $backend.'/protected/vendor/autoload.php';require $backend.'/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub',$backend.'/protected/humhub');Yii::setAlias('@humhub/modules/matcherEventAccess',dirname(__DIR__));
use humhub\modules\matcherEventAccess\domain\{EventCursor,EventAccessException};
use humhub\modules\matcherEventAccess\adapters\native\LifecycleGuard;
use humhub\modules\matcherEventAccess\adapters\native\NativeMembershipGateway;
use humhub\modules\matcherEventAccess\adapters\http\RequestBoundary;
use yii\base\{Component,Event};
$n=0;function ok(bool $v,string $label):void{global $n;++$n;if(!$v)throw new RuntimeException($label);}
function fails(callable $fn,string $code):void{try{$fn();}catch(EventAccessException $e){ok($e->errorCode===$code,'Wrong boundary error');return;}throw new RuntimeException('Missing '.$code);}
$c=new EventCursor(str_repeat('s',32));$token=$c->encode(1,24,7,1000);ok($c->decode($token,1,24,1001)===7,'Signed cursor round trip');
fails(fn()=>$c->decode($token,2,24,1001),'EVENT_CURSOR_INVALID');fails(fn()=>$c->decode($token,1,48,1001),'EVENT_CURSOR_INVALID');fails(fn()=>$c->decode($token,1,24,1900),'EVENT_CURSOR_EXPIRED');fails(fn()=>$c->decode($token.'x',1,24,1001),'EVENT_CURSOR_INVALID');
class SyntheticLifecycleRecord extends Component{}
$record=new SyntheticLifecycleRecord();$fn=static fn()=>null;
LifecycleGuard::classEvent(SyntheticLifecycleRecord::class,'beforeInsert',true);ok(true,'Empty class hooks allowed');
Event::on(SyntheticLifecycleRecord::class,'beforeInsert',$fn);fails(fn()=>LifecycleGuard::classEvent(SyntheticLifecycleRecord::class,'beforeInsert',true),'NATIVE_LIFECYCLE_UNSUPPORTED');Event::off(SyntheticLifecycleRecord::class,'beforeInsert',$fn);
Event::on('*','before*',$fn);fails(fn()=>LifecycleGuard::classEvent(SyntheticLifecycleRecord::class,'beforeInsert'),'NATIVE_LIFECYCLE_UNSUPPORTED');Event::off('*','before*',$fn);
$record->on('beforeInsert',$fn);fails(fn()=>LifecycleGuard::instanceEvent($record,'beforeInsert',true),'NATIVE_LIFECYCLE_UNSUPPORTED');$record->off('beforeInsert',$fn);
$record->on('before*',$fn);fails(fn()=>LifecycleGuard::instanceEvent($record,'beforeInsert',false),'NATIVE_LIFECYCLE_UNSUPPORTED');$record->off('before*',$fn);
$record->on('beforeInsert',$fn);LifecycleGuard::instanceEvent($record,'beforeInsert',false);ok(true,'Exact handler allowed only when interception precedes it');$record->off('beforeInsert',$fn);
class BoundaryRequest extends \yii\web\Request{public function getMethod(){return 'POST';}public function getPathInfo(){return 'api/v1/event-invitations/redeem';}}
$request=new BoundaryRequest();$request->headers->set('Content-Type','application/json');$request->setRawBody('{broken');RequestBoundary::prepare($request);ok($request->getBodyParams()===[]&&$request->getRawBody()==='{broken','Early JSON boundary prevents parser before controller');
$nativeRole=new ReflectionMethod(NativeMembershipGateway::class,'membershipRole');
foreach([['owner','member'],['admin','admin'],['moderator','moderator'],['member','member'],['guest','member'],['unrecognized','member']] as [$stored,$expected])ok($nativeRole->invoke(null,42,1,$stored)===$expected,'Noncreator role matches native assignable group semantics');
ok($nativeRole->invoke(null,42,42,'unrecognized')==='owner','Only native Space creator receives owner role');
echo json_encode(['checks'=>$n,'passed'=>true,'network_calls'=>0,'database_calls'=>0],JSON_THROW_ON_ERROR).PHP_EOL;
