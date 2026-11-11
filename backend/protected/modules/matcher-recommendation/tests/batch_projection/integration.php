<?php
declare(strict_types=1);
// Real adapter/service chain on freshly created SQLite memory tables; no application/config boot.
$backend = dirname(__DIR__, 5);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
require dirname(__DIR__) . '/support/autoload.php';
require dirname(__DIR__) . '/native_access/Fixtures.php';
$modules = dirname(__DIR__, 3);
spl_autoload_register(static function (string $class) use ($modules): void {
    foreach (['matcherProfile' => 'matcher-user-profile', 'matcherPrivacy' => 'matcher-profile-privacy'] as $namespace => $directory) {
        $prefix = 'humhub' . chr(92) . 'modules' . chr(92) . $namespace . chr(92);
        if (str_starts_with($class, $prefix)) {
            $file = $modules . '/' . $directory . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php';
            if (is_file($file)) { require_once $file; }
        }
    }
});
require_once $modules . '/matcher-user-profile/tests/discovery_batch/Fixtures.php';

use humhub\modules\matcherProfile\tests\discovery_batch\{Fixtures as PF, CountingConnection};
use humhub\modules\matcherProfile\application\DiscoveryProfileBatchReader;
use humhub\modules\matcherProfile\adapters\persistence\SqlDiscoveryProfileBatchSource;
use humhub\modules\matcherProfile\domain\{FieldCatalog, ProfileException};
use humhub\modules\matcherPrivacy\application\DiscoveryBatchService;
use humhub\modules\matcherPrivacy\adapters\native\NativeDiscoveryRelations;
use humhub\modules\matcherRecommendation\adapters\profile\{P1CandidateProjectionReader, P1FieldCatalogAdapter, P1SourcePurposePolicy};
use humhub\modules\matcherRecommendation\contracts\{CandidateRequest, QueryIntent};
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;
use humhub\modules\matcherRecommendation\tests\policy\Fixtures as PolicyFixtures;
use humhub\modules\matcherRecommendation\tests\native_access\{Fixtures as NF, MutableSelection};

$checks = []; $queries = [];
function bgVerify(bool $condition, string $label): void { global $checks; if (!$condition) { throw new RuntimeException('FAIL: ' . $label); } $checks[] = $label; }
function bgReject(callable $call, string $label, ?string $code = null): void {
    try { $call(); } catch (Throwable $e) {
        bgVerify($code === null || ($e instanceof ProfileException && $e->errorCode === $code), $label);
        return;
    }
    bgVerify(false, $label);
}
function bgDatabase(int $candidates = 3): CountingConnection {
    $db = PF::database($candidates + 1);
    foreach (['contentcontainer_id INTEGER', 'status INTEGER DEFAULT 1', 'visibility INTEGER DEFAULT 1', 'updated_at TEXT'] as $column) { $db->createCommand('ALTER TABLE user ADD COLUMN ' . $column)->execute(); }
    foreach ([
        'CREATE TABLE space (id INTEGER PRIMARY KEY, contentcontainer_id INTEGER, status INTEGER, visibility INTEGER, join_policy INTEGER, updated_at TEXT)',
        'CREATE TABLE space_membership (id INTEGER PRIMARY KEY AUTOINCREMENT, space_id INTEGER, user_id INTEGER, status INTEGER, group_id TEXT, created_at TEXT, updated_at TEXT)',
        'CREATE TABLE contentcontainer_blocked_users (contentcontainer_id INTEGER, user_id INTEGER, PRIMARY KEY(contentcontainer_id,user_id))',
        'CREATE TABLE user_friendship (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, friend_user_id INTEGER, created_at TEXT)',
    ] as $sql) { $db->createCommand($sql)->execute(); }
    foreach ([7, 8] as $space) { $db->createCommand()->insert('space', ['id' => $space, 'contentcontainer_id' => 1000 + $space, 'status' => 1, 'visibility' => 0, 'join_policy' => 1])->execute(); }
    for ($id = 1; $id <= $candidates + 1; $id++) {
        $db->createCommand()->update('user', ['contentcontainer_id' => 10000 + $id], ['id' => $id])->execute();
        NF::member($db, $id);
        PF::attribute($db, $id, 'global', 'interest', ['code' => 'social', 'label' => 'Social']);
    }
    NF::member($db, 1, 8);
    $db->selects = [];
    return $db;
}
function bgPolicy(): RulePolicy {
    $raw = ['schema_version' => FieldCatalog::VERSION, 'fields' => FieldCatalog::definitions()];
    $grants = (new P1SourcePurposePolicy())->sourceGrants((new P1FieldCatalogAdapter(fn() => $raw))->read());
    $p = PolicyFixtures::parameters();
    $p['bindings'] = ['topics' => $grants['interest'], 'skills' => $grants['skill'], 'offers' => $grants['event_role'], 'headline' => $grants['headline']];
    $p['rules'] = array_slice($p['rules'], 0, 3);
    return new RulePolicy('synthetic-integrated-batch-policy', $p);
}
function bgChain(CountingConnection $db, ?MutableSelection $selection = null): array {
    $events = NF::events($db, $selection);
    $context = $events->resolve(1);
    $p1 = new DiscoveryProfileBatchReader(new SqlDiscoveryProfileBatchSource($db));
    $p8 = new DiscoveryBatchService(new NativeDiscoveryRelations($db), [$p1, 'read']);
    $reader = new P1CandidateProjectionReader($events, new P1FieldCatalogAdapter(fn() => ['schema_version' => FieldCatalog::VERSION, 'fields' => FieldCatalog::definitions()]), bgPolicy(), [$p8, 'read']);
    $db->selects = [];
    return [$reader, $context, $p8];
}

$db = bgDatabase(); [$reader, $context] = bgChain($db);
$out = $reader->read(new CandidateRequest($context, 'person', ['2', '3']));
bgVerify(count($out) === 2 && $out[0]->features['skills']['value'] === ['php'] && $out[0]->features['offers']['value'] === ['developer'], 'P1 SQL through P8 authorization reaches the recommendation mapper');
bgVerify($out[0]->features['headline']['value'] === 'Synthetic headline 2', 'explicitly configured confirmed native value reaches its logical feature');
bgVerify($out[0]->versions->scopes['global'] === ['revision' => 3, 'permission_version' => 2] && $out[0]->versions->scopes['space:7'] === ['revision' => 5, 'permission_version' => 4] && $out[0]->versions->identityVersion === 7, 'scope and identity versions survive every module boundary');
bgVerify(!str_contains(json_encode($out), 'SYNTHETIC_PRIVATE_PHONE') && !str_contains(json_encode($out), 'SYNTHETIC_IDENTITY'), 'native private and identity fixture sentinels never enter recommendation output');
bgVerify(count($db->selects) === 14, 'integrated read includes 12 P1/P8 SELECTs and two current-activity checks');
$intent = new QueryIntent('person', [
    ['feature' => 'topics', 'operator' => 'similarity', 'value' => ['social'], 'strength' => 'soft', 'origin' => 'user_confirmed'],
    ['feature' => 'needs', 'operator' => 'supply_demand', 'value' => ['developer'], 'strength' => 'soft', 'origin' => 'user_confirmed'],
]);
$assessment = (new DeterministicRuleEvaluator())->evaluate($context, $intent, $out[0], bgPolicy(), ['structured' => 1]);
bgVerify($assessment->qualifies && $assessment->sortScore > 0 && count($assessment->reasons) >= 2, 'authorized live-shaped projection supports both similarity and contribution scoring with reasons');
bgVerify(count($db->selects) === 14, 'rule evaluation adds no database or model dependency');
foreach ($db->selects as $read) { bgVerify($read['master'] && $read['cache_disabled'] && !$read['logging'] && !$read['profiling'], 'every integrated SELECT uses current master without cache or SQL logging'); }

$db = bgDatabase(); PF::attribute($db, 2, 'global', 'contact_phone', 'SYNTHETIC_PRIVATE_PHONE');
$db->createCommand()->update('matcher_profile_attribute', ['visibility' => 'friends'], ['state_id' => '2-global', 'field_key' => 'skill'])->execute();
$db->createCommand()->update('matcher_profile_attribute', ['confirmation' => 'pending'], ['state_id' => '2-global', 'field_key' => 'headline'])->execute();
NF::friend($db, 1, 2); NF::friend($db, 2, 1);
[$reader, $context] = bgChain($db); $out = $reader->read(new CandidateRequest($context, 'person', ['2']));
bgVerify(count($out) === 1 && in_array('skills', $out[0]->unknownFeatures, true) && in_array('headline', $out[0]->unknownFeatures, true) && isset($out[0]->features['topics']), 'friendship never admits friends-only or unconfirmed values into discovery');
$hard = new QueryIntent('person', [['feature' => 'skills', 'operator' => 'similarity', 'value' => ['php'], 'strength' => 'hard', 'origin' => 'user_confirmed']]);
$assessment = (new DeterministicRuleEvaluator())->evaluate($context, $hard, $out[0], bgPolicy(), ['structured' => 1]);
bgVerify(!$assessment->qualifies && $assessment->diagnostics->hardConflicts !== [], 'hidden capability cannot satisfy a hard condition or be inferred from friendship');

foreach ([
    'other_space' => fn($db) => $db->createCommand()->update('space_membership', ['space_id' => 8], ['user_id' => 2])->execute(),
    'invited' => fn($db) => $db->createCommand()->update('space_membership', ['status' => 1], ['user_id' => 2])->execute(),
    'disabled' => fn($db) => $db->createCommand()->update('user', ['status' => 0], ['id' => 2])->execute(),
    'reverse_block' => fn($db) => NF::block($db, 10002, 1),
    'space_block' => fn($db) => NF::block($db, 1007, 2),
] as $name => $change) {
    $db = bgDatabase(); $change($db); [$reader, $context] = bgChain($db);
    bgVerify($reader->read(new CandidateRequest($context, 'person', ['2'])) === [], 'ineligible candidate omitted without backfill: ' . $name);
}

$db = bgDatabase(); $db->createCommand()->delete('matcher_profile_state', ['user_id' => 2])->execute(); [$reader, $context] = bgChain($db);
$out = $reader->read(new CandidateRequest($context, 'person', ['2']));
bgVerify(count($out) === 1 && $out[0]->features === [] && $out[0]->versions->identityVersion === 0, 'missing profile state yields unknown features rather than excluding an eligible account');

$db = bgDatabase(); [$reader, $context] = bgChain($db);
$first = $reader->read(new CandidateRequest($context, 'person', ['2']));
$db->createCommand()->update('matcher_profile_attribute', ['visibility' => 'private'], ['state_id' => '2-global', 'field_key' => 'skill'])->execute();
$db->createCommand()->update('matcher_profile_state', ['permission_version' => 3, 'identity_version' => 8], ['id' => '2-global'])->execute();
$next = $reader->read(new CandidateRequest($context, 'person', ['2']));
bgVerify(isset($first[0]->features['skills']) && !isset($next[0]->features['skills']) && $next[0]->versions->scopes['global']['permission_version'] === 3 && $next[0]->versions->identityVersion === 8, 'next read honors committed visibility and independent identity changes without a TTL');

$db = bgDatabase(); [$reader, $context] = bgChain($db);
$db->onSelect = static function ($db, int $n): void {
    if ($n === 7) { $db->createCommand()->update('matcher_profile_state', ['permission_version' => 20], ['id' => '2-global'])->execute(); }
};
bgReject(fn() => $reader->read(new CandidateRequest($context, 'person', ['2'])), 'permission change during middle eligibility check invalidates stale source snapshot', 'PROFILE_BATCH_CHANGED');

foreach (['reverse_block', 'left_space'] as $change) {
    $db = bgDatabase(); [$reader, $context] = bgChain($db);
    $db->onSelect = static function ($db, int $n) use ($change): void {
        if ($n === 10) {
            if ($change === 'reverse_block') { NF::block($db, 10002, 1); }
            else { $db->createCommand()->delete('space_membership', ['user_id' => 2])->execute(); }
        }
    };
    bgVerify($reader->read(new CandidateRequest($context, 'person', ['2'])) === [], 'final candidate gate catches source2-time change: ' . $change);
}

$db = bgDatabase(); $selection = new MutableSelection(); [$reader, $context] = bgChain($db, $selection);
$db->onSelect = static function ($db, int $n) use ($selection): void { if ($n === 10) { $selection->value['space_id'] = 8; $selection->value['selection_revision'] = 'synthetic-switched'; } };
bgReject(fn() => $reader->read(new CandidateRequest($context, 'person', ['2'])), 'server-selected Space change during sources rejects result');

$db = bgDatabase(); [$reader, $context] = bgChain($db); $db->createCommand('DROP TABLE matcher_profile_attribute')->execute();
bgReject(fn() => $reader->read(new CandidateRequest($context, 'person', ['2'])), 'missing profile database dependency is an error, never an empty success', 'PROFILE_DEPENDENCY_UNAVAILABLE');

$db = bgDatabase(); [$reader, $context] = bgChain($db); $tx = $db->beginTransaction();
bgReject(fn() => $reader->read(new CandidateRequest($context, 'person', ['2'])), 'old transaction cannot be used as current authorization');
bgVerify($tx->isActive, 'caller transaction is not committed or rolled back by the bridge'); $tx->rollBack();

foreach ([1, 30, 200] as $size) {
    $db = bgDatabase($size); [$reader, $context] = bgChain($db);
    $out = $reader->read(new CandidateRequest($context, 'person', array_map('strval', range(2, $size + 1))));
    $queries[(string)$size] = count($db->selects);
    bgVerify(count($out) === $size && count($db->selects) === 14, $size . ' candidates use a fixed 14 SELECTs in the whole projection chain');
}
$db = bgDatabase(400); [$reader, $context] = bgChain($db);
$out = $reader->read(new CandidateRequest($context, 'person', array_map('strval', range(202, 401))));
bgVerify(count($out) === 200 && $out[0]->targetId === '202' && $out[199]->targetId === '401' && count($db->selects) === 14, '400-person activity projects the requested later 200, not the first registered candidates');

echo json_encode(['status' => 'passed', 'scope' => 'Real P1 SQL/P8 native authorization/recommendation mapper on new synthetic SQLite memory tables; no production index, HTTP, existing DB or model.', 'passed' => count($checks), 'query_counts' => $queries, 'checks' => $checks], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
