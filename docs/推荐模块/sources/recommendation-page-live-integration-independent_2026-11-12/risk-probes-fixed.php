<?php
declare(strict_types=1);
$root=getenv('MATCHER_REVIEW_ROOT')?:'/Users/550m/code/hackathon-team-matcher';
require $root.'/backend/protected/vendor/autoload.php';require $root.'/backend/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub',$root.'/backend/protected/humhub');
foreach(['matcherAuth'=>'matcher-auth','matcherRecommendation'=>'matcher-recommendation','matcherProfile'=>'matcher-user-profile','matcherPrivacy'=>'matcher-profile-privacy'] as $ns=>$dir)Yii::setAlias('@humhub/modules/'.$ns,$root.'/backend/protected/modules/'.$dir);
use humhub\modules\matcherRecommendation\contracts\{CurrentEventContext,ProjectionVersions,CandidateProjection,EvidenceRef};
use humhub\modules\matcherRecommendation\contracts\ports\{CurrentEventAccess,SelfAnalysisProfileReader};
use humhub\modules\matcherRecommendation\contracts\analysis\SelectedSelfAttributes;
use humhub\modules\matcherRecommendation\adapters\analysis\{SqlSelfSelectionStore,SelfAnalysisSelectionSchema};
use humhub\modules\matcherRecommendation\adapters\native\ServerActorSessionSource;
use humhub\modules\matcherRecommendation\application\analysis\ManageSelfAnalysisSelection;
class ReviewUser extends yii\base\Component {public bool $isGuest=false;public int $id=1;}
class ReviewModule extends yii\base\Module {public bool $isEnabled=true; public mixed $service=null;public function getSourceService():mixed{return $this->service;}}
new yii\console\Application(['id'=>'independent-risk-probes','basePath'=>__DIR__,'components'=>['db'=>['class'=>yii\db\Connection::class,'dsn'=>'sqlite::memory:'],'user'=>ReviewUser::class,'log'=>['class'=>yii\log\Dispatcher::class,'targets'=>[]]]]);
$db=Yii::$app->db;
$db->createCommand('CREATE TABLE matcher_auth_import (owner_id INTEGER,provider_subject TEXT,state TEXT,source_id TEXT)')->execute();
$db->createCommand('CREATE TABLE user_auth (id INTEGER PRIMARY KEY,user_id INTEGER,source TEXT,source_id TEXT)')->execute();
$id='11111111-1111-1111-1111-111111111111';
$db->createCommand()->insert('matcher_auth_import',['owner_id'=>1,'provider_subject'=>'101','state'=>'succeeded','source_id'=>$id])->execute();
$db->createCommand()->insert('user_auth',['user_id'=>1,'source'=>'github','source_id'=>'101'])->execute();
$profile=new ReviewModule('matcher-user-profile');$profile->service=new class($db){public function __construct(private $db){}public function getProgress(int $owner,string $id):array{$this->db->createCommand()->delete('user_auth',['user_id'=>$owner])->execute();return ['kind'=>'github','status'=>'ready','progress'=>['state'=>'ready']];}};
Yii::$app->setModule('matcher-user-profile',$profile);foreach(['matcher-github-import','auth-github'] as $name)Yii::$app->setModule($name,new ReviewModule($name));
$status=(new humhub\modules\matcherAuth\adapters\native\GithubImportStatusReader())->read(1);
$results=[['name'=>'unlink_during_source_progress','expected'=>'revoked_without_source_reference','actual'=>$status,'binding_rows_after'=>$db->createCommand('SELECT COUNT(*) FROM user_auth')->queryScalar(),'passed'=>$status===['state'=>'revoked','source_id'=>null]]];
SelfAnalysisSelectionSchema::install($db);
$events=new class implements CurrentEventAccess {public CurrentEventContext $ctx;public function __construct(){$this->ctx=new CurrentEventContext(1,7,'A-before','p');}public function resolve(int $viewerId,?int $spaceId=null):CurrentEventContext{if($viewerId!==1||$spaceId!==7)throw new RuntimeException();return $this->ctx;}public function assertCurrent(CurrentEventContext $ctx):void{if($ctx!=$this->ctx)throw new RuntimeException();}};
$identity=new class implements ServerActorSessionSource {public function read():array{return ['actor_id'=>1,'session_hash'=>str_repeat('a',64)];}};
$profiles=new class implements SelfAnalysisProfileReader {public function read(CurrentEventContext $ctx,array $ids):CandidateProjection{$v=new ProjectionVersions(['global'=>['revision'=>1,'permission_version'=>1],'space:7'=>['revision'=>1,'permission_version'=>1]],2,'reviewed',1);$features=[];foreach($ids as $id){$features[$id]=['value'=>[$id],'evidence'=>[new EvidenceRef('person','1','profile_attribute',$id,'global',1,1)]];}return new CandidateProjection('person','1',7,$v,$features);}public function options(CurrentEventContext $ctx):array{return ['projection'=>$this->read($ctx,[]),'options'=>[]];}};
$store=new SqlSelfSelectionStore($db,$events,$identity);$manager=new ManageSelfAnalysisSelection($events,$store,$profiles);
$old=$manager->replace(1,7,['older-approved'],0);
$events->ctx=new CurrentEventContext(1,7,'A-after-switch-return','p');

$rejectedZero=false;try{$manager->replace(1,7,[],0);}catch(Throwable){$rejectedZero=true;}
$retained=$store->state($events->ctx)['version'];$new=$manager->replace(1,7,[],$retained);
$accepted=false;try{$late=$manager->replace(1,7,['older-approved'],$old->selectionVersion);$accepted=true;}catch(Throwable $e){}
$results[]=['name'=>'stale_zero_cannot_reset_after_context_switch','passed'=>$rejectedZero];
$results[]=['name'=>'context_switch_retains_monotonic_selection_version','passed'=>$retained===$old->selectionVersion&&$new->selectionVersion===$old->selectionVersion+1];
$results[]=['name'=>'stale_selection_write_after_activity_context_version_reuse','expected'=>'reject_old_context_version','late_request_accepted'=>$accepted,'stored_references'=>array_map(fn($r)=>$r->sourceId,$store->read($events->ctx)->references),'passed'=>!$accepted&&$store->read($events->ctx)->references===[]];
$before=$events->ctx;$events->ctx=new CurrentEventContext(1,7,'A-third-context','p');$rejected=false;try{$manager->replace(1,7,['older-approved'],$new->selectionVersion,$before);}catch(Throwable){$rejected=true;}
$results[]=['name'=>'manager_expected_context_rejects_late_write_before_mutation','passed'=>$rejected&&$store->state($events->ctx)['version']===$new->selectionVersion];
echo json_encode(['checks'=>$results,'database'=>'private sqlite memory','network_calls'=>0,'model_calls'=>0],JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT),PHP_EOL;
