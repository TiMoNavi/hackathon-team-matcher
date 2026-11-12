<?php
declare(strict_types=1);require __DIR__.'/bootstrap.php';
use humhub\modules\matcherRecommendation\adapters\native\{NativeCurrentEventAccess,ServerSelectionSource};
use humhub\modules\matcherRecommendation\contracts\{CurrentEventContext};
use humhub\modules\matcherRecommendation\contracts\ports\{OrdinaryDiscoverySource,OrdinaryCursorCodec,Clock};
use humhub\modules\matcherRecommendation\application\BrowsePeople;
use humhub\modules\user\models\User;
// Synthetic actor fixture ONLY. This file is served exclusively from the private test directory.
final class ReviewHttpUser extends yii\web\User{
 public function getIdentity($autoRenew=true){$id=(int)($_SERVER['HTTP_X_REVIEW_ACTOR']??0);if($id<1)return null;$row=Yii::$app->db->createCommand('SELECT id,status FROM user WHERE id=:id',[':id'=>$id])->queryOne();if(!$row)return null;$u=(new ReflectionClass(User::class))->newInstanceWithoutConstructor();foreach($row as $k=>$v)$u->setAttribute($k,$v);return $u;}
 public function getIsGuest(){return $this->getIdentity()===null;}
 public function getId(){return $this->getIdentity()?->id;}
}
final class ReviewSelectedActivity implements ServerSelectionSource{
 public function read():array{$id=(int)Yii::$app->user->id;$r=Yii::$app->db->createCommand('SELECT * FROM review_current WHERE actor_id=:id',[':id'=>$id])->queryOne();if(!$r)throw new humhub\modules\matcherRecommendation\adapters\native\NativeAccessException('current_event_required');return ['actor_id'=>$id,'space_id'=>(int)$r['space_id'],'selection_revision'=>$r['revision']];}
}
final class ReviewEnabledModule extends yii\base\Module{public bool $isEnabled=true;}
final class ReviewOrdinarySource implements OrdinaryDiscoverySource{
 public function readCurrent(CurrentEventContext $ctx):array{
  $batch=Yii::$app->getModule('matcher-profile-privacy')->getDiscoveryBatchService()->read($ctx->viewerId,$ctx->spaceId,[1,2,3],['direction','skill','event_seeking','event_contribution','event_role']);$out=[];
  foreach($batch['profiles'] as $id=>$p){if(Yii::$app->db->createCommand('SELECT value FROM review_flags WHERE name=:n',[':n'=>'candidate-hidden-'.$id])->queryScalar()==='1')continue;$out[$id]=['owner_id'=>$id,'space_id'=>$ctx->spaceId,'global'=>$p['scopes']['global'],'space'=>$p['scopes']['space:'.$ctx->spaceId],'identity_version'=>$p['identity_version'],'discovery_version'=>1,'privacy_policy_version'=>$batch['policy_version']];}
  return $out;
 }
}
$rules=[];foreach(['matcher-auth','matcher-recommendation'] as $dir){$config=require $root.'/backend/protected/modules/'.$dir.'/config.php';$rules=array_merge($rules,$config['urlManagerRules']);}
$app=new yii\web\Application(['id'=>'independent-http-review','basePath'=>__DIR__,'runtimePath'=>__DIR__.'/runtime','components'=>[
 'db'=>['class'=>yii\db\Connection::class,'dsn'=>'sqlite:'.__DIR__.'/review.sqlite'],
 'request'=>['class'=>yii\web\Request::class,'cookieValidationKey'=>'synthetic-isolation-test-cookie-key','scriptUrl'=>'/index.php','scriptFile'=>__FILE__,'baseUrl'=>'','parsers'=>['application/json'=>yii\web\JsonParser::class]],
 'response'=>['class'=>yii\web\Response::class,'format'=>yii\web\Response::FORMAT_JSON],
 'user'=>['class'=>ReviewHttpUser::class,'identityClass'=>User::class,'enableSession'=>false],
 'session'=>['class'=>yii\web\Session::class,'name'=>'REVIEWSESSID','savePath'=>__DIR__.'/sessions','cookieParams'=>['httpOnly'=>true,'sameSite'=>'Lax']],
 'urlManager'=>['class'=>yii\web\UrlManager::class,'enablePrettyUrl'=>true,'showScriptName'=>false,'enableStrictParsing'=>true,'rules'=>$rules],
 'runtimeCache'=>['class'=>yii\caching\ArrayCache::class],
 'log'=>['class'=>yii\log\Dispatcher::class,'targets'=>[]],
 'errorHandler'=>['class'=>yii\web\ErrorHandler::class],
],'modules'=>[
 'matcher-auth'=>['class'=>humhub\modules\matcherAuth\Module::class],
 'matcher-recommendation'=>['class'=>humhub\modules\matcherRecommendation\Module::class],
 'matcher-user-profile'=>['class'=>humhub\modules\matcherProfile\Module::class],
 'matcher-profile-privacy'=>['class'=>humhub\modules\matcherPrivacy\Module::class],
 'matcher-github-import'=>['class'=>ReviewEnabledModule::class],'auth-github'=>['class'=>ReviewEnabledModule::class],
]]);
$app->runtimeCache->set(humhub\components\Module::CACHE_KEY_IS_ENABLED,array_fill_keys(['matcher-auth','matcher-recommendation','matcher-user-profile','matcher-profile-privacy'],true));
if(!$app->user->isGuest&&($_SERVER['HTTP_X_REVIEW_EXPIRED']??'')!=='1')$app->session->open();
$rec=$app->getModule('matcher-recommendation');$events=$rec->getCurrentEventAccess();
$browse=new BrowsePeople($events,new ReviewOrdinarySource(),new class implements OrdinaryCursorCodec{public function encode(array $payload):string{return json_encode($payload);}public function decode(string $token):array{return json_decode($token,true);}},new class implements Clock{public function now():DateTimeImmutable{return new DateTimeImmutable('2026-11-12T00:00:00Z');}});
(new ReflectionProperty($rec,'ordinaryDiscovery'))->setValue($rec,$browse);
if(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)==='/__review/bootstrap'){
 try{$sel=$rec->getCurrentEventSelectionStore()->read();}catch(humhub\modules\matcherRecommendation\adapters\native\NativeAccessException $e){if($e->reason!=='current_event_required')throw $e;$rec->getCurrentEventSelectionStore()->select(7,null);$sel=$rec->getCurrentEventSelectionStore()->read();}
 $space=$sel['space_id'];$ctx=$events->resolve((int)$app->user->id,$space);
 $app->response->data=['csrf'=>$app->request->getCsrfToken(),'expected_current_event'=>['selection_revision'=>$sel['selection_revision'],'access_version'=>$ctx->accessVersion],'expected_candidate'=>['global'=>['revision'=>1,'permission_version'=>1],'space'=>['revision'=>1,'permission_version'=>1],'identity_version'=>1,'discovery_version'=>1,'privacy_policy_version'=>humhub\modules\matcherPrivacy\application\DiscoveryBatchService::POLICY_VERSION]];$app->response->send();exit;
}
$app->run();
