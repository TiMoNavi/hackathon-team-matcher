<?php
declare(strict_types=1);
$backend = dirname(__DIR__, 5);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
require dirname(__DIR__) . '/support/autoload.php';
require dirname(__DIR__) . '/native_access/Fixtures.php';
require dirname(__DIR__) . '/index/Fixtures.php';

use humhub\modules\matcherRecommendation\adapters\index\{CandidateIndexException, CandidateIndexSchema, CandidateIndexLifecycleSchema, IndexLeaseTime, SqlCandidateIndexAccess, SqlCandidateIndexCleanup};
use humhub\modules\matcherRecommendation\adapters\native\NativeEligibilityQuery;
use humhub\modules\matcherRecommendation\adapters\time\SystemClock;
use humhub\modules\matcherRecommendation\contracts\ports\Clock;
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\tests\index\{MutablePolicies, MutableProjectionReader};
use humhub\modules\matcherRecommendation\tests\native_access\Fixtures as NF;
use humhub\modules\matcherRecommendation\tests\policy\Fixtures as PF;

final class LeaseClock implements Clock
{
    public DateTimeImmutable $value;
    public function __construct() { $this->value = new DateTimeImmutable('2026-11-11T02:00:00.123456Z'); }
    public function now(): DateTimeImmutable { return $this->value; }
    public function move(string $difference): void { $this->value = $this->value->modify($difference); }
}
$checks = [];
function lcCheck(bool $condition, string $label): void { global $checks; if (!$condition) { throw new RuntimeException('FAIL: ' . $label); } $checks[] = $label; }
function lcReject(callable $call, string $label, string $reason): void {
    try { $call(); } catch (CandidateIndexException $error) {
        lcCheck($error->reason === $reason && $error->getPrevious() === null && !str_contains((string)$error, 'synthetic-cleanup-private'), $label); return;
    }
    lcCheck(false, $label);
}
function lcSetup(int $seconds = 300): array {
    $db = NF::database(2); $db->schemaCache = null;
    CandidateIndexSchema::install($db); CandidateIndexLifecycleSchema::install($db);
    $events = NF::events($db); $context = $events->resolve(1); $clock = new LeaseClock();
    $policies = new MutablePolicies(new RulePolicy('synthetic-lease-policy', PF::parameters()));
    $profiles = new MutableProjectionReader();
    $index = new SqlCandidateIndexAccess($db, new NativeEligibilityQuery($db), $events, $profiles, $policies, 'synthetic-purpose', clock: $clock, leaseSeconds: $seconds);
    return [$db, $events, $context, $clock, $policies, $profiles, $index, new SqlCandidateIndexCleanup($db, $clock)];
}
function lcCount($db, string $table, ?string $generation = null): int {
    return (int)(new yii\db\Query())->from($table)->where($generation === null ? [] : ['generation' => $generation])->count('*', $db);
}
function lcEmpty($db): bool {
    return lcCount($db, CandidateIndexLifecycleSchema::TABLE) === 0 && lcCount($db, CandidateIndexSchema::TERM_TABLE) === 0 && lcCount($db, CandidateIndexSchema::INTERVAL_TABLE) === 0;
}

[$db, $events, $ctx, $clock, $policies, $profiles, $index, $cleanup] = lcSetup();
$snapshot = $index->acquire($ctx, $policies->policy);
$row = (new yii\db\Query())->from(CandidateIndexLifecycleSchema::TABLE)->one($db);
$created = IndexLeaseTime::microseconds($clock->now());
lcCheck((int)$row['created_at_us'] === $created && (int)$row['expires_at_us'] === $created + 300000000, 'generation deadline retains exact microseconds and configured 300 seconds');
lcCheck($cleanup->purgeExpired() === 0 && lcCount($db, CandidateIndexSchema::TERM_TABLE) > 0, 'cleanup preserves unexpired generation');
$clock->move('+299 seconds +999999 microseconds'); $index->assertCurrent($ctx, $policies->policy, $snapshot);
lcCheck($cleanup->purgeExpired() === 0, 'one microsecond before expiry remains usable and retained');
$clock->move('+1 microsecond');
lcReject(fn() => $index->assertCurrent($ctx, $policies->policy, $snapshot), 'exact expiry invalidates ongoing request', 'lease_expired');
lcCheck($cleanup->purgeExpired() === 1 && lcEmpty($db), 'exact expiry cleanup removes metadata and both child tables');
lcCheck($cleanup->purgeExpired() === 0, 'cleanup is repeatable without false counts');
$index->release($snapshot); $index->release($snapshot);
lcCheck(lcEmpty($db), 'normal release remains idempotent after cleanup wins');

[$db, $events, $ctx, $clock, $policies, $profiles, $index, $cleanup] = lcSetup(1);
$profiles->beforeRead = static function () use ($clock): void { $clock->move('+1 second'); };
lcReject(fn() => $index->acquire($ctx, $policies->policy), 'build deadline is checked before publication', 'lease_expired');
lcCheck(lcEmpty($db), 'expired build commits no metadata or partial rows');
$profiles->beforeRead = null; $snapshot = $index->acquire($ctx, $policies->policy);
$profiles->beforeRead = static function () use ($clock): void { $clock->move('+1 second'); };
lcReject(fn() => $index->assertCurrent($ctx, $policies->policy, $snapshot), 'expiry during complete source recheck is detected before return', 'lease_expired');
$index->release($snapshot); lcCheck(lcEmpty($db), 'deadline failure can be released normally');

foreach (['extend', 'missing', 'fractional'] as $mode) {
    [$db, $events, $ctx, $clock, $policies, $profiles, $index] = lcSetup();
    $snapshot = $index->acquire($ctx, $policies->policy);
    if ($mode === 'missing') { $db->createCommand()->delete(CandidateIndexLifecycleSchema::TABLE, ['generation' => $snapshot->generation])->execute(); }
    else { $db->createCommand()->update(CandidateIndexLifecycleSchema::TABLE, ['expires_at_us' => $mode === 'extend' ? IndexLeaseTime::microseconds($clock->now()) + 600000000 : '1.5'], ['generation' => $snapshot->generation])->execute(); }
    lcReject(fn() => $index->assertCurrent($ctx, $policies->policy, $snapshot), 'persisted lease alteration rejected: ' . $mode, 'snapshot_invalid');
    $index->release($snapshot); lcCheck(lcEmpty($db), 'altered lease still releasable: ' . $mode);
}

[$db, $events, $ctx, $clock, $policies, $profiles, $index] = lcSetup();
$snapshot = $index->acquire($ctx, $policies->policy); $clock->move('-1 microsecond');
lcReject(fn() => $index->assertCurrent($ctx, $policies->policy, $snapshot), 'clock before creation is not reusable authorization', 'snapshot_invalid');
$index->release($snapshot);

[$db, $events, $ctx, $clock, $policies, $profiles, $index, $cleanup] = lcSetup(1);
$old = [$index->acquire($ctx, $policies->policy), $index->acquire($ctx, $policies->policy), $index->acquire($ctx, $policies->policy)];
$clock->move('+1 second'); $live = $index->acquire($ctx, $policies->policy);
lcCheck($cleanup->purgeExpired(1) === 1 && lcCount($db, CandidateIndexLifecycleSchema::TABLE) === 3, 'bounded cleanup removes only one expired generation');
lcCheck((new SqlCandidateIndexCleanup($db, $clock))->purgeExpired(2) === 2, 'independent maintenance instance removes remaining expired metadata');
$index->assertCurrent($ctx, $policies->policy, $live);
lcCheck(lcCount($db, CandidateIndexLifecycleSchema::TABLE) === 1 && lcCount($db, CandidateIndexSchema::TERM_TABLE, $live->generation) > 0, 'cleanup never pads scope or deletes current unexpired generation');
foreach (array_merge($old, [$live]) as $snapshot) { $index->release($snapshot); }
lcCheck(lcEmpty($db), 'multiple release and maintenance paths converge to empty owned tables');

[$db, $events, $ctx, $clock, $policies, $profiles, $index, $cleanup] = lcSetup(1);
$snapshot = $index->acquire($ctx, $policies->policy); $clock->move('+1 second');
$db->getMasterPdo()->exec("CREATE TRIGGER refuse_cleanup BEFORE DELETE ON matcher_recommendation_search_term BEGIN SELECT RAISE(ABORT, 'synthetic-cleanup-private'); END");
lcReject(fn() => $cleanup->purgeExpired(), 'SQL failure is sanitized', 'dependency_unavailable');
lcCheck(lcCount($db, CandidateIndexLifecycleSchema::TABLE) === 1 && lcCount($db, CandidateIndexSchema::TERM_TABLE) > 0 && lcCount($db, CandidateIndexSchema::INTERVAL_TABLE) > 0, 'failed child delete restores claimed metadata in same transaction');
$db->createCommand('DROP TRIGGER refuse_cleanup')->execute();
lcCheck($cleanup->purgeExpired() === 1, 'failed generation can be retried successfully'); $index->release($snapshot);

[$db, $events, $ctx, $clock, $policies, $profiles, $index, $cleanup] = lcSetup();
$transaction = $db->beginTransaction();
lcReject(fn() => $cleanup->purgeExpired(), 'cleanup refuses caller transaction', 'transaction_unsupported');
lcCheck($transaction->isActive, 'caller transaction remains owned by caller'); $transaction->rollBack();
foreach ([0, 501] as $badLimit) {
    try { $cleanup->purgeExpired($badLimit); lcCheck(false, 'invalid cleanup budget rejected'); }
    catch (InvalidArgumentException) { lcCheck(true, 'invalid cleanup budget rejected: ' . $badLimit); }
}
$db->createCommand()->insert(CandidateIndexSchema::TERM_TABLE, ['generation' => 'legacy-untracked', 'space_id' => 7, 'target_id' => 2, 'route' => 'structured', 'feature' => 'topics', 'term' => hash('sha256', 'synthetic-legacy')])->execute();
lcCheck($cleanup->purgeExpired() === 0 && lcCount($db, CandidateIndexSchema::TERM_TABLE, 'legacy-untracked') === 1, 'untracked legacy rows are not assigned an invented age or silently deleted');
$db->createCommand()->delete(CandidateIndexSchema::TERM_TABLE)->execute();
CandidateIndexLifecycleSchema::remove($db);
lcReject(fn() => $index->acquire($ctx, $policies->policy), 'missing migration fails before committing derived rows', 'dependency_unavailable');
lcCheck(lcCount($db, CandidateIndexSchema::TERM_TABLE) === 0, 'missing lifecycle storage leaves no terms');
lcReject(fn() => $cleanup->purgeExpired(), 'missing cleanup schema is a dependency failure', 'dependency_unavailable');

require dirname(__DIR__, 2) . '/migrations/m261111_000004_index_generation_lifecycle.php';
$migration = new m261111_000004_index_generation_lifecycle(['db' => $db]); $migration->up();
lcCheck(lcCount($db, CandidateIndexLifecycleSchema::TABLE) === 0, 'actual migration installs empty metadata only');
$migration->down();
lcCheck((int)$db->createCommand('SELECT COUNT(*) FROM user')->queryScalar() === 3 && $db->schema->getTableSchema('matcher_recommendation_search_term', true) !== null, 'actual rollback preserves users and independently owned index schema');
$migration->up();
lcCheck(IndexLeaseTime::microseconds(new DateTimeImmutable('2026-11-11T10:00:00.123456+08:00')) === IndexLeaseTime::microseconds(new DateTimeImmutable('2026-11-11T02:00:00.123456Z')), 'lease conversion respects explicit timezone and microseconds');
lcReject(fn() => IndexLeaseTime::stored('99999999999999999999999'), 'overflowed stored deadline rejected without truncation', 'snapshot_invalid');
lcReject(fn() => IndexLeaseTime::stored(1.5), 'float deadline cannot be coerced to integer', 'snapshot_invalid');
$wallClock = new SystemClock(); lcCheck(abs($wallClock->now()->getTimestamp() - time()) <= 1, 'runtime clock supplies actual local system instant');
lcCheck((int)$db->createCommand('SELECT COUNT(*) FROM user')->queryScalar() === 3, 'maintenance never mutates native subjects');

echo json_encode(['status' => 'passed', 'scope' => 'Synthetic fresh SQLite only, fixed-deadline lifecycle and bounded cleanup. No scheduled worker, live DB or MySQL concurrency claim.', 'passed' => count($checks), 'checks' => $checks], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
