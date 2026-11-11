<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
$protected = dirname(__DIR__, 3);
require $protected . '/vendor/autoload.php'; require $protected . '/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $protected . '/humhub');
Yii::setAlias('@humhub/modules/matcherRecommendation', $protected . '/modules/matcher-recommendation');
use humhub\modules\matcherIdeas\adapters\native\{NativeCurrentSpaceFactory, NativeCurrentSpaceAccess, NativeIdeaRelations};
use humhub\modules\matcherIdeas\adapters\persistence\{IdeaSchema, SqlIdeaRepository};
use humhub\modules\matcherIdeas\application\{IdeaService, IdeaRelationSource};
use humhub\modules\matcherIdeas\domain\ports\CurrentSpaceAccess;
use humhub\modules\matcherRecommendation\adapters\native\{ServerActorSessionSource, SqlCurrentEventSelectionStore, NativeCurrentEventAccess, NativeAccessException, CurrentEventSelectionSchema};
use yii\db\Connection;

// File-backed synthetic SQLite allows two genuinely independent PDO connections. No .env or production app.
$path = tempnam(sys_get_temp_dir(), 'matcher-ideas-s72-');
$db = new Connection(['dsn'=>'sqlite:'.$path,'enableLogging'=>false,'enableProfiling'=>false,'enableSchemaCache'=>false,'schemaCache'=>null]);
try {
    $db->open(); IdeaSchema::install($db); CurrentEventSelectionSchema::install($db);
    foreach ([
        'user'=>['id'=>'integer PRIMARY KEY','status'=>'integer','contentcontainer_id'=>'integer','visibility'=>'integer','updated_at'=>'text'],
        'space'=>['id'=>'integer PRIMARY KEY','status'=>'integer','contentcontainer_id'=>'integer','visibility'=>'integer','join_policy'=>'integer','updated_at'=>'text'],
        'space_membership'=>['id'=>'integer PRIMARY KEY','space_id'=>'integer','user_id'=>'integer','status'=>'integer','group_id'=>'text','created_at'=>'text','updated_at'=>'text'],
        'contentcontainer_blocked_users'=>['contentcontainer_id'=>'integer','user_id'=>'integer'],
        'message'=>['id'=>'integer PRIMARY KEY','created_by'=>'integer','title'=>'text'],
        'user_message'=>['message_id'=>'integer','user_id'=>'integer'],
    ] as $table=>$columns) { $db->createCommand()->createTable($table,$columns)->execute(); }
    $db->createCommand()->batchInsert('user',['id','status','contentcontainer_id','visibility','updated_at'],[[1,1,101,1,'2026-11-12'],[2,1,102,1,'2026-11-12']])->execute();
    $db->createCommand()->batchInsert('space',['id','status','contentcontainer_id','visibility','join_policy','updated_at'],[[10,1,210,1,0,'2026-11-12'],[20,1,220,1,0,'2026-11-12']])->execute();
    $db->createCommand()->batchInsert('space_membership',['id','space_id','user_id','status','group_id','created_at','updated_at'],[[1,10,1,3,'member','2026-11-12','2026-11-12'],[2,10,2,3,'member','2026-11-12','2026-11-12'],[3,20,1,3,'member','2026-11-12','2026-11-12']])->execute();
    $db->createCommand()->insert('message',['id'=>100,'created_by'=>1,'title'=>'Private native title'])->execute();
    $db->createCommand()->batchInsert('user_message',['message_id','user_id'],[[100,1],[100,2]])->execute();
    $identity = new class implements ServerActorSessionSource { public function read(): array { return ['actor_id'=>1,'session_hash'=>str_repeat('a',64)]; } };
    $key=$identity->read();
    $db->createCommand()->insert(CurrentEventSelectionSchema::TABLE,$key+['space_id'=>10,'selection_revision'=>'selection-'.str_repeat('b',32)])->execute();
    $same = new NativeCurrentEventAccess($db,new SqlCurrentEventSelectionStore($db,$identity,'ordinary-activity-access-v1'),'ordinary-activity-access-v1');
    $transaction=$db->beginTransaction();
    try { $same->resolve(1,10); check(false,'same-connection native authorizer should reject'); }
    catch(NativeAccessException $error) { check($error->reason==='authorization_transaction_unsupported','existing S7 authorization guard remains intact'); }
    finally { $transaction->rollBack(); }
    $events=NativeCurrentSpaceFactory::create($db,$identity);
    $transaction=$db->beginTransaction();
    check($events->resolve(1,10)->spaceId===10,'independent current-event authorization works inside owner transaction');
    check($db->getTransaction()?->isActive===true,'authorization does not commit another owner transaction');
    $transaction->rollBack();
    $repo=new SqlIdeaRepository($db);$native=new NativeIdeaRelations($db);$spaces=new NativeCurrentSpaceAccess($events);
    $ideas=new IdeaService($repo,$native,$spaces);$source=new IdeaRelationSource($repo,$native,$spaces);
    $idea=$ideas->create(1,'Native selection idea','Explicit metadata');
    $activity=$ideas->associateSpace(1,$idea['id'],1,10);
    check($activity['space_id']===10,'real current-event adapter supports Space publish transaction');
    $activity=$ideas->bindConversation(1,$activity['id'],1,100);
    check($activity['message_id']===100,'real current-event adapter supports binding transaction');
    $activity=$ideas->setMemberVisibility(1,$activity['id'],2,true);
    check($activity['version']===3,'real current-event adapter supports publication update transaction');
    check(count($source->readCandidates(1,2,10))===1,'real current-event adapter supports relation read transaction');
    check($source->detail(1,$idea['id'],$activity['id'],10)['conversation_available']===true,'real current-event adapter supports detail read transaction');
    $changed=new class($spaces) implements CurrentSpaceAccess {
        public int $reads=0;
        public function __construct(private CurrentSpaceAccess $inner) {}
        public function stamp(int $viewerId,int $requestedSpaceId): string { $stamp=$this->inner->stamp($viewerId,$requestedSpaceId); return $stamp.(++$this->reads>=3?':changed':''); }
    };
    $changing=new IdeaService($repo,$native,$changed);
    rejects(fn()=>$changing->setMemberVisibility(1,$activity['id'],3,false),'CURRENT_EVENT_CHANGED');
    check($repo->activity($activity['id'])['version']===3 && $repo->activity($activity['id'])['members_visible']===true,'post-lock context change rolls back mutation and CAS version');
    $db->createCommand()->update(CurrentEventSelectionSchema::TABLE,['space_id'=>20,'selection_revision'=>'selection-'.str_repeat('c',32)],$key)->execute();
    try{$ideas->setMemberVisibility(1,$activity['id'],3,false);check(false,'wrong current event must fail');}
    catch(NativeAccessException $error){check($error->reason==='current_event_mismatch','actual selection switch invalidates old activity write');}
    check($repo->activity($activity['id'])['version']===3,'current-event mismatch keeps existing version intact');
    $memory=new Connection(['dsn'=>'sqlite::memory:']);
    rejects(fn()=>NativeCurrentSpaceFactory::create($memory,$identity),'IDEA_AUTHORIZATION_UNAVAILABLE');
    echo json_encode(['suite'=>'matcher-ideas-native-current','checks'=>count($checks),'passed'=>true,'production_db_access'=>false,'llm_calls'=>0],JSON_PRETTY_PRINT).PHP_EOL;
} finally { $db->close(); if(is_file($path)){unlink($path);} }
