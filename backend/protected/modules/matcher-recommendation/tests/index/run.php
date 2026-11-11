<?php
declare(strict_types=1);
// Fresh synthetic SQLite only. No HumHub application boot, existing DB, network or production policy.
$backend = dirname(__DIR__, 5);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
require dirname(__DIR__) . '/support/autoload.php';
require dirname(__DIR__) . '/native_access/Fixtures.php';
require __DIR__ . '/Fixtures.php';

use humhub\modules\matcherRecommendation\adapters\index\{CandidateIndexException, CandidateIndexSchema, SqlCandidateIndexAccess};
use humhub\modules\matcherRecommendation\adapters\native\NativeEligibilityQuery;
use humhub\modules\matcherRecommendation\contracts\AuthorizedIndexSnapshot;
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\tests\index\{MutablePolicies, MutableProjectionReader};
use humhub\modules\matcherRecommendation\tests\native_access\{Fixtures as NF, MutableSelection};
use humhub\modules\matcherRecommendation\tests\policy\Fixtures as PF;
use yii\db\Query;

$checks = []; $batchCounts = [];
function ixVerify(bool $condition, string $label): void { global $checks; if (!$condition) { throw new RuntimeException('FAIL: ' . $label); } $checks[] = $label; }
function ixReject(callable $call, string $label, ?string $reason = null): void {
    try { $call(); } catch (Throwable $error) {
        ixVerify($error instanceof CandidateIndexException && ($reason === null || $error->reason === $reason) && $error->getPrevious() === null, $label); return;
    }
    ixVerify(false, $label);
}
function ixSetup(int $size = 3, int $maxSubjects = 2000, int $maxRows = 250000): array {
    $db = NF::database($size); $db->schemaCache = null; CandidateIndexSchema::install($db); \humhub\modules\matcherRecommendation\adapters\index\CandidateIndexLifecycleSchema::install($db);
    $selection = new MutableSelection(); $events = NF::events($db, $selection); $context = $events->resolve(1);
    $parameters = PF::parameters(); $parameters['rules'][1]['aliases'] = ['js' => 'javascript'];
    $policies = new MutablePolicies(new RulePolicy('synthetic-index-policy', $parameters));
    $reader = new MutableProjectionReader();
    $index = new SqlCandidateIndexAccess($db, new NativeEligibilityQuery($db), $events, $reader, $policies, 'synthetic-purpose-v1', $maxSubjects, $maxRows);
    $db->selects = [];
    return [$db, $context, $index, $reader, $policies, $selection];
}
function ixRows($db, string $table): array {
    $pdo = $db->getMasterPdo(); $stringify = $pdo->getAttribute(PDO::ATTR_STRINGIFY_FETCHES);
    try { $pdo->setAttribute(PDO::ATTR_STRINGIFY_FETCHES, false); return (new Query())->from($table)->all($db); }
    finally { $pdo->setAttribute(PDO::ATTR_STRINGIFY_FETCHES, $stringify); }
}
function ixEmpty($db): bool { return ixRows($db, CandidateIndexSchema::TERM_TABLE) === [] && ixRows($db, CandidateIndexSchema::INTERVAL_TABLE) === []; }

foreach ([1, 30, 200, 400] as $size) {
    [$db, $context, $index, $reader, $policies] = ixSetup($size);
    $snapshot = $index->acquire($context, $policies->policy);
    $acquireBatches = count($reader->batches);
    ixVerify($acquireBatches === (int)ceil($size / 200) && max(array_map('count', $reader->batches)) <= 200, $size . ' complete activity uses bounded projection batches');
    $terms = ixRows($db, CandidateIndexSchema::TERM_TABLE); $intervals = ixRows($db, CandidateIndexSchema::INTERVAL_TABLE);
    ixVerify(count(array_unique(array_column($terms, 'target_id'))) === $size && count($intervals) === $size, $size . ' whole roster is represented, including late registration IDs');
    ixVerify($snapshot->termEncoding === 'sha256' && count(array_filter($terms, fn($row) => preg_match('/^[a-f0-9]{64}$/D', $row['term']))) === count($terms), 'all ' . $size . '-person terms are fixed hashes, never copied profile text');
    $expected = hash('sha256', 'unique-' . ($size + 1));
    ixVerify(count(array_filter($terms, fn($row) => $row['term'] === $expected && (int)$row['target_id'] === $size + 1)) === 2, 'late candidate exact token available to both routes at size ' . $size);
    $skills = array_filter($terms, fn($row) => $row['feature'] === 'skills' && (int)$row['target_id'] === 2);
    ixVerify(count($skills) === 2 && count(array_unique(array_column($skills, 'term'))) === 1 && reset($skills)['term'] === hash('sha256', 'javascript'), 'aliases normalize once and deduplicate evidence per route at size ' . $size);
    $index->assertCurrent($context, $policies->policy, $snapshot);
    $batchCounts[(string)$size] = ['acquire' => $acquireBatches, 'acquire_and_recheck' => count($reader->batches)];
    ixVerify(count($reader->batches) === 2 * $acquireBatches, 'full source recheck repeats all batches at size ' . $size);
    $index->release($snapshot); $index->release($snapshot);
    ixVerify(ixEmpty($db), 'release removes both derived tables and is idempotent at size ' . $size);
    ixReject(fn() => $index->assertCurrent($context, $policies->policy, $snapshot), 'released generation cannot authorize reuse at size ' . $size, 'snapshot_invalid');
}

[$db, $context, $index, $reader, $policies] = ixSetup(1);
$snapshot = $index->acquire($context, $policies->policy);
$row = ixRows($db, CandidateIndexSchema::INTERVAL_TABLE)[0];
ixVerify((float)$row['starts_at'] === (float)(new DateTimeImmutable('2026-11-11T02:00:00.000001Z'))->format('U.u') && (float)$row['ends_at'] === (float)(new DateTimeImmutable('2026-11-11T04:00:00.000002Z'))->format('U.u'), 'timezone conversion, microseconds and touching interval union match evaluator');
$forged = new AuthorizedIndexSnapshot($snapshot->generation, $snapshot->spaceId, $snapshot->contextFingerprint, $snapshot->policyFingerprint, $snapshot->sourcePurposeVersion, 'sha256');
ixReject(fn() => $index->assertCurrent($context, $policies->policy, $forged), 'copied DTO is not provider-issued authorization', 'snapshot_invalid');
ixReject(fn() => $index->release($forged), 'copied DTO cannot delete another request index', 'snapshot_invalid');
$other = new SqlCandidateIndexAccess($db, new NativeEligibilityQuery($db), NF::events($db), $reader, $policies, 'synthetic-purpose-v1');
ixReject(fn() => $other->assertCurrent($context, $policies->policy, $snapshot), 'different provider cannot replay an issued generation', 'snapshot_invalid');
$cross = new \humhub\modules\matcherRecommendation\contracts\CurrentEventContext(2, 7, $context->accessVersion, $context->policyVersion);
ixReject(fn() => $index->assertCurrent($cross, $policies->policy, $snapshot), 'different viewer cannot replay generation', 'snapshot_invalid');
ixVerify(!ixEmpty($db), 'failed forgery attempts leave the owner generation intact');
$index->release($snapshot);

[$db, $context, $index, $reader, $policies] = ixSetup(1);
$long = str_repeat('SYNTHETIC_CONFIRMED_PUBLIC_TEXT ', 300);
$reader->overrides['2'] = ['topics' => $long];
$snapshot = $index->acquire($context, $policies->policy);
$serialized = json_encode(ixRows($db, CandidateIndexSchema::TERM_TABLE), JSON_THROW_ON_ERROR);
ixVerify(!str_contains($serialized, 'SYNTHETIC_CONFIRMED_PUBLIC_TEXT') && count(ixRows($db, CandidateIndexSchema::TERM_TABLE)) === 2, 'long confirmed text remains one exact hashed term per route without copied prose or token truncation');
$index->assertCurrent($context, $policies->policy, $snapshot); $index->release($snapshot);

[$db, $context, $index, $reader, $policies] = ixSetup(1);
$reader->overrides['2'] = ['availability' => [
    ['starts_at' => '2026-11-11T02:00:00.123456Z', 'ends_at' => '2026-11-11T03:00:00.123456Z'],
    ['starts_at' => '2026-11-11T03:00:00.123457Z', 'ends_at' => '2026-11-11T04:00:00.123456Z'],
]];
$snapshot = $index->acquire($context, $policies->policy);
$storedIntervals = ixRows($db, CandidateIndexSchema::INTERVAL_TABLE);
ixVerify(count($storedIntervals) === 2 && (float)$storedIntervals[0]['ends_at'] < (float)$storedIntervals[1]['starts_at'], 'one-microsecond gap survives publisher normalization and SQL round trip');
$fetchSetting = $db->getMasterPdo()->getAttribute(PDO::ATTR_STRINGIFY_FETCHES);
$index->assertCurrent($context, $policies->policy, $snapshot);
ixVerify($db->getMasterPdo()->getAttribute(PDO::ATTR_STRINGIFY_FETCHES) === $fetchSetting, 'precise interval verification restores caller PDO fetch setting'); $index->release($snapshot);

foreach (['revision', 'permission_version', 'identity', 'policy', 'value', 'omission'] as $change) {
    [$db, $context, $index, $reader, $policies] = ixSetup(); $snapshot = $index->acquire($context, $policies->policy);
    if ($change === 'value') { $reader->overrides['2'] = ['topics' => ['changed-value-without-version']]; }
    elseif ($change === 'omission') { $reader->omitted = ['2']; }
    else { $reader->versions['2'] = ['revision' => 1, 'permission_version' => 1, 'identity' => 1, 'policy' => 'synthetic-privacy-v1']; $reader->versions['2'][$change] = $change === 'policy' ? 'synthetic-privacy-v2' : 2; }
    ixReject(fn() => $index->assertCurrent($context, $policies->policy, $snapshot), 'full projection recheck catches ' . $change, 'source_changed');
    $index->release($snapshot); ixVerify(ixEmpty($db), 'failed recheck can still release generation for ' . $change);
}

foreach (['member_removed', 'member_rejoined', 'reverse_block', 'space_block', 'disabled', 'new_member'] as $change) {
    [$db, $context, $index, $reader, $policies] = ixSetup(); $snapshot = $index->acquire($context, $policies->policy);
    if ($change === 'member_removed' || $change === 'member_rejoined') { $db->createCommand()->delete('space_membership', ['user_id' => 2])->execute(); if ($change === 'member_rejoined') { NF::member($db, 2); } }
    elseif ($change === 'reverse_block') { NF::block($db, 10002, 1); }
    elseif ($change === 'space_block') { NF::block($db, 1007, 2); }
    elseif ($change === 'disabled') { $db->createCommand()->update('user', ['status' => 0], ['id' => 2])->execute(); }
    else { NF::user($db, 99); NF::member($db, 99); }
    ixReject(fn() => $index->assertCurrent($context, $policies->policy, $snapshot), 'whole eligibility roster recheck catches ' . $change, 'source_changed');
    $index->release($snapshot);
}

[$db, $context, $index, $reader, $policies] = ixSetup(); $snapshot = $index->acquire($context, $policies->policy);
$oldPolicy = $policies->policy; $policies->policy = new RulePolicy('synthetic-policy-changed', $oldPolicy->parameters);
ixReject(fn() => $index->assertCurrent($context, $oldPolicy, $snapshot), 'policy service change invalidates generation', 'policy_changed'); $index->release($snapshot);

[$db, $context, $index, $reader, $policies, $selection] = ixSetup(); $snapshot = $index->acquire($context, $policies->policy);
$selection->value['space_id'] = 8; $selection->value['selection_revision'] = 'synthetic-changed';
ixReject(fn() => $index->assertCurrent($context, $policies->policy, $snapshot), 'server current activity change denies index use'); $index->release($snapshot);

[$db, $context, $index, $reader, $policies] = ixSetup(400);
$reader->beforeRead = static function ($reader, $request) use ($db): void { if (count($reader->batches) === 2) { $db->createCommand()->delete('space_membership', ['user_id' => 2])->execute(); } };
ixReject(fn() => $index->acquire($context, $policies->policy), 'membership change across build batches fails before publish', 'source_changed'); ixVerify(ixEmpty($db), 'changed roster never leaves partial generation');

[$db, $context, $index, $reader, $policies] = ixSetup(400);
$reader->beforeRead = static function ($reader): void { if (count($reader->batches) === 2) { throw new RuntimeException('SYNTHETIC_PRIVATE_SQL_TOKEN'); } };
ixReject(fn() => $index->acquire($context, $policies->policy), 'later source batch failure is redacted and never partial success', 'dependency_unavailable'); ixVerify(ixEmpty($db), 'later source failure leaves both tables empty');

[$db, $context, $index, $reader, $policies] = ixSetup(30, 29);
ixReject(fn() => $index->acquire($context, $policies->policy), 'complete-build capacity overflow is explicit', 'capacity_exceeded'); ixVerify($reader->batches === [] && ixEmpty($db), 'capacity rejection does not read first N profiles or publish truncated index');
[$db, $context, $index, $reader, $policies] = ixSetup(30, 2000, 1);
ixReject(fn() => $index->acquire($context, $policies->policy), 'derived row capacity overflow is explicit', 'capacity_exceeded'); ixVerify(ixEmpty($db), 'derived row overflow does not publish incomplete hard-predicate coverage');

foreach (['known', 'unknown'] as $sourceState) {
    [$db, $context, $index, $reader, $policies] = ixSetup(1);
    if ($sourceState === 'unknown') { $reader->overrides['2'] = ['topics' => ['social']]; }
    $reader->undeclaredFeatures = ['skills'];
    ixReject(fn() => $index->acquire($context, $policies->policy), 'truncated ' . $sourceState . ' bound feature declaration is rejected', 'invalid_projection');
    ixVerify(ixEmpty($db), 'incomplete ' . $sourceState . ' feature coverage never publishes a usable generation');
}

[$db, $context, $index, $reader, $policies] = ixSetup(1);
$reader->beforeRead = static function (): void { throw new RuntimeException('SYNTHETIC_PRIVATE_TRACE_TOKEN'); };
$oldIgnore = ini_set('zend.exception_ignore_args', '0');
try {
    $index->acquire($context, $policies->policy); ixVerify(false, 'raw failure must throw');
} catch (CandidateIndexException $error) {
    ixVerify(!str_contains((string)$error, 'SYNTHETIC_PRIVATE_TRACE_TOKEN') && $error->getPrevious() === null, 'original source error is absent from serialized public exception and chain when trace arguments enabled');
    $traceArgs = array_merge(...array_map(static fn(array $frame): array => $frame['args'] ?? [], $error->getTrace()));
    ixVerify(count(array_filter($traceArgs, static fn(mixed $arg): bool => $arg instanceof Throwable)) === 0, 'public error trace does not carry upstream Throwable as helper argument');
} finally { if ($oldIgnore !== false) { ini_set('zend.exception_ignore_args', $oldIgnore); } }

[$db, $context, $index, $reader, $policies] = ixSetup();
$db->getMasterPdo()->exec("CREATE TRIGGER synthetic_reject_interval BEFORE INSERT ON matcher_recommendation_search_interval BEGIN SELECT RAISE(ABORT, 'SYNTHETIC_PRIVATE_SQL_TOKEN'); END");
ixReject(fn() => $index->acquire($context, $policies->policy), 'failure after term writes is redacted', 'dependency_unavailable'); ixVerify(ixEmpty($db), 'failed interval publication rolls term writes back atomically');

foreach (['delete', 'inject'] as $tamper) {
    [$db, $context, $index, $reader, $policies] = ixSetup(); $snapshot = $index->acquire($context, $policies->policy);
    if ($tamper === 'delete') { $db->createCommand()->delete(CandidateIndexSchema::TERM_TABLE, ['generation' => $snapshot->generation, 'target_id' => 2])->execute(); }
    else { $db->createCommand()->insert(CandidateIndexSchema::TERM_TABLE, ['generation' => $snapshot->generation, 'space_id' => 7, 'target_id' => 9999, 'route' => 'structured', 'feature' => 'topics', 'term' => hash('sha256', 'injected')])->execute(); }
    ixReject(fn() => $index->assertCurrent($context, $policies->policy, $snapshot), 'published SQL integrity detects ' . $tamper, 'index_changed'); $index->release($snapshot);
}

[$db, $context, $index, $reader, $policies] = ixSetup(); $tx = $db->beginTransaction();
ixReject(fn() => $index->acquire($context, $policies->policy), 'existing transaction never supplies current authorization', 'transaction_unsupported'); ixVerify($tx->isActive, 'caller transaction remains owned by caller'); $tx->rollBack();

[$db, $context, $index, $reader, $policies] = ixSetup();
$db->createCommand()->dropTable(CandidateIndexSchema::INTERVAL_TABLE)->execute();
ixReject(fn() => $index->acquire($context, $policies->policy), 'missing installed index dependency is explicit and redacted', 'dependency_unavailable');
ixVerify(ixRows($db, CandidateIndexSchema::TERM_TABLE) === [], 'missing interval table cannot leave committed partial terms');

[$db, $context, $index, $reader, $policies] = ixSetup();
$original = $policies->policy->parameters;
$conflict = $original['rules'][1]; $conflict['id'] = 'synthetic-conflict'; $conflict['query_feature'] = 'different_skills'; $conflict['aliases'] = ['js' => 'typescript'];
$original['rules'][] = $conflict; $policies->policy = new RulePolicy('synthetic-conflicting-aliases', $original);
ixReject(fn() => $index->acquire($context, $policies->policy), 'same feature cannot silently use two alias normalizations', 'invalid_policy'); ixVerify(ixEmpty($db), 'invalid alias policy never publishes partial feature terms');

[$db, $context, $index, $reader, $policies] = ixSetup(0);
$snapshot = $index->acquire($context, $policies->policy); $index->assertCurrent($context, $policies->policy, $snapshot);
ixVerify($reader->batches === [] && ixEmpty($db), 'genuinely empty current activity succeeds without cross-activity backfill'); $index->release($snapshot);

[$db, $context, $index, $reader, $policies] = ixSetup();
$db->enableLogging = true; $db->enableProfiling = true; $db->selects = [];
$snapshot = $index->acquire($context, $policies->policy); $index->assertCurrent($context, $policies->policy, $snapshot); $index->release($snapshot);
ixVerify($db->enableLogging && $db->enableProfiling, 'index operations restore caller logging flags');
ixVerify($db->selects !== [] && count(array_filter($db->selects, fn($read) => $read['master'] && $read['cache_disabled'] && !$read['logging'] && !$read['profiling'])) === count($db->selects), 'all authorization and index reads use master without cache or SQL logging');

echo json_encode(['status' => 'passed', 'scope' => 'Real native SQL roster and recommendation index lifecycle on synthetic SQLite, with explicit test projection port; root integration tests cover P1/P8.', 'passed' => count($checks), 'projection_batch_counts' => $batchCounts, 'checks' => $checks], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
