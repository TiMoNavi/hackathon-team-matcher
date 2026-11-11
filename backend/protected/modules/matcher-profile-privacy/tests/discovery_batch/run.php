<?php
declare(strict_types=1);
// Synthetic SQLite memory only. No app bootstrap, runtime configuration or existing database.
$backend = dirname(__DIR__, 5);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
$modules = $backend . '/protected/modules';
spl_autoload_register(static function (string $class) use ($modules): void {
    foreach (['matcherProfile' => 'matcher-user-profile', 'matcherPrivacy' => 'matcher-profile-privacy'] as $ns => $directory) {
        $prefix = 'humhub\\modules\\' . $ns . '\\';
        if (str_starts_with($class, $prefix)) {
            $path = $modules . '/' . $directory . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php';
            if (is_file($path)) { require $path; }
        }
    }
});
use humhub\modules\matcherPrivacy\application\DiscoveryBatchService;
use humhub\modules\matcherPrivacy\adapters\native\NativeDiscoveryRelations;
use humhub\modules\matcherPrivacy\domain\DiscoveryFieldPolicy;
use humhub\modules\matcherPrivacy\domain\ports\DiscoveryRelations;
use humhub\modules\matcherProfile\domain\ProfileException;
use yii\db\Connection;

final class CountingConnection extends Connection
{
    public array $selects = [];
    public ?Closure $onSelect = null;
    public function createCommand($sql = null, $params = [])
    {
        if (is_string($sql) && preg_match('/^\s*SELECT\b/i', $sql)) {
            $this->selects[] = ['master' => !$this->enableSlaves, 'cache_disabled' => $this->getQueryCacheInfo(null, null) === null, 'logging' => $this->enableLogging, 'profiling' => $this->enableProfiling];
            if ($this->onSelect !== null) { ($this->onSelect)($this, count($this->selects)); }
        }
        return parent::createCommand($sql, $params);
    }
}
function database(int $candidates = 4): CountingConnection
{
    $db = new CountingConnection(['dsn' => 'sqlite::memory:', 'enableLogging' => false, 'enableProfiling' => false, 'enableSchemaCache' => false, 'queryCache' => new yii\caching\ArrayCache()]);
    $db->open();
    foreach ([
        'CREATE TABLE user (id INTEGER PRIMARY KEY, contentcontainer_id INTEGER, status INTEGER, visibility INTEGER, is_system_admin INTEGER DEFAULT 0)',
        'CREATE TABLE space (id INTEGER PRIMARY KEY, contentcontainer_id INTEGER, status INTEGER)',
        'CREATE TABLE space_membership (id INTEGER PRIMARY KEY AUTOINCREMENT, space_id INTEGER, user_id INTEGER, status INTEGER, group_id TEXT)',
        'CREATE TABLE contentcontainer_blocked_users (contentcontainer_id INTEGER, user_id INTEGER, PRIMARY KEY(contentcontainer_id,user_id))',
    ] as $sql) { $db->createCommand($sql)->execute(); }
    foreach ([7, 8] as $space) { $db->createCommand()->insert('space', ['id' => $space, 'contentcontainer_id' => 1000 + $space, 'status' => 1])->execute(); }
    for ($id = 1; $id <= $candidates + 1; $id++) {
        $db->createCommand()->insert('user', ['id' => $id, 'contentcontainer_id' => 10000 + $id, 'status' => 1, 'visibility' => 1, 'is_system_admin' => (int)($id === 1)])->execute();
        $db->createCommand()->insert('space_membership', ['space_id' => 7, 'user_id' => $id, 'status' => 3, 'group_id' => $id === 1 ? 'admin' : 'member'])->execute();
    }
    $db->selects = [];
    return $db;
}
function block(Connection $db, int $container, int $user): void
{
    $db->createCommand()->insert('contentcontainer_blocked_users', ['contentcontainer_id' => $container, 'user_id' => $user])->execute();
}
function attribute(string $key, mixed $value, string $id = 'field-1', string $visibility = 'authenticated', string $confirmation = 'confirmed'): array
{
    return ['attribute_id' => $id, 'key' => $key, 'value' => $value, 'visibility' => $visibility, 'confirmation' => $confirmation, 'schema_version' => 2, 'last_confirmed_at' => '2026-11-11 00:00:00'];
}
function batch(array $ids, int $spaceId = 7): array
{
    $profiles = [];
    foreach ($ids as $id) {
        $profiles[$id] = ['scopes' => [
            'global' => ['revision' => 4, 'permission_version' => 2, 'attributes' => [attribute('skill', ['code' => 'php', 'label' => 'PHP'], 'skill-' . $id)]],
            'space:' . $spaceId => ['revision' => 0, 'permission_version' => 0, 'attributes' => []],
        ], 'identity_version' => 0];
    }
    return ['schema_version' => 2, 'profiles' => $profiles];
}
function service(Connection $db, ?callable $read = null): DiscoveryBatchService
{
    return new DiscoveryBatchService(new NativeDiscoveryRelations($db), $read ?? static fn(array $ids, int $space): array => batch($ids, $space));
}
$checks = [];
function check(bool $value, string $label): void { global $checks; if (!$value) { throw new RuntimeException('FAILED: ' . $label); } $checks[] = $label; }
function rejects(callable $action, string $code, string $label): void
{
    try { $action(); } catch (ProfileException $error) { check($error->errorCode === $code && $error->getPrevious() === null, $label); return; }
    check(false, $label);
}

$db = database(); $calls = [];
$reader = service($db, static function ($ids, $space, $keys) use (&$calls): array { $calls[] = [$ids, $space, $keys]; return batch($ids, $space); });
$result = $reader->read(1, 7, [4, 2, 3], ['skill']);
check(array_keys($result['profiles']) === [4, 2, 3], 'bounded source and output preserve requested owner order');
check(count($calls) === 2 && $calls[0] === $calls[1] && $calls[0] === [[4, 2, 3], 7, ['skill']], 'P1 is called twice as a batch with explicit requested sources');
check(count($db->selects) === 6, 'three native qualification batches use six SELECTs');
check($result['policy_version'] === DiscoveryBatchService::POLICY_VERSION && $result['schema_version'] === 2, 'privacy and schema versions accompany the batch');
check($result['profiles'][2]['scopes']['global']['permission_version'] === 2 && $result['profiles'][2]['scopes']['space:7']['permission_version'] === 0, 'global and current Space versions remain independent');
check($result['profiles'][2]['identity_version'] === 0, 'identity counter does not fabricate confirmed identity values');
check(array_keys($result) === ['schema_version', 'profiles', 'policy_version'], 'batch root contains no extra source metadata');

$db = database(); $calls = 0;
$r = service($db, static function ($ids, $space) use (&$calls): array { $calls++; return batch($ids, $space); });
check($r->read(1, 7, [], [])['profiles'] === [] && $calls === 0 && count($db->selects) === 2, 'empty IDs never expand or read P1 but still validate activity twice');
check($r->read(1, 7, [1, 999], [])['profiles'] === [] && $calls === 0, 'self and missing subjects are omitted without source access');
foreach ([[0,7,[]], [1,0,[]], [1,7,['2']], [1,7,[2,2]], [1,7,[-1]], [1,7,array_fill(0,201,2)], [1,7,[2=>2]]] as [$viewer,$space,$ids]) {
    rejects(fn() => $r->read($viewer,$space,$ids,[]), 'INVALID_DISCOVERY_REQUEST', 'invalid or oversized explicit ID batch rejected');
}
foreach ([['contact_email'], ['nickname'], ['raw_resume'], ['skill','skill'], [1], ['new_unreviewed_field']] as $keys) {
    rejects(fn() => $r->read(1,7,[2],$keys), 'INVALID_DISCOVERY_REQUEST', 'unreviewed contact identity or duplicate source request rejected');
}
check(count(DiscoveryFieldPolicy::KEYS) === 19, 'discovery purpose has nineteen explicit reviewed sources');
$demand = service(database(), static function ($ids, $space): array {
    $b = batch($ids, $space);
    foreach ($ids as $id) {
        $b['profiles'][$id]['scopes']['space:' . $space]['attributes'] = [attribute('event_seeking', ['role_codes' => ['designer'], 'skill_codes' => ['figma']], 'demand-' . $id)];
    }
    return $b;
})->read(1, 7, [2], ['event_seeking']);
check($demand['profiles'][2]['scopes']['space:7']['attributes'][0]['value']['role_codes'] === ['designer'], 'S7 public confirmed event demand is reviewed for ordinary discovery');

foreach ([['user',['status'=>0],['id'=>1]], ['space',['status'=>0],['id'=>7]], ['space_membership',['status'=>1],['user_id'=>1]], ['space_membership',['status'=>2],['user_id'=>1]], ['user',['contentcontainer_id'=>null],['id'=>1]]] as [$table,$values,$where]) {
    $db=database(); $db->createCommand()->update($table,$values,$where)->execute();
    rejects(fn()=>service($db)->read(1,7,[2],['skill']), 'PROFILE_ACCESS_DENIED', 'administrator still needs active account enabled Space and formal membership');
}
$db=database(); $db->createCommand()->delete('space_membership',['user_id'=>1])->execute();
rejects(fn()=>service($db)->read(1,7,[],[]), 'PROFILE_ACCESS_DENIED', 'administrator without membership fails even empty batch');
$db=database(); block($db,1007,1);
rejects(fn()=>service($db)->read(1,7,[2],['skill']), 'PROFILE_ACCESS_DENIED', 'Space blocking overrides administrator membership');
$db=database(); $db->createCommand()->insert('space_membership',['space_id'=>7,'user_id'=>1,'status'=>3,'group_id'=>'admin'])->execute();
rejects(fn()=>service($db)->read(1,7,[2],['skill']), 'PROFILE_DEPENDENCY_UNAVAILABLE', 'ambiguous duplicate viewer memberships fail closed');

foreach ([['user',['status'=>0],['id'=>2]],['user',['visibility'=>3],['id'=>2]],['space_membership',['status'=>1],['user_id'=>2]],['space_membership',['status'=>2],['user_id'=>2]],['space_membership',['space_id'=>8],['user_id'=>2]],['user',['contentcontainer_id'=>null],['id'=>2]]] as [$table,$values,$where]) {
    $db=database(); $db->createCommand()->update($table,$values,$where)->execute();
    check(array_keys(service($db)->read(1,7,[2,3],['skill'])['profiles']) === [3], 'unavailable hidden invited applicant cross-activity or incomplete candidate omitted');
}
foreach ([[10001,2],[10002,1],[1007,2]] as [$container,$owner]) {
    $db=database(); block($db,$container,$owner);
    check(array_keys(service($db)->read(1,7,[2,3],['skill'])['profiles']) === [3], 'both user block directions and Space block exclude candidate');
}
$db=database(); $db->createCommand()->insert('space_membership',['space_id'=>7,'user_id'=>2,'status'=>3,'group_id'=>'member'])->execute();
check(array_keys(service($db)->read(1,7,[2],['skill'])['profiles']) === [2], 'duplicate candidate joins cannot duplicate projected subject');

$db=database(); $leaky=static function($ids,$space): array {
    $b=batch($ids,$space); $b['raw_source']='secret-source';
    foreach ($ids as $id) {
        $b['profiles'][$id]['raw_source']='secret-source';
        $b['profiles'][$id]['scopes']['global']['draft']='secret-draft';
        $b['profiles'][$id]['scopes']['global']['attributes']=[
            attribute('skill',['code'=>'php','label'=>'PHP'],'safe')+['source_text'=>'secret-source'],
            attribute('bio','secret-private','private','private'),
            attribute('bio','secret-friends','friends','friends'),
            attribute('bio','secret-draft','draft','authenticated','pending'),
            attribute('contact_email','secret@example.invalid','contact'),
            attribute('nickname','secret-identity','identity'),
            attribute('headline','unrequested','headline'),
        ];
    }
    return $b;
};
$result=service($db,$leaky)->read(1,7,[2],['skill','bio']);
check(array_column($result['profiles'][2]['scopes']['global']['attributes'],'key') === ['skill'], 'privacy reprojects malicious upstream private friends contacts pending identity and unrequested fields');
check(!str_contains(json_encode($result),'secret') && !str_contains(json_encode($result),'source_text'), 'hidden values and raw provenance do not escape nested result');

foreach ([
    static function(array $b): array { $b['schema_version']=3; return $b; },
    static function(array $b): array { $b['profiles'][999]=$b['profiles'][2]; return $b; },
    static function(array $b): array { $b['profiles'][2]['scopes']['space:8']=$b['profiles'][2]['scopes']['space:7']; return $b; },
    static function(array $b): array { $b['profiles'][2]['scopes']['global']['revision']='4'; return $b; },
    static function(array $b): array { $b['profiles'][2]['identity_version']=-1; return $b; },
    static function(array $b): array { $b['profiles'][2]['scopes']['global']['attributes'][0]['value']=['code'=>'php','label'=>'PHP','raw'=>'secret']; return $b; },
    static function(array $b): array { $b['profiles'][2]['scopes']['global']['attributes'][0]['schema_version']=1; return $b; },
    static function(array $b): array { $b['profiles'][2]['scopes']['global']['attributes'][]=$b['profiles'][2]['scopes']['global']['attributes'][0]; return $b; },
] as $mutate) {
    $db=database(); rejects(fn()=>service($db,fn($ids,$space)=>$mutate(batch($ids,$space)))->read(1,7,[2],['skill']), 'PROFILE_DEPENDENCY_UNAVAILABLE', 'malformed overbroad or cross-scope batch fails explicitly');
}
$db=database(); rejects(fn()=>service($db,static fn()=>throw new RuntimeException('SQL secret-data'))->read(1,7,[2],['skill']), 'PROFILE_DEPENDENCY_UNAVAILABLE', 'source failure is not empty success or SQL exception chain');
$db=database(); rejects(fn()=>service($db,static fn()=>throw new ProfileException('PROFILE_BATCH_CHANGED','internal revision detail',409))->read(1,7,[2],['skill']), 'PROFILE_BATCH_CHANGED', 'source concurrent mutation remains explicit conflict');
$badRelations=new class implements DiscoveryRelations { public function eligibleOwnerIds(int $viewerId,int $spaceId,array $ownerIds): array { return [999]; } };
rejects(fn()=>(new DiscoveryBatchService($badRelations,fn($ids,$space)=>batch($ids,$space)))->read(1,7,[2],['skill']), 'PROFILE_DEPENDENCY_UNAVAILABLE', 'unrequested grant from dependency is rejected');

foreach ([1,2] as $sourceCall) {
    foreach (['candidate_exit','candidate_block','viewer_exit'] as $mutation) {
        $db=database(); $calls=0;
        $read=static function($ids,$space) use($db,&$calls,$sourceCall,$mutation): array {
            $calls++;
            if ($calls === $sourceCall) {
                if ($mutation==='candidate_exit') { $db->createCommand()->delete('space_membership',['user_id'=>2,'space_id'=>7])->execute(); }
                elseif ($mutation==='candidate_block') { block($db,10002,1); }
                else { $db->createCommand()->delete('space_membership',['user_id'=>1,'space_id'=>7])->execute(); }
            }
            return batch($ids,$space);
        };
        if ($mutation==='viewer_exit') { rejects(fn()=>service($db,$read)->read(1,7,[2,3],['skill']), 'PROFILE_ACCESS_DENIED', 'viewer revoked during source call '.$sourceCall.' cannot receive batch'); }
        else { check(array_keys(service($db,$read)->read(1,7,[2,3],['skill'])['profiles'])===[3], 'candidate revoked during source call '.$sourceCall.' is omitted at final qualification'); }
    }
}
foreach (['permission_version','revision','identity_version','content'] as $change) {
    $db=database(); $changed=false;
    $db->onSelect=static function($db,$count) use(&$changed): void { if ($count===3) { $changed=true; } };
    $read=static function($ids,$space) use(&$changed,$change): array {
        $b=batch($ids,$space);
        if ($changed) {
            if ($change==='identity_version') { $b['profiles'][2]['identity_version']=1; }
            elseif ($change==='content') { $b['profiles'][2]['scopes']['global']['attributes'][0]['value']['label']='Changed'; }
            else { $b['profiles'][2]['scopes']['global'][$change]++; }
        }
        return $b;
    };
    rejects(fn()=>service($db,$read)->read(1,7,[2],['skill']), 'PROFILE_BATCH_CHANGED', 'source '.$change.' mutation during second qualification rejects old projection');
}

$queryCounts=[];
foreach ([1,30,200] as $size) {
    $db=database($size); $calls=0;
    $read=static function($ids,$space) use(&$calls): array { $calls++; return batch($ids,$space); };
    $result=service($db,$read)->read(1,7,range(2,$size+1),['skill']);
    $queryCounts[$size]=count($db->selects);
    check(count($result['profiles'])===$size && $calls===2 && count($db->selects)===6, $size.' candidates use six native SELECTs and two source batches');
    check(array_reduce($db->selects,static fn($ok,$q)=>$ok&&$q['master']&&$q['cache_disabled']&&!$q['logging']&&!$q['profiling'],true), $size.' candidate authorization reads use master noCache without SQL logging');
}
$db=database(); $db->enableLogging=true; $db->enableProfiling=true;
service($db)->read(1,7,[2],['skill']);
check($db->enableLogging && $db->enableProfiling, 'native logging settings restored after successful reads');
$db=database(); $tx=$db->beginTransaction();
rejects(fn()=>service($db)->read(1,7,[2],['skill']), 'DISCOVERY_TRANSACTION_UNSUPPORTED', 'preexisting transaction snapshot rejected');
check($tx->isActive, 'adapter never commits or rolls back caller transaction'); $tx->rollBack();
$db=database(); $db->createCommand('DROP TABLE contentcontainer_blocked_users')->execute(); $db->enableLogging=true; $db->enableProfiling=true;
rejects(fn()=>service($db)->read(1,7,[2],['skill']), 'PROFILE_DEPENDENCY_UNAVAILABLE', 'missing native dependency is explicit failure');
check($db->enableLogging && $db->enableProfiling, 'native logging settings restored after database failure');

$moduleSource=file_get_contents(dirname(__DIR__,2).'/Module.php');
check(str_contains($moduleSource,'getDiscoveryBatchService') && str_contains($moduleSource,'getDiscoveryProfileBatchReader'), 'module provides explicit batch assembly without HTTP route');
check(!str_contains(file_get_contents(dirname(__DIR__,2).'/application/DiscoveryBatchService.php'),'matcherRecommendation'), 'privacy application is independent from recommendation namespace');
echo json_encode(['status'=>'passed','checks'=>count($checks),'native_select_counts'=>$queryCounts,'p1_batch_calls_per_nonempty_read'=>2,'database'=>'new sqlite::memory: only','checks_passed'=>$checks],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE).PHP_EOL;
