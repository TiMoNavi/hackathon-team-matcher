<?php
declare(strict_types=1);require __DIR__.'/bootstrap.php';
use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherRecommendation\contracts\{CurrentEventContext,ProjectionVersions};
use humhub\modules\matcherRecommendation\contracts\analysis\SelectedSelfAttributes;
use humhub\modules\matcherRecommendation\contracts\ports\CurrentEventAccess;
use humhub\modules\matcherRecommendation\adapters\native\ServerActorSessionSource;
use humhub\modules\matcherRecommendation\adapters\analysis\{SqlSelfSelectionStore,SelfAnalysisSelectionSchema};
use humhub\modules\matcherRecommendation\adapters\composition\ReviewedCooperationConfiguration as Config;
use humhub\modules\matcherRecommendation\adapters\profile\{P1CooperationPurposePolicy,P1CooperationProjectionMapper};
use humhub\modules\matcherRecommendation\domain\config\PolicyValidator;
$checks=[];function check(string $name,bool $ok):void{global $checks;$checks[]=['name'=>$name,'passed'=>$ok];}
function rejects(string $name,callable $run):void{try{$run();check($name,false);}catch(Throwable){check($name,true);}}
$ctx=new CurrentEventContext(1,7,'review-access','review-policy');$mapping=Config::mapping();$bindings=Config::bindings();$policy=new P1CooperationPurposePolicy();
$catalog=['schema_version'=>FieldCatalog::VERSION,'fields'=>FieldCatalog::definitions()];$grants=$policy->sourceGrants($catalog);$pv=$policy->projectionPolicyVersion('review-upstream',$mapping,$bindings);
check('actual 37-field catalog matches pinned production fingerprint',count($catalog['fields'])===37&&PolicyValidator::catalogFingerprint($catalog)===Config::CATALOG_FINGERPRINT);
check('cooperation exposes exactly ten explicit source purposes',count($grants)===10);
check('personality and interests grant no cooperation semantic',!array_intersect(['interest','mbti','personality'],array_column($grants,'source_key')));
$bad=$bindings;$bad['offered_skills']='project_technologies';rejects('project technology cannot be rebound to current willingness',fn()=>$policy->assertBindings($mapping,$bad));
$bad=$bindings;$bad['needed_skills']='declared_skills';rejects('capability cannot be rebound as current need',fn()=>$policy->assertBindings($mapping,$bad));
$changed=$catalog;$changed['fields']['project']['value_schema']['properties']['tech_codes']['maxItems']=31;check('same-version changed project schema loses its reviewed grant',!isset($policy->sourceGrants($changed)['project_technologies']));
function attribute(string $id,string $key,array $value,string $visibility='authenticated',string $confirmation='confirmed'):array{return ['attribute_id'=>$id,'key'=>$key,'value'=>$value,'schema_version'=>2,'visibility'=>$visibility,'confirmation'=>$confirmation,'last_confirmed_at'=>'2026-11-12 00:00:00'];}
function project(array $global=[],array $event=[]):mixed{global $ctx,$catalog,$grants,$bindings,$pv;return (new P1CooperationProjectionMapper())->project($ctx,2,['identity_version'=>1,'scopes'=>['global'=>['revision'=>1,'permission_version'=>1,'attributes'=>$global],'space:7'=>['revision'=>1,'permission_version'=>1,'attributes'=>$event]]],$catalog,$grants,$bindings,$pv);}
$p=project([attribute('project-one','project',['title'=>'SYNTHETIC-PROJECT-PROSE','tech_codes'=>['php'],'contribution'=>'SYNTHETIC-CONTRIBUTION','outcome'=>'SYNTHETIC-OUTCOME'])]);
check('project technology only produces capability feature',array_keys($p->features)===['project_skills']&&$p->features['project_skills']['value']===['php']);
check('raw project prose is absent from reduced projection',!str_contains(json_encode($p),'SYNTHETIC-'));
check('project capability preserves exact profile evidence reference',$p->features['project_skills']['evidence'][0]->sourceId==='project-one');
$p=project([], [attribute('seeking-one','event_seeking',['skill_codes'=>['php'],'role_codes'=>['engineering'],'free_text'=>'SYNTHETIC-FREE-TEXT'])]);
check('current need splits reviewed role and skill semantics',$p->features['needed_skills']['value']===['php']&&$p->features['needed_roles']['value']===['engineering']);
check('free-text need is not silently interpreted',!str_contains(json_encode($p),'SYNTHETIC-FREE-TEXT'));
check('empty optional event need stays unknown',project([], [attribute('empty','event_seeking',[])])->features===[]);
rejects('wrong-scope event attribute is rejected',fn()=>project([attribute('wrong','event_seeking',['skill_codes'=>['php']])]));
rejects('private candidate item is rejected',fn()=>project([attribute('private','skill',['code'=>'php','label'=>'PHP'],'private')]));
rejects('unconfirmed candidate item is rejected',fn()=>project([attribute('draft','skill',['code'=>'php','label'=>'PHP'],'authenticated','unconfirmed')]));
rejects('non-purpose personality item is rejected',fn()=>project([attribute('personality','personality',['self_description'=>'not-for-inference'])]));
rejects('timezone and offset mismatch is rejected',fn()=>project([], [attribute('time','event_availability',['starts_at'=>'2026-11-14T09:00:00+08:00','ends_at'=>'2026-11-14T10:00:00+08:00','timezone'=>'UTC'])]));
class ReviewTraceCommand extends yii\db\Command{public static array $sql=[];public function queryAll($fetchMode=null){self::$sql[]=$this->getSql();return parent::queryAll($fetchMode);}}
new yii\console\Application(['id'=>'independent-port-sql','basePath'=>__DIR__,'components'=>['db'=>['class'=>yii\db\Connection::class,'dsn'=>'sqlite::memory:','commandClass'=>ReviewTraceCommand::class],'log'=>['class'=>yii\log\Dispatcher::class,'targets'=>[]]]]);$db=Yii::$app->db;
$db->createCommand('CREATE TABLE matcher_profile_state (id INTEGER PRIMARY KEY,user_id INTEGER,scope_key TEXT,space_id INTEGER,revision INTEGER,permission_version INTEGER,identity_version INTEGER,current_revision_id TEXT)')->execute();
$db->createCommand('CREATE TABLE matcher_profile_attribute (id INTEGER PRIMARY KEY,state_id INTEGER,scope_key TEXT,attribute_id TEXT,field_key TEXT,storage_kind TEXT,native_binding TEXT,value_json TEXT,visibility TEXT,confirmation TEXT,last_confirmed_at TEXT,display_label TEXT,sort_order INTEGER,schema_version INTEGER)')->execute();
foreach(['global','space:7'] as $i=>$scope)$db->createCommand()->insert('matcher_profile_state',['id'=>$i+1,'user_id'=>1,'scope_key'=>$scope,'space_id'=>$i?7:null,'revision'=>1,'permission_version'=>1,'identity_version'=>$i?0:1,'current_revision_id'=>null])->execute();
foreach([['wanted','php','authenticated','confirmed'],['unselected','OTHER-VALUE','authenticated','confirmed'],['private','PRIVATE-VALUE','private','confirmed'],['draft','DRAFT-VALUE','authenticated','unconfirmed']] as [$id,$value,$visibility,$confirmation])$db->createCommand()->insert('matcher_profile_attribute',['state_id'=>1,'scope_key'=>'global','attribute_id'=>$id,'field_key'=>'skill','storage_kind'=>'inline','native_binding'=>null,'value_json'=>json_encode(['code'=>$value,'label'=>'synthetic']),'visibility'=>$visibility,'confirmation'=>$confirmation,'last_confirmed_at'=>'2026-11-12 00:00:00','display_label'=>null,'sort_order'=>0,'schema_version'=>2])->execute();
$access=new humhub\modules\matcherProfile\adapters\memory\InMemoryProfileAccessPolicy();$access->users=[1];$access->memberships=[7=>[1]];
$self=new humhub\modules\matcherProfile\application\SelectedSelfProfileReader($access,new humhub\modules\matcherProfile\application\DiscoveryProfileBatchReader(new humhub\modules\matcherProfile\adapters\persistence\SqlDiscoveryProfileBatchSource($db)));
ReviewTraceCommand::$sql=[];$empty=$self->read(1,7,['skill'],[]);
check('explicit empty selection executes no attribute-value SQL',count(array_filter(ReviewTraceCommand::$sql,fn($s)=>str_contains($s,'matcher_profile_attribute')))===0&&$empty['profiles'][1]['scopes']['global']['attributes']===[]);
ReviewTraceCommand::$sql=[];$one=$self->read(1,7,['skill'],['wanted']);$attributeSql=array_values(array_filter(ReviewTraceCommand::$sql,fn($s)=>str_contains($s,'matcher_profile_attribute')));
check('selected IDs are constrained within actual SQL',count($attributeSql)===1&&str_contains($attributeSql[0],'attribute_id')&&str_contains($attributeSql[0],'WHERE'));
check('selected self projection contains only explicitly selected source',array_column($one['profiles'][1]['scopes']['global']['attributes'],'attribute_id')===['wanted']&&!str_contains(json_encode($one),'OTHER-VALUE'));
check('owner projection omits editor/storage metadata',!str_contains(json_encode($one),'sort_order')&&!str_contains(json_encode($one),'display_label')&&!str_contains(json_encode($one),'storage_kind'));
foreach(['private','draft','absent'] as $id)rejects('explicit unavailable self item rejected: '.$id,fn()=>$self->read(1,7,['skill'],[$id]));
SelfAnalysisSelectionSchema::install($db);
$events=new class($ctx) implements CurrentEventAccess{public int $calls=0;public ?Closure $hook=null;public function __construct(public CurrentEventContext $ctx){}public function resolve(int $v,?int $s=null):CurrentEventContext{return $this->ctx;}public function assertCurrent(CurrentEventContext $ctx):void{$this->calls++;if($this->hook)($this->hook)($this->calls);if($ctx!=$this->ctx)throw new RuntimeException();}};
$identity=new class implements ServerActorSessionSource{public int $actor=1;public function read():array{return ['actor_id'=>$this->actor,'session_hash'=>str_repeat('a',64)];}};
$store=new SqlSelfSelectionStore($db,$events,$identity);$versions=new ProjectionVersions(['global'=>['revision'=>1,'permission_version'=>1],'space:7'=>['revision'=>1,'permission_version'=>1]],2,'review-upstream',1);
$selection=fn(int $v,string $name)=>new SelectedSelfAttributes(1,7,$name,$v,$versions,[]);
$events->hook=static function(int $n):void{if($n===4)throw new RuntimeException('synthetic-postcheck-failure');};rejects('post-write authorization failure aborts successful receipt',fn()=>$store->replace($ctx,0,$selection(1,'first')));$events->hook=null;
$tombstone=$store->state($ctx);check('failed write retains version tombstone and no authority',$tombstone['version']===1&&$tombstone['selection']===null&&$db->createCommand('SELECT selection_json FROM matcher_recommendation_self_selection')->queryScalar()==='null');
rejects('tombstone cannot reset to stale expected zero',fn()=>$store->replace($ctx,0,$selection(1,'stale')));
$store->replace($ctx,1,$selection(2,'second'));check('explicit recovery continues monotonically after tombstone',$store->state($ctx)['version']===2);
$events->calls=0;$events->hook=function(int $n)use($db):void{if($n===3)$db->createCommand()->update('matcher_recommendation_self_selection',['selection_version'=>3,'selection_json'=>'null'])->execute();};rejects('concurrent newer version wins conditional update',fn()=>$store->replace($ctx,2,$selection(3,'loser')));$events->hook=null;check('losing stale write does not overwrite newer tombstone',$store->state($ctx)['version']===3&&$store->state($ctx)['selection']===null);
$identity->actor=2;rejects('different actor cannot read prior owner selection',fn()=>$store->state($ctx));$identity->actor=1;
$transaction=$db->beginTransaction();rejects('selection read refuses ambient transaction snapshot',fn()=>$store->state($ctx));$transaction->rollBack();
echo json_encode(['status'=>in_array(false,array_column($checks,'passed'),true)?'failed':'passed','checks'=>count($checks),'checks_detail'=>$checks,'database'=>'private in-memory SQLite','network_calls'=>0,'model_calls'=>0],JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT),PHP_EOL;
