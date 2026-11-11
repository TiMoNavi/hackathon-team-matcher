<?php
declare(strict_types=1);
/**
 * Local synthetic examples only. No reset/delete, migration, credential output, model call,
 * profile-content write, native notification event or message_entry insertion.
 * Usage: php profile_s72_examples.php seed|inspect TARGET [preview confirmation flags].
 * A library-only constant permits pure CLI/manifest checks without any bootstrap or DB.
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

final class S72ExamplesFailure extends RuntimeException {}
function s72ExamplesAssert(bool $condition, string $reason): void
{ if (!$condition) { throw new S72ExamplesFailure($reason); } }

function s72ExamplesOptions(array $argv): array
{
    $action = $argv[1] ?? ''; $target = $argv[2] ?? '';
    s72ExamplesAssert(in_array($action, ['seed', 'inspect'], true), 'Use seed|inspect with an explicit target.');
    s72ExamplesAssert(in_array($target, ['humhub_profile_s72_test_root_23fd1b71', 'humhub_preview'], true), 'The target is outside the two authorized databases.');
    $options = ['action' => $action, 'target' => $target];
    foreach (array_slice($argv, 3) as $argument) {
        s72ExamplesAssert(is_string($argument) && preg_match('/^--(confirm-preview|backup-marker)=(.+)$/D', $argument, $match) === 1, 'Only explicit preview confirmation options are accepted.');
        s72ExamplesAssert(!array_key_exists($match[1], $options), 'Duplicate option.'); $options[$match[1]] = $match[2];
    }
    if ($action === 'seed' && $target === 'humhub_preview') {
        s72ExamplesAssert(($options['confirm-preview'] ?? null) === 'seed-s72-examples' && isset($options['backup-marker']), 'Preview seed requires --confirm-preview=seed-s72-examples and --backup-marker=.../manifest.json.');
    } elseif (count($options) !== 2) { throw new S72ExamplesFailure('Preview confirmation options are only valid for preview seed.'); }
    return $options;
}

function s72ExamplesVerifyBackup(string $backend, array $options): bool
{
    if ($options['action'] !== 'seed' || $options['target'] !== 'humhub_preview') { return false; }
    $root = realpath($backend . '/.runtime/backups'); $marker = realpath($options['backup-marker']);
    s72ExamplesAssert($root !== false && $marker !== false && str_starts_with($marker, $root . '/') && basename($marker) === 'manifest.json', 'The backup marker must be a private runtime backup manifest.');
    $pointer = $backend . '/.runtime/profile-s72-backup-path';
    s72ExamplesAssert(is_file($pointer) && realpath(trim((string)file_get_contents($pointer))) === dirname($marker), 'The backup marker is not the root-verified S72 backup.');
    $manifest = json_decode((string)file_get_contents($marker), true, 16, JSON_THROW_ON_ERROR);
    $sql = realpath(dirname($marker) . '/database.sql');
    s72ExamplesAssert(($manifest['target'] ?? null) === 'humhub_preview' && is_string($manifest['created_at_utc'] ?? null) && preg_match('/^[a-f0-9]{64}$/D', $manifest['sha256'] ?? '') === 1, 'Backup metadata is invalid.');
    s72ExamplesAssert($sql !== false && dirname($sql) === dirname($marker) && filesize($sql) > 0 && hash_equals($manifest['sha256'], hash_file('sha256', $sql)), 'Backup SQL checksum mismatch.');
    return true;
}

function s72ExamplesSaveManifest(string $path, array $manifest): void
{
    s72ExamplesAssert(!is_link($path), 'The example journal cannot be a symbolic link.');
    $temporary = $path . '.tmp-' . bin2hex(random_bytes(5));
    s72ExamplesAssert(file_put_contents($temporary, json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL, LOCK_EX) !== false, 'Cannot write private example journal.');
    chmod($temporary, 0600);
    s72ExamplesAssert(rename($temporary, $path), 'Cannot atomically publish the example journal.');
}

function s72ExamplesGuid(): string
{
    $bytes = random_bytes(16); $bytes[6] = chr((ord($bytes[6]) & 15) | 64); $bytes[8] = chr((ord($bytes[8]) & 63) | 128); $h = bin2hex($bytes);
    return substr($h,0,8).'-'.substr($h,8,4).'-'.substr($h,12,4).'-'.substr($h,16,4).'-'.substr($h,20);
}

function s72ExamplesSpec(): array
{
    return [
        'ideas' => [
            'notes' => ['owner' => 's7_sim_081', 'title' => '课程笔记协作板', 'summary' => '完全虚构的协作示例：整理课程笔记的出处、问题与修改记录。两个模拟活动分别开展独立讨论，不混用会话成员或内容。'],
            'help' => ['owner' => 's7_sim_083', 'title' => '互助需求看板', 'summary' => '完全虚构的协作示例：将待解决的小问题整理为可认领任务，展示沟通、核对与交接方式；不对应真实项目或招募。'],
            'energy' => ['owner' => 's7_sim_085', 'title' => '能源数据观察台', 'summary' => '完全虚构的协作示例：用合成数据说明指标口径、缺失值和观察结果，练习数据整理与说明文档协作。'],
        ],
        'publications' => [
            'notes_primary' => ['idea' => 'notes', 'space' => 'primary', 'participants' => ['s7_sim_081', 's7_sim_083']],
            'notes_secondary' => ['idea' => 'notes', 'space' => 'secondary', 'participants' => ['s7_sim_081', 's7_sim_085']],
            'help_primary' => ['idea' => 'help', 'space' => 'primary', 'participants' => ['s7_sim_083', 's7_sim_085']],
            'energy_primary' => ['idea' => 'energy', 'space' => 'primary', 'participants' => ['s7_sim_081', 's7_sim_083', 's7_sim_085']],
        ],
    ];
}

/** Public S7 report IDs + dataset names + private ownership GUIDs must all agree. */
function s72ExamplesSource(string $backend, object $db): array
{
    $docs = dirname($backend) . '/docs/用户画像收集';
    $datasetPath = $docs . '/examples/s7-people_2026-11-12.json';
    $reportPath = $docs . '/sources/s7-main-seed_2026-11-12.json';
    $journalPath = $backend . '/.runtime/profile-s7/humhub_preview/people-manifest.json';
    s72ExamplesAssert(is_file($datasetPath) && is_file($reportPath) && is_file($journalPath), 'The completed main S7 dataset, report and ownership journal are required.');
    $data = json_decode((string)file_get_contents($datasetPath), true, 128, JSON_THROW_ON_ERROR);
    $report = json_decode((string)file_get_contents($reportPath), true, 128, JSON_THROW_ON_ERROR);
    $journal = json_decode((string)file_get_contents($journalPath), true, 128, JSON_THROW_ON_ERROR);
    $sha = hash_file('sha256', $datasetPath);
    s72ExamplesAssert(($report['status'] ?? null) === 'passed' && ($report['target'] ?? null) === 'humhub_preview' && ($report['synthetic'] ?? null) === true
        && ($report['dataset']['sha256'] ?? null) === $sha && ($journal['dataset_sha256'] ?? null) === $sha && ($journal['target'] ?? null) === 'humhub_preview' && ($journal['synthetic'] ?? null) === true, 'The main synthetic dataset provenance is inconsistent.');
    $spaces = []; $people = [];
    foreach (['primary', 'secondary'] as $alias) {
        $id = $report[$alias . '_space_id'] ?? null; $ownership = $journal['spaces'][$alias] ?? [];
        s72ExamplesAssert(is_int($id) && $id > 0 && ($ownership['id'] ?? null) === $id && ($ownership['status'] ?? null) === 'complete', 'The S7 Space mapping is incomplete.');
        $row = (new yii\db\Query())->select(['id','guid','name','status'])->from('{{%space}}')->where(['id' => $id])->one($db);
        s72ExamplesAssert($row !== false && $row['name'] === $data['spaces'][$alias]['name'] && $row['guid'] === $ownership['guid'] && (int)$row['status'] === 1, 'The S7 Space ID, name or ownership GUID no longer matches.');
        $spaces[$alias] = ['id' => $id, 'guid' => $row['guid'], 'name' => $row['name']];
    }
    foreach ([81, 83, 85] as $number) {
        $key = sprintf('s7_sim_%03d', $number); $ownership = $journal['people'][$key] ?? []; $id = $report['people'][(string)$number] ?? null;
        s72ExamplesAssert(is_int($id) && $id > 0 && ($ownership['id'] ?? null) === $id && ($ownership['status'] ?? null) === 'complete', 'A selected S7 synthetic account lacks a completed ownership record.');
        $row = (new yii\db\Query())->select(['id','guid','username','email','status'])->from('{{%user}}')->where(['id' => $id])->one($db);
        s72ExamplesAssert($row !== false && $row['username'] === $key && $row['email'] === $key . '@example.invalid' && $row['guid'] === $ownership['guid'] && (int)$row['status'] === 1, 'A selected synthetic account has changed identity or ownership.');
        foreach ($spaces as $space) {
            s72ExamplesAssert((new yii\db\Query())->from('{{%space_membership}}')->where(['space_id' => $space['id'], 'user_id' => $id, 'status' => 3])->exists($db), 'A selected synthetic participant lacks formal membership of an example Space.');
        }
        $people[$key] = ['id' => $id, 'guid' => $row['guid']];
    }
    return ['dataset_id' => $data['dataset_id'], 'dataset_sha256' => $sha, 'source_seed_sha256' => hash_file('sha256', $reportPath), 'people' => $people, 'spaces' => $spaces];
}

function s72ExamplesNewManifest(string $target, array $source, array $spec): array
{
    $manifest = ['version'=>1,'target'=>$target,'synthetic'=>true,'dataset_id'=>$source['dataset_id'],'dataset_sha256'=>$source['dataset_sha256'],
        'source_seed_sha256'=>$source['source_seed_sha256'],'spec_sha256'=>hash('sha256',json_encode($spec,JSON_THROW_ON_ERROR)),
        'people'=>$source['people'],'spaces'=>$source['spaces'],'ideas'=>[],'publications'=>[],'presentation'=>[],'sharing'=>[]];
    foreach (array_keys($spec['ideas']) as $key) { $manifest['ideas'][$key] = ['token'=>s72ExamplesGuid(),'phase'=>'reserved']; }
    foreach (array_keys($spec['publications']) as $key) { $manifest['publications'][$key] = ['token'=>s72ExamplesGuid(),'phase'=>'reserved']; }
    return $manifest;
}

function s72ExamplesValidateManifest(array $manifest, string $target, array $source, array $spec): void
{
    s72ExamplesAssert(($manifest['version'] ?? null) === 1 && ($manifest['target'] ?? null) === $target && ($manifest['synthetic'] ?? null) === true, 'The example journal belongs to another target or schema.');
    foreach (['dataset_id','dataset_sha256','source_seed_sha256','people','spaces'] as $key) { s72ExamplesAssert(($manifest[$key] ?? null) === $source[$key], 'The journal source mapping no longer matches the verified S7 dataset.'); }
    s72ExamplesAssert(($manifest['spec_sha256'] ?? null) === hash('sha256',json_encode($spec,JSON_THROW_ON_ERROR)), 'The example specification changed; automatic replacement is prohibited.');
    $seen = [];
    foreach (['ideas','publications'] as $kind) {
        s72ExamplesAssert(is_array($manifest[$kind] ?? null) && array_keys($manifest[$kind]) === array_keys($spec[$kind]), 'The journal contains an unexpected example collection.');
        foreach ($manifest[$kind] as $row) {
            s72ExamplesAssert(in_array($row['phase'] ?? null,['reserved','complete'],true) && preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/D',$row['token'] ?? '') === 1 && !isset($seen[$row['token']]), 'The journal has an invalid ownership token or stage.');
            $seen[$row['token']] = true;
            foreach (['idea_id','draft_id','activity_id','message_id'] as $id) { if (isset($row[$id])) { s72ExamplesAssert(is_int($row[$id]) && $row[$id] > 0,'The journal object ID is invalid.'); } }
        }
    }
    s72ExamplesAssert(is_array($manifest['presentation'] ?? null) && is_array($manifest['sharing'] ?? null), 'The journal choices are invalid.');
}

/** No real session is impersonated or persisted. Only a verified fixture owner/Space is selected. */
function s72ExamplesServices(object $db, int $ownerId, int $spaceId): array
{
    $auth = clone ($db->getMaster() ?? $db); $auth->tablePrefix = $db->tablePrefix; $auth->masters=[]; $auth->slaves=[];
    $auth->attributes=array_replace($auth->attributes ?? [],[PDO::ATTR_PERSISTENT=>false]);
    $auth->enableSlaves=false; $auth->enableQueryCache=false; $auth->enableSchemaCache=false; $auth->enableLogging=false; $auth->enableProfiling=false;
    $selection = new class($ownerId,$spaceId) implements humhub\modules\matcherRecommendation\adapters\native\ServerSelectionSource {
        public function __construct(private int $owner,private int $space) {}
        public function read(): array { return ['actor_id'=>$this->owner,'space_id'=>$this->space,'selection_revision'=>'selection-'.substr(hash('sha256','s72-examples:'.$this->owner.':'.$this->space),0,32)]; }
    };
    $events=new humhub\modules\matcherRecommendation\adapters\native\NativeCurrentEventAccess($auth,$selection,'ordinary-activity-access-v1');
    $repository=new humhub\modules\matcherIdeas\adapters\persistence\SqlIdeaRepository($db);
    $native=new humhub\modules\matcherIdeas\adapters\native\NativeIdeaRelations($db);
    $spaceAccess=new humhub\modules\matcherIdeas\adapters\native\NativeCurrentSpaceAccess($events);
    $ideas=new humhub\modules\matcherIdeas\application\IdeaService($repository,$native,$spaceAccess);
    $source=new humhub\modules\matcherIdeas\application\IdeaRelationSource($repository,$native,$spaceAccess);
    $entry=new humhub\modules\matcherPrivacy\adapters\native\NativeCurrentProfileEntry($db,static function(int $viewer,int $space)use($events):array{
        $c=$events->resolve($viewer,$space);return ['viewer_id'=>$c->viewerId,'space_id'=>$c->spaceId,'access_version'=>$c->accessVersion,'policy_version'=>$c->policyVersion];
    });
    $sharingRepository=new humhub\modules\matcherPrivacy\adapters\persistence\SqlRelationSharingRepository($db);
    $sharing=new humhub\modules\matcherPrivacy\application\ProfileRelationService($entry,
        new humhub\modules\matcherPrivacy\adapters\native\NativeRelationCandidateSource($db,static fn():object=>$source,(bool)(Yii::$app->getModule('space')->hideMembers ?? false)),
        $sharingRepository,new humhub\modules\matcherPrivacy\domain\RelationCursor(random_bytes(32)));
    return ['ideas'=>$ideas,'source'=>$source,'repository'=>$repository,'sharing'=>$sharing,'sharing_repository'=>$sharingRepository];
}

/** Captures hashes only. All existing rows are protected, including in append-only example tables. */
function s72ExamplesBaseline(object $db): array
{
    $append=['matcher_idea','matcher_idea_activity','matcher_idea_conversation','matcher_idea_draft','message','user_message','matcher_profile_presentation','matcher_profile_relation_sharing'];
    $required=['user','profile','space','space_membership','profile_field','matcher_profile_state','matcher_profile_attribute','matcher_profile_revision','matcher_profile_draft','matcher_profile_ai_job','message_entry','notification','queue'];
    $names=$db->schema->getTableNames(); $tables=[];
    foreach ($names as $physical) {
        $name=$db->tablePrefix !== '' && str_starts_with($physical,$db->tablePrefix)?substr($physical,strlen($db->tablePrefix)):$physical;
        if(in_array($name,array_merge($append,$required,['profile_field_category','activity','user_friendship','user_follow','message_tag','user_message_tag']),true)
            || preg_match('/^(matcher_profile_|matcher_onboarding_|matcher_recommendation_|notification|queue)/D',$name)) { $tables[]=$name; }
    }
    foreach($required as $name){s72ExamplesAssert(in_array($name,$tables,true),'A required preservation table is unavailable: '.$name);}
    $result=[]; sort($tables,SORT_STRING);
    foreach($tables as $name){$result[$name]=s72ExamplesTable($db,$name,in_array($name,$append,true));}
    return $result;
}
function s72ExamplesTable(object $db,string $name,bool $append):array
{
    $schema=$db->schema->getTableSchema('{{%'.$name.'}}',true);
    s72ExamplesAssert($schema!==null,'A preservation table disappeared.');
    $query=(new yii\db\Query())->from('{{%'.$name.'}}')->noCache();
    if($schema->primaryKey!==[]){$query->orderBy(array_fill_keys($schema->primaryKey,SORT_ASC));}
    $rows=[]; $count=0;
    foreach($query->each(200,$db) as $row){
        $key=$schema->primaryKey===[]?(string)$count:json_encode(array_intersect_key($row,array_flip($schema->primaryKey)),JSON_THROW_ON_ERROR);
        // Source snapshots may contain binary PDF/DOCX blobs. Hash their exact bytes
        // without trying to emit them as JSON or exposing private original material.
        $rows[$key]=hash('sha256',serialize($row));++$count;
    }
    if($schema->primaryKey===[]){sort($rows,SORT_STRING);}else{ksort($rows,SORT_STRING);}
    return ['rows'=>$count,'sha256'=>hash('sha256',json_encode($rows,JSON_THROW_ON_ERROR)),'columns'=>array_keys($schema->columns),'primary_key'=>$schema->primaryKey,'append'=>$append,'row_hashes'=>$append?$rows:[]];
}
function s72ExamplesCheckBaseline(object $db,array $before):array
{
    $report=[];
    foreach($before as $name=>$old){
        $new=s72ExamplesTable($db,$name,$old['append']);
        s72ExamplesAssert($new['columns']===$old['columns'] && $new['primary_key']===$old['primary_key'],'A preservation schema changed: '.$name);
        if(!$old['append']){s72ExamplesAssert($old['sha256']===$new['sha256'] && $old['rows']===$new['rows'],'A protected table changed: '.$name);}
        else{foreach($old['row_hashes'] as $key=>$hash){s72ExamplesAssert(($new['row_hashes'][$key]??null)===$hash,'An existing row changed or disappeared: '.$name);}}
        $report[$name]=['before_rows'=>$old['rows'],'after_rows'=>$new['rows'],'added_rows'=>$new['rows']-$old['rows'],'existing_rows_unchanged'=>true,'before_sha256'=>$old['sha256'],'after_sha256'=>$new['sha256']];
    }
    return $report;
}

function s72ExamplesIdea(object $db,object $drafts,array $definition,array $record,int $ownerId,bool $seed):array
{
    $marker='s72-synthetic-idea:'.$record['token'];
    $matches=(new yii\db\Query())->select(['id','owner_id','status','confirmed_idea_id'])->from('{{%matcher_idea_draft}}')->where(['raw_text'=>$marker])->all($db);
    s72ExamplesAssert(count($matches)<=1,'A synthetic draft marker is not unique.');
    if(isset($record['idea_id'])){
        $idea=(new yii\db\Query())->from('{{%matcher_idea}}')->where(['id'=>$record['idea_id']])->one($db);
        s72ExamplesAssert($idea!==false && (int)$idea['creator_id']===$ownerId && count($matches)===1 && (int)$matches[0]['id']===$record['draft_id'] && (int)$matches[0]['confirmed_idea_id']===$record['idea_id'],'A recorded synthetic idea was removed or replaced; recreation is prohibited.');
        return $record;
    }
    if($matches!==[]){
        $row=$matches[0];s72ExamplesAssert((int)$row['owner_id']===$ownerId && $row['status']==='confirmed' && (int)$row['confirmed_idea_id']>0,'A reserved draft marker conflicts with an incomplete or foreign record.');
        $idea=(new yii\db\Query())->from('{{%matcher_idea}}')->where(['id'=>(int)$row['confirmed_idea_id'],'creator_id'=>$ownerId])->one($db);
        s72ExamplesAssert($idea!==false,'The committed synthetic draft has no matching idea.');
        return $record+['idea_id'=>(int)$idea['id'],'draft_id'=>(int)$row['id']];
    }
    if(!$seed){return $record;}
    $title='[S72虚构示例:'.$record['token'].'] '.$definition['title'];
    s72ExamplesAssert(!(new yii\db\Query())->from('{{%matcher_idea}}')->where(['title'=>$title])->exists($db),'A formal example title exists without its journal-owned draft.');
    $result=$db->transaction(static function()use($drafts,$ownerId,$title,$definition,$marker):array{
        $draft=$drafts->start($ownerId,null,['title'=>$title,'summary'=>$definition['summary']],$marker);
        return $drafts->confirm($ownerId,$draft['id'],$draft['version']);
    });
    return $record+['idea_id'=>$result['idea_id'],'draft_id'=>$result['draft_id']];
}

function s72ExamplesPublication(object $db,array $services,array $record,int $ideaId,int $ownerId,int $spaceId,array $participantIds,bool $seed):array
{
    sort($participantIds,SORT_NUMERIC);$repository=$services['repository'];
    $existing=$repository->activityFor($ideaId,$spaceId);
    $marker='[S72虚构会话:'.$record['token'].']';
    if(isset($record['activity_id'])){
        s72ExamplesAssert($existing!==null && $existing['id']===$record['activity_id'] && $existing['message_id']===$record['message_id'],'A recorded publication or binding was removed or replaced; recreation is prohibited.');
        $message=(new yii\db\Query())->select(['id','created_by'])->from('{{%message}}')->where(['id'=>$record['message_id']])->one($db);
        s72ExamplesAssert($message!==false && (int)$message['created_by']===$ownerId,'The recorded synthetic conversation was removed or reassigned.');
        return $record;
    }
    if($existing!==null){
        $message=(new yii\db\Query())->select(['id','title','created_by'])->from('{{%message}}')->where(['id'=>$existing['message_id']])->one($db);
        $participants=array_map('intval',(new yii\db\Query())->select('user_id')->from('{{%user_message}}')->where(['message_id'=>$existing['message_id']])->orderBy('user_id')->column($db));
        s72ExamplesAssert($message!==false && $message['title']===$marker && (int)$message['created_by']===$ownerId && $participants===$participantIds,'An existing Space publication is not the reserved synthetic conversation.');
        return $record+['activity_id'=>$existing['id'],'message_id'=>(int)$message['id']];
    }
    if(!$seed){return $record;}
    s72ExamplesAssert(!(new yii\db\Query())->from('{{%message}}')->where(['title'=>$marker])->exists($db),'An unbound conversation already owns the reserved marker.');
    $result=$db->transaction(static function()use($db,$services,$ideaId,$ownerId,$spaceId,$participantIds,$marker):array{
        $idea=$services['repository']->idea($ideaId,true);s72ExamplesAssert($idea!==null && $idea['creator_id']===$ownerId,'The idea creator changed before publication.');
        $activity=$services['ideas']->associateSpace($ownerId,$ideaId,$idea['version'],$spaceId);
        $now=gmdate('Y-m-d H:i:s');
        // Deliberately bypass AR events only for these empty synthetic Messenger fixtures.
        $db->createCommand()->insert('{{%message}}',['title'=>$marker,'created_by'=>$ownerId,'updated_by'=>$ownerId,'created_at'=>$now,'updated_at'=>$now])->execute();
        $messageId=(int)$db->getLastInsertID();
        foreach($participantIds as $participantId){$db->createCommand()->insert('{{%user_message}}',['message_id'=>$messageId,'user_id'=>$participantId,'is_originator'=>$participantId===$ownerId?1:0,'last_viewed'=>$now,'created_at'=>$now,'updated_at'=>$now,'created_by'=>$ownerId,'updated_by'=>$ownerId])->execute();}
        $activity=$services['ideas']->bindConversation($ownerId,$activity['id'],$activity['version'],$messageId);
        $activity=$services['ideas']->setMemberVisibility($ownerId,$activity['id'],$activity['version'],true);
        return ['activity_id'=>$activity['id'],'message_id'=>$messageId];
    });
    return $record+$result;
}

function s72ExamplesPresentation(object $p1,int $ownerId,?array $record,bool $seed):array
{
    $service=$p1->getPresentationService();$current=$service->read($ownerId);
    if($record!==null || $current['version']>0 || !$seed){return $record??['phase'=>$current['version']>0?'preserved_existing':'pending','initial_version'=>$current['version']];}
    $scope=humhub\modules\matcherProfile\domain\ProfileScope::global();
    $repository=$p1->getProfileRepository();$state=$repository->findState($ownerId,$scope);
    s72ExamplesAssert($state!==null,'A selected example owner has no global profile state.');
    $attributes=$repository->currentAttributes($state['id']);$candidates=['education'=>[],'portfolio_link'=>[]];
    foreach($attributes as $attribute){if(isset($candidates[$attribute['key']]) && $attribute['confirmation']==='confirmed' && $attribute['visibility']==='authenticated'){$candidates[$attribute['key']][]=$attribute['attribute_id'];}}
    foreach($candidates as &$ids){sort($ids,SORT_STRING);}unset($ids);
    s72ExamplesAssert($candidates['education']!==[] && $candidates['portfolio_link']!==[],'Confirmed authenticated school and portfolio selections are required.');
    $portfolio=in_array($current['primary_portfolio_attribute_id'],$candidates['portfolio_link'],true)?$current['primary_portfolio_attribute_id']:$candidates['portfolio_link'][0];
    try{$saved=$service->save($ownerId,0,$candidates['education'][0],$portfolio);}
    catch(humhub\modules\matcherProfile\domain\ProfileException $error){
        if($error->errorCode!=='PRESENTATION_CONFLICT'){throw $error;}$latest=$service->read($ownerId);s72ExamplesAssert($latest['version']>0,'A presentation conflict did not resolve to an existing choice.');return ['phase'=>'preserved_existing','initial_version'=>$latest['version']];
    }
    return ['phase'=>'complete','initial_version'=>$saved['version']];
}

function s72ExamplesShare(array $services,int $ownerId,int $spaceId,string $kind,string $objectId,?array $record,bool $seed):array
{
    $current=$services['sharing_repository']->read($ownerId,$spaceId,$kind)[$objectId]??['version'=>0,'visibility'=>'private'];
    if($record!==null || $current['version']>0 || !$seed){return $record??['phase'=>$current['version']>0?'preserved_existing':'pending','initial_version'=>$current['version']];}
    try{$saved=$services['sharing']->share($ownerId,$spaceId,$kind,$objectId,0,'authenticated');}
    catch(humhub\modules\matcherProfile\domain\ProfileException $error){
        if($error->errorCode!=='RELATION_SHARING_CONFLICT'){throw $error;}$latest=$services['sharing_repository']->read($ownerId,$spaceId,$kind)[$objectId]??null;s72ExamplesAssert($latest!==null && $latest['version']>0,'A sharing conflict did not resolve to an existing choice.');return ['phase'=>'preserved_existing','initial_version'=>$latest['version']];
    }
    return ['phase'=>'complete','initial_version'=>$saved['version']];
}

function s72ExamplesMain(array $argv):array
{
    $GLOBALS['s72_examples_stage']='guards';
    $options=s72ExamplesOptions($argv);$backend=dirname(__DIR__);$seed=$options['action']==='seed';$target=$options['target'];
    $backup=s72ExamplesVerifyBackup($backend,$options);
    $GLOBALS['s72_examples_stage']='bootstrap';
    if($target==='humhub_preview'){$app=require __DIR__.'/app.php';}
    else{putenv('MATCHER_S72_TEST_DB='.$target);$app=require $backend.'/protected/modules/matcher-onboarding/tests/integration/s72_http_bootstrap.php';}
    $db=$app->db;$db->enableLogging=false;$db->enableProfiling=false;$db->enableQueryCache=false;$db->enableSchemaCache=false;
    s72ExamplesAssert(str_starts_with($db->dsn,'mysql:') && preg_match('/(?:^mysql:|;)(?:host=(?:127\.0\.0\.1|localhost|::1)(?:;|$)|unix_socket=\/)/D',$db->dsn)===1,'Only the configured local MySQL connection is allowed.');
    s72ExamplesAssert($db->createCommand('SELECT DATABASE()')->queryScalar()===$target,'The actual database does not match the explicit target.');
    foreach(['matcher-user-profile','matcher-profile-privacy','matcher-recommendation','matcher-ideas','mail'] as $id){s72ExamplesAssert($app->getModule($id)?->isEnabled===true,'A required reviewed module is not enabled: '.$id);}
    $p1=$app->getModule('matcher-user-profile');s72ExamplesAssert(!$p1->isInMaintenance(),'Profile maintenance blocks example preferences.');
    if(($ai=$app->getModule('matcher-onboarding-ai'))!==null){$ai->configPath=$backend.'/.runtime/profile-s72/disabled-example-ai-config.json';}
    $GLOBALS['s72_examples_stage']='source-provenance';
    $source=s72ExamplesSource($backend,$db);$spec=s72ExamplesSpec();
    $runtime=$backend.'/.runtime/profile-s72/'.$target;$path=$runtime.'/examples-manifest.json';
    if($seed && !is_dir($runtime)){s72ExamplesAssert(mkdir($runtime,0700,true),'Cannot create private example runtime.');}
    $lock=null;if($seed){$lock=fopen($runtime.'/examples-manifest.lock','c');s72ExamplesAssert($lock!==false && flock($lock,LOCK_EX|LOCK_NB),'Another example installer is running.');chmod($runtime.'/examples-manifest.lock',0600);}
    s72ExamplesAssert(!is_link($path),'The example journal cannot be a symbolic link.');
    $exists=is_file($path);
    if(!$exists){
        s72ExamplesAssert(!(new yii\db\Query())->from('{{%matcher_idea}}')->where(['like','title','[S72虚构示例:'])->exists($db) && !(new yii\db\Query())->from('{{%message}}')->where(['like','title','[S72虚构会话:'])->exists($db),'Synthetic example markers already exist without this target journal; no adoption or reset is permitted.');
    }
    $manifest=$exists?json_decode((string)file_get_contents($path),true,64,JSON_THROW_ON_ERROR):s72ExamplesNewManifest($target,$source,$spec);
    s72ExamplesValidateManifest($manifest,$target,$source,$spec);
    if($seed && !$exists){s72ExamplesSaveManifest($path,$manifest);}
    $GLOBALS['s72_examples_stage']='preservation-baseline';
    $before=s72ExamplesBaseline($db);$suppressed=['queue'=>0,'mail'=>0,'activity'=>0];
    if($seed){
        $app->queue->on(yii\queue\Queue::EVENT_BEFORE_PUSH,static function($event)use(&$suppressed):void{$event->handled=true;++$suppressed['queue'];},null,false);
        $app->mailer->on(yii\mail\BaseMailer::EVENT_BEFORE_SEND,static function($event)use(&$suppressed):void{$event->isValid=false;$event->handled=true;++$suppressed['mail'];},null,false);
        yii\base\Event::on(humhub\modules\activity\services\ActivityManager::class,humhub\modules\activity\services\ActivityManager::EVENT_BEFORE_DISPATCH,static function($event)use(&$suppressed):void{$event->isValid=false;$event->handled=true;++$suppressed['activity'];},null,false);
    }
    $drafts=$app->getModule('matcher-ideas')->getDraftService();
    $GLOBALS['s72_examples_stage']='formal-ideas';
    foreach($spec['ideas'] as $key=>$definition){
        $manifest['ideas'][$key]=s72ExamplesIdea($db,$drafts,$definition,$manifest['ideas'][$key],$source['people'][$definition['owner']]['id'],$seed);
        if(isset($manifest['ideas'][$key]['idea_id'])){$manifest['ideas'][$key]['phase']='complete';}
        if($seed){s72ExamplesSaveManifest($path,$manifest);}
    }
    $GLOBALS['s72_examples_stage']='space-publications';
    foreach($spec['publications'] as $key=>$definition){
        $idea=$manifest['ideas'][$definition['idea']];if(!isset($idea['idea_id'])){continue;}
        $owner=$source['people'][$spec['ideas'][$definition['idea']]['owner']]['id'];$space=$source['spaces'][$definition['space']]['id'];
        $participants=array_map(static fn(string $name):int=>$source['people'][$name]['id'],$definition['participants']);
        $services=s72ExamplesServices($db,$owner,$space);
        $manifest['publications'][$key]=s72ExamplesPublication($db,$services,$manifest['publications'][$key],$idea['idea_id'],$owner,$space,$participants,$seed);
        if(isset($manifest['publications'][$key]['activity_id'])){$manifest['publications'][$key]['phase']='complete';}
        if($seed){s72ExamplesSaveManifest($path,$manifest);}
    }
    $GLOBALS['s72_examples_stage']='presentation';
    foreach($source['people'] as $name=>$person){
        $manifest['presentation'][$name]=s72ExamplesPresentation($p1,$person['id'],$manifest['presentation'][$name]??null,$seed);
        if($seed){s72ExamplesSaveManifest($path,$manifest);}
    }
    $sharingTargets=[];
    foreach($spec['publications'] as $key=>$definition){
        $publication=$manifest['publications'][$key];if(!isset($publication['activity_id'])){continue;}
        $space=$source['spaces'][$definition['space']]['id'];
        foreach($definition['participants'] as $name){$owner=$source['people'][$name]['id'];foreach(['activities'=>(string)$space,'idea_groups'=>(string)$publication['activity_id']] as $kind=>$object){$sharingTargets[$owner.':'.$space.':'.$kind.':'.$object]=[$owner,$space,$kind,$object];}}
    }
    $GLOBALS['s72_examples_stage']='relation-sharing';
    foreach($sharingTargets as $key=>[$owner,$space,$kind,$object]){
        $services=s72ExamplesServices($db,$owner,$space);
        $manifest['sharing'][$key]=s72ExamplesShare($services,$owner,$space,$kind,$object,$manifest['sharing'][$key]??null,$seed);
        if($seed){s72ExamplesSaveManifest($path,$manifest);}
    }
    $GLOBALS['s72_examples_stage']='preservation-verification';
    $preservation=s72ExamplesCheckBaseline($db,$before);
    $mapping=[];$messages=[];
    foreach($spec['publications'] as $key=>$definition){
        $record=$manifest['publications'][$key];if(!isset($record['activity_id'])){continue;}
        $mapping[$key]=['idea_id'=>$manifest['ideas'][$definition['idea']]['idea_id'],'activity_id'=>$record['activity_id'],'message_id'=>$record['message_id'],'space_id'=>$source['spaces'][$definition['space']]['id'],'synthetic_participant_ids'=>array_map(static fn(string $name):int=>$source['people'][$name]['id'],$definition['participants'])];$messages[]=$record['message_id'];
    }
    $empty=$messages===[]?0:(int)(new yii\db\Query())->from('{{%message_entry}}')->where(['message_id'=>$messages])->count('*',$db);
    if($seed && !$exists){s72ExamplesAssert(count($mapping)===4 && $empty===0,'Initial installation must produce exactly four empty synthetic conversations.');}
    if($seed){$manifest['last_verified_at_utc']=gmdate('c');s72ExamplesSaveManifest($path,$manifest);}
    if(is_resource($lock)){flock($lock,LOCK_UN);fclose($lock);}
    return ['status'=>'passed','action'=>$options['action'],'target'=>$target,'synthetic'=>true,'backup_checksum_verified'=>$backup,'manifest_preexisted'=>$exists,
        'ideas_mapped'=>count(array_filter($manifest['ideas'],static fn(array $r):bool=>isset($r['idea_id']))),'publications_mapped'=>count($mapping),'conversations_mapped'=>count(array_unique($messages)),
        'synthetic_people'=>array_map(static fn(array $p):int=>$p['id'],$source['people']),'spaces'=>$source['spaces'],'mapping'=>$mapping,
        'presentation'=>$manifest['presentation'],'sharing'=>$manifest['sharing'],'existing_rows_unchanged'=>true,'message_entry_unchanged'=>true,'message_entries_in_example_conversations'=>$empty,
        'preservation'=>$preservation,'suppressed_side_effects'=>$suppressed,'llm_calls'=>0,'manifest_sha256'=>$seed||$exists?hash_file('sha256',$path):null];
}

if (!defined('MATCHER_S72_EXAMPLES_LIBRARY_ONLY')) {
    umask(0077);
    try { echo json_encode(s72ExamplesMain($argv),JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR).PHP_EOL; }
    catch(Throwable $error){fwrite(STDERR,json_encode(['status'=>'failed','stage'=>$GLOBALS['s72_examples_stage']??'guards','type'=>get_class($error),'reason'=>$error instanceof S72ExamplesFailure?$error->getMessage():'The guarded example stage failed; no private diagnostic text is emitted.'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR).PHP_EOL);exit(1);}
}
