<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
$protected = dirname(__DIR__, 3);
require $protected . '/vendor/autoload.php';
require $protected . '/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $protected . '/humhub');

use humhub\modules\matcherIdeas\adapters\memory\InMemoryCurrentSpaceAccess;
use humhub\modules\matcherIdeas\adapters\native\NativeIdeaRelations;
use humhub\modules\matcherIdeas\adapters\persistence\{IdeaSchema, SqlIdeaRepository};
use humhub\modules\matcherIdeas\application\{IdeaService, IdeaDraftService, IdeaRelationSource};
use yii\db\{Connection, Query, IntegrityException};

// Isolated in-memory SQL connection. Deliberate prefix also checks native adapter table handling.
$db = new Connection(['dsn' => 'sqlite::memory:', 'tablePrefix' => 's72_', 'enableLogging' => false, 'enableProfiling' => false, 'enableSchemaCache' => false, 'schemaCache' => null]);
$db->open();
IdeaSchema::install($db); IdeaSchema::install($db);
check(count($db->schema->getTableNames()) === 4, 'idempotent installation creates exactly four own tables');
foreach ([
    '{{%user}}' => ['id' => 'integer PRIMARY KEY', 'status' => 'integer NOT NULL', 'contentcontainer_id' => 'integer NOT NULL'],
    '{{%space}}' => ['id' => 'integer PRIMARY KEY', 'status' => 'integer NOT NULL', 'contentcontainer_id' => 'integer NOT NULL'],
    '{{%space_membership}}' => ['id' => 'integer PRIMARY KEY', 'space_id' => 'integer NOT NULL', 'user_id' => 'integer NOT NULL', 'status' => 'integer NOT NULL'],
    '{{%contentcontainer_blocked_users}}' => ['contentcontainer_id' => 'integer NOT NULL', 'user_id' => 'integer NOT NULL'],
    '{{%message}}' => ['id' => 'integer PRIMARY KEY', 'created_by' => 'integer NOT NULL', 'title' => 'text'],
    '{{%user_message}}' => ['message_id' => 'integer NOT NULL', 'user_id' => 'integer NOT NULL'],
] as $table => $columns) { $db->createCommand()->createTable($table, $columns)->execute(); }
for ($i = 1; $i <= 5; ++$i) { $db->createCommand()->insert('{{%user}}', ['id' => $i, 'status' => 1, 'contentcontainer_id' => 100 + $i])->execute(); }
$db->createCommand()->batchInsert('{{%space}}', ['id','status','contentcontainer_id'], [[10,1,210],[20,1,220]])->execute();
$db->createCommand()->batchInsert('{{%space_membership}}', ['id','space_id','user_id','status'], [[1,10,1,3],[2,10,2,3],[3,10,3,3],[4,20,1,3],[5,20,2,3],[6,20,4,3],[7,10,5,2]])->execute();
$db->createCommand()->batchInsert('{{%message}}', ['id','created_by','title'], [[100,1,'PRIVATE CHAT TITLE'],[101,1,'FOREIGN SPACE CHAT']])->execute();
$db->createCommand()->batchInsert('{{%user_message}}', ['message_id','user_id'], [[100,1],[100,2],[101,1],[101,4]])->execute();
$nativeTables = ['user','space','space_membership','contentcontainer_blocked_users','message','user_message'];
$snapshot = static function () use ($db, $nativeTables): string {
    $rows = []; foreach ($nativeTables as $table) { $rows[$table] = (new Query())->from('{{%' . $table . '}}')->all($db); }
    return hash('sha256', json_encode($rows, JSON_THROW_ON_ERROR));
};
$beforeNative = $snapshot();
$repo = new SqlIdeaRepository($db); $native = new NativeIdeaRelations($db);
$spaces = new InMemoryCurrentSpaceAccess(); $spaces->selected = [1=>10,2=>10,3=>10,4=>20,5=>10];
$ideas = new IdeaService($repo, $native, $spaces); $drafts = new IdeaDraftService($repo, $native); $source = new IdeaRelationSource($repo, $native, $spaces);
check($native->isActive(1) && !$native->isActive(0), 'native adapter uses active actual accounts');
check(!$native->isSpaceMember(5,10), 'pending Space membership is not formal membership');
$draft = $drafts->start(1, null, ['title'=>'正式标题','summary'=>'明确确认的简介'], 'PRIVATE RAW SOURCE');
$draft = $drafts->update(1, $draft['id'], 1, ['summary'=>'数据库正式简介']);
check($repo->draft($draft['id'])['fields']['summary'] === '数据库正式简介' && $draft['version'] === 2, 'draft UTF-8 fields round trip via SQLite');
$confirmation = $drafts->confirm(1,$draft['id'],2); $ideaId = $confirmation['idea_id'];
check($repo->draft($draft['id'])['status'] === 'confirmed' && $repo->idea($ideaId)['title'] === '正式标题', 'confirm persists both draft receipt and formal content');
rejects(fn() => $drafts->confirm(1,$draft['id'],2), 'IDEA_VERSION_CONFLICT');
$baseA=$drafts->start(1,$ideaId);$baseB=$drafts->start(1,$ideaId);
$drafts->confirm(1,$baseA['id'],1,['summary'=>'新确认版本']);
rejects(fn() => $drafts->confirm(1,$baseB['id'],1,['summary'=>'STALE']), 'IDEA_VERSION_CONFLICT');
check($repo->draft($baseB['id'])['status']==='editing' && $repo->idea($ideaId)['summary']==='新确认版本', 'stale base rolls back transaction without overwriting newer idea');
$activity=$ideas->associateSpace(1,$ideaId,2,10);$activityId=$activity['id'];
check($activity['version']===1 && $activity['members_visible']===false && $activity['status']==='published', 'activity booleans and integer versions normalized');
rejects(fn() => $ideas->associateSpace(1,$ideaId,2,10), 'IDEA_ACTIVITY_EXISTS');
try{$db->createCommand()->insert(IdeaSchema::ACTIVITY,['idea_id'=>$ideaId,'space_id'=>10])->execute();check(false,'duplicate activity should fail');}
catch(IntegrityException){check(true,'SQL unique idea+Space enforced');}
rejects(fn() => $ideas->bindConversation(1,$activityId,1,101), 'IDEA_SPACE_DENIED');
check((new Query())->from(IdeaSchema::BINDING)->count('*',$db)==0, 'failed cross-Space binding is atomic');
$activity=$ideas->bindConversation(1,$activityId,1,100);
check($activity['message_id']===100 && $activity['version']===2, 'permanent binding persists separately');
check($source->readCandidates(3,2,10)===[], 'SQL default member display suppresses source');
$activity=$ideas->setMemberVisibility(1,$activityId,2,true);
$items=$source->readCandidates(3,2,10);
check(count($items)===1 && $items[0]['summary']==='新确认版本' && $items[0]['version']==='2:3', 'joined source gives formal content and composite version');
check($items[0]['conversation_available']===false && !isset($items[0]['message_id']), 'nonparticipant gets metadata without message id');
check(!str_contains(json_encode($items),'PRIVATE'), 'no raw draft or native title enters metadata');
check($source->detail(2,$ideaId,$activityId,10)['conversation_available']===true, 'native participant detail reports availability');
$activity=$ideas->updatePublication(1,$activityId,3,null,'archived');
check($source->readCandidates(3,2,10)===[], 'SQL archived Space publication absent immediately');
rejects(fn()=>$source->detail(3,$ideaId,$activityId,10),'IDEA_NOT_FOUND');
$activity=$ideas->updatePublication(1,$activityId,4,null,'published');
$spaces->selected[1]=20;$other=$ideas->associateSpace(1,$ideaId,2,20);
rejects(fn()=>$ideas->bindConversation(1,$other['id'],1,100),'IDEA_CONVERSATION_ALREADY_BOUND');
try{$db->createCommand()->insert(IdeaSchema::BINDING,['activity_id'=>$other['id'],'message_id'=>100])->execute();check(false,'duplicate message should fail');}
catch(IntegrityException){check(true,'SQL message id unique across every Space and idea');}
$spaces->selected[1]=10;
check($snapshot()===$beforeNative, 'all idea write use cases preserve every native table byte-for-byte');
// Failure after inserting a binding must roll back the binding and activity version together.
$faultIdea=$ideas->create(1,'Atomic bind fixture','Synthetic rollback case');
$faultActivity=$ideas->associateSpace(1,$faultIdea['id'],1,10);
$db->createCommand()->insert('{{%message}}',['id'=>104,'created_by'=>1,'title'=>'Synthetic fault conversation'])->execute();
$db->createCommand()->batchInsert('{{%user_message}}',['message_id','user_id'],[[104,1],[104,2]])->execute();
$db->pdo->exec('CREATE TRIGGER s72_binding_fault BEFORE UPDATE ON s72_matcher_idea_activity WHEN NEW.id = '.(int)$faultActivity['id']." BEGIN SELECT RAISE(ABORT, 'synthetic binding update failure'); END");
try{$ideas->bindConversation(1,$faultActivity['id'],1,104);check(false,'synthetic binding fault must abort');}
catch(yii\db\Exception){check(true,'injected SQL failure reaches after binding insertion');}
check($repo->bindingForMessage(104)===null && $repo->activity($faultActivity['id'])['version']===1,'SQL rollback removes binding and restores version');
$db->createCommand('DROP TRIGGER s72_binding_fault')->execute();
check($ideas->bindConversation(1,$faultActivity['id'],1,104)['message_id']===104,'explicit retry after transaction rollback succeeds');

// Synthetic fixture mutations below imitate native membership/permission changes.
$db->createCommand()->insert('{{%user_message}}',['message_id'=>100,'user_id'=>4])->execute();
check($source->readCandidates(3,2,10)===[], 'new outsider native participant revokes source');
$db->createCommand()->delete('{{%user_message}}',['message_id'=>100,'user_id'=>4])->execute();
$db->createCommand()->update('{{%user}}',['status'=>0],['id'=>1])->execute();
check($source->readCandidates(3,2,10)===[], 'disabled author invalidates object');
$db->createCommand()->update('{{%user}}',['status'=>1],['id'=>1])->execute();
$db->createCommand()->update('{{%space_membership}}',['status'=>2],['space_id'=>10,'user_id'=>2])->execute();
rejects(fn()=>$source->readCandidates(3,2,10),'IDEA_RELATIONS_DENIED');
$db->createCommand()->update('{{%space_membership}}',['status'=>3],['space_id'=>10,'user_id'=>2])->execute();
$db->createCommand()->insert('{{%contentcontainer_blocked_users}}',['contentcontainer_id'=>102,'user_id'=>3])->execute();
rejects(fn()=>$source->readCandidates(3,2,10),'IDEA_RELATIONS_DENIED');
$db->createCommand()->delete('{{%contentcontainer_blocked_users}}',['contentcontainer_id'=>102])->execute();
$db->createCommand()->insert('{{%contentcontainer_blocked_users}}',['contentcontainer_id'=>210,'user_id'=>2])->execute();
rejects(fn()=>$source->readCandidates(3,2,10),'IDEA_RELATIONS_DENIED');
$db->createCommand()->delete('{{%contentcontainer_blocked_users}}',['contentcontainer_id'=>210])->execute();
$db->createCommand()->update('{{%message}}',['created_by'=>2],['id'=>100])->execute();
check($source->readCandidates(3,2,10)===[], 'SQL native originator is revalidated');
$db->createCommand()->update('{{%message}}',['created_by'=>1],['id'=>100])->execute();
$db->createCommand()->delete('{{%user_message}}',['message_id'=>100,'user_id'=>1])->execute();
check($source->readCandidates(3,2,10)===[], 'creator departure revokes native source');
$db->createCommand()->insert('{{%user_message}}',['message_id'=>100,'user_id'=>1])->execute();
$db->createCommand()->delete('{{%message}}',['id'=>100])->execute();
check($source->readCandidates(3,2,10)===[], 'deleted message cannot leave a readable stale relation');
check($repo->bindingForMessage(100)!==null, 'deleted native message retains permanent binding tombstone');
$db->createCommand()->update('{{%space}}',['status'=>0],['id'=>10])->execute();
rejects(fn()=>$source->readCandidates(3,2,10),'IDEA_RELATIONS_DENIED');
$db->close();
echo json_encode(['suite'=>'matcher-ideas-sqlite','checks'=>count($checks),'passed'=>true,'production_db_access'=>false,'llm_calls'=>0], JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE).PHP_EOL;
