<?php
declare(strict_types=1);
$backend = dirname(__DIR__, 5);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
require dirname(__DIR__) . '/support/autoload.php';
require dirname(__DIR__) . '/native_access/Fixtures.php';
$modules = dirname(__DIR__, 3);
spl_autoload_register(static function (string $class) use ($modules): void {
    foreach (['matcherProfile' => 'matcher-user-profile', 'matcherPrivacy' => 'matcher-profile-privacy'] as $ns => $dir) {
        $prefix = 'humhub' . chr(92) . 'modules' . chr(92) . $ns . chr(92);
        if (str_starts_with($class, $prefix)) {
            $path = $modules . '/' . $dir . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php';
            if (is_file($path)) { require_once $path; }
        }
    }
});
require_once $modules . '/matcher-user-profile/tests/discovery_batch/Fixtures.php';
require __DIR__ . '/Fixtures.php';

use humhub\modules\matcherRecommendation\tests\live_recall\{Fixtures as F, MemoryPolicies};
use humhub\modules\matcherRecommendation\tests\native_access\{Fixtures as NF, MutableSelection};
use humhub\modules\matcherRecommendation\contracts\QueryIntent;
use humhub\modules\matcherRecommendation\adapters\index\CandidateIndexException;
use humhub\modules\matcherRecommendation\domain\RulePolicy;

$checks = []; $observations = [];
function lrCheck(bool $value, string $name): void { global $checks; if (!$value) { throw new RuntimeException('FAIL: ' . $name); } $checks[] = $name; }
function lrReject(callable $run, string $name, ?string $reason = null): void {
    try { $run(); } catch (Throwable $e) {
        lrCheck($reason === null || ($e instanceof CandidateIndexException && $e->reason === $reason), $name);
        return;
    }
    lrCheck(false, $name);
}
function lrCondition(string $feature, string $operator, mixed $value, string $strength = 'soft'): array {
    return ['feature' => $feature, 'operator' => $operator, 'value' => $value, 'strength' => $strength, 'origin' => 'user_confirmed'];
}
function lrTopic(string $value = 'social'): QueryIntent { return new QueryIntent('person', [lrCondition('topics', 'similarity', [$value])]); }
function lrIds($result): array { return array_map(fn($item) => $item->candidate->targetId, $result->items); }

foreach ([0, 1, 30, 35, 40, 300, 400] as $size) {
    $db = F::database($size); [$factory, $policies, $batches] = F::factory($db);
    $service = $factory->create(1, 7); $db->selects = []; $start = hrtime(true);
    $result = $service->execute(1, lrTopic(), 7);
    $duration = (hrtime(true) - $start) / 1e6;
    $observations[(string)$size] = ['subjects' => $size, 'selects' => count($db->selects), 'returned' => count($result->items), 'elapsed_ms' => round($duration, 3), 'php_peak_bytes' => memory_get_peak_usage(true)];
    lrCheck(count($result->items) === min($size, 24), $size . '-person complete authorized rule run returns bounded actual matches');
    lrCheck(!in_array('1', lrIds($result), true), $size . '-person run never recommends self');
    lrCheck(F::clean($db), $size . '-person run releases both request index tables');
    lrCheck(count($batches->rows) === 1, $size . '-person run records one IDs/versions-only batch');
    foreach ($result->items as $item) {
        lrCheck($item->assessment->qualifies && $item->assessment->reasons !== [], 'published match has current evidence and rule reasons');
    }
}

$db = F::database(400);
for ($id = 2; $id <= 400; $id++) { F::topic($db, $id, 'unrelated'); }
[$factory] = F::factory($db); $result = $factory->create(1, 7)->execute(1, lrTopic(), 7);
lrCheck(lrIds($result) === ['401'], 'late qualifying person in a 400-person activity is not lost to first-200 truncation');
lrCheck(F::clean($db), 'late-person run releases index');

$db = F::database(35);
for ($id = 4; $id <= 36; $id++) { $db->createCommand()->delete('matcher_profile_state', ['user_id' => $id])->execute(); }
[$factory] = F::factory($db); $result = $factory->create(1)->execute(1, lrTopic());
lrCheck(lrIds($result) === ['2', '3'], '35-person activity with two evidenced people returns two without padding');

$db = F::database(35); [$factory] = F::factory($db);
$intent = new QueryIntent('person', [lrCondition('topics', 'similarity', ['social']), lrCondition('skills', 'similarity', ['missing-skill'], 'hard')]);
$result = $factory->create(1)->execute(1, $intent);
lrCheck($result->items === [] && F::clean($db), 'all hard failures remain empty with no relaxation');

$db = F::database(40); F::time($db, 2, '2026-11-11T10:00:00+08:00', '2026-11-11T10:20:00+08:00');
F::time($db, 41, '2026-11-11T10:00:00+08:00', '2026-11-11T10:30:00+08:00', 'first');
F::time($db, 41, '2026-11-11T10:30:00+08:00', '2026-11-11T11:00:00+08:00', 'second');
[$factory] = F::factory($db);
$wanted = [['starts_at' => '2026-11-11T10:00:00+08:00', 'ends_at' => '2026-11-11T11:00:00+08:00']];
$intent = new QueryIntent('person', [lrCondition('topics', 'similarity', ['social']), lrCondition('availability', 'interval_overlap', $wanted, 'hard')]);
$result = $factory->create(1)->execute(1, $intent);
lrCheck(lrIds($result) === ['41'], 'hard interval uses full adjacent coverage before LIMIT and final rule evaluation');
lrCheck(F::clean($db), 'interval generation is cleaned');

$db = F::database(1); F::time($db, 2, '2026-11-11T10:00:00.123456+08:00', '2026-11-11T11:00:00.654321+08:00');
[$factory] = F::factory($db);
$intent = new QueryIntent('person', [lrCondition('topics', 'similarity', ['social']), lrCondition('availability', 'interval_overlap', [['starts_at' => '2026-11-11T10:00:00.123456+08:00', 'ends_at' => '2026-11-11T11:00:00.654321+08:00']], 'hard')]);
$result = $factory->create(1)->execute(1, $intent);
lrCheck(lrIds($result) === ['2'] && F::clean($db), 'subsecond availability survives publication SQL and final evaluator consistently');

$db = F::database(3); NF::block($db, 10002, 1);
$db->createCommand()->update('space_membership', ['space_id' => 8], ['user_id' => 3])->execute();
$db->createCommand()->update('matcher_profile_attribute', ['visibility' => 'private'], ['state_id' => '4-global', 'field_key' => 'interest'])->execute();
[$factory] = F::factory($db); $result = $factory->create(1)->execute(1, lrTopic());
lrCheck($result->items === [] && F::clean($db), 'blocks other activities and private topics never become index matches');

$db = F::database(3); NF::friend($db, 1, 2); NF::friend($db, 2, 1); NF::friend($db, 1, 3);
[$factory] = F::factory($db); $result = $factory->create(1)->execute(1, lrTopic());
$relations = []; foreach ($result->items as $item) { $relations[$item->candidate->targetId] = $item->relationship; }
lrCheck($relations[2]['friend'] && $relations[3]['pending_out'] && count($result->items) === 3, 'ordinary rules retain friends and pending with current relationship facts');

$db = F::database(3); $policies = new MemoryPolicies(F::policy()); [$factory] = F::factory($db, $policies);
$service = $factory->create(1); $policies->policy = new RulePolicy('synthetic-policy-v2', F::policy()->parameters);
lrReject(fn() => $service->execute(1, lrTopic()), 'policy changed after composition cannot use old projection bindings');
lrCheck(F::clean($db), 'policy failure leaves no index generation');

$db = F::database(3); $selection = new MutableSelection(); [$factory] = F::factory($db, selection: $selection);
$service = $factory->create(1); $selection->value['space_id'] = 8; $selection->value['selection_revision'] = 'synthetic-new-selection';
lrReject(fn() => $service->execute(1, lrTopic()), 'old composed run cannot follow a changed activity selection');
lrCheck(F::clean($db), 'selection mismatch leaves no published generation');

$db = F::database(40); [$factory] = F::factory($db, capacity: 30);
lrReject(fn() => $factory->create(1)->execute(1, lrTopic()), 'construction capacity overflow is explicit instead of a truncated successful pool', 'capacity_exceeded');
lrCheck(F::clean($db), 'capacity failure creates no derived terms');

$db = F::database(3); [$factory, $policies, $batches] = F::factory($db); $service = $factory->create(1);
$db->createCommand('DROP TABLE matcher_profile_attribute')->execute();
lrReject(fn() => $service->execute(1, lrTopic()), 'missing source service fails explicitly instead of publishing an empty successful batch', 'dependency_unavailable');
lrCheck($batches->rows === [] && F::clean($db), 'source failure creates neither a discovery batch nor a leftover generation');

// A candidate outside the eventual top 80 still participates in post-recall source validation.
$db = F::database(300); [$factory] = F::factory($db); $service = $factory->create(1);
$changed = false;
$db->onSelect = static function ($db, int $n) use (&$changed): void {
    $sql = $db->selects[$n - 1]['sql'];
    if (!$changed && str_contains($sql, 'matched_terms')) {
        $changed = true;
        $db->createCommand()->update('matcher_profile_attribute', ['visibility' => 'private'], ['state_id' => '301-global', 'field_key' => 'interest'])->execute();
        $db->createCommand()->update('matcher_profile_state', ['permission_version' => 999], ['id' => '301-global'])->execute();
    }
};
lrReject(fn() => $service->execute(1, lrTopic()), 'unrecalled-person revocation invalidates the whole generation', 'source_changed');
lrCheck($changed && F::clean($db), 'stale-generation failure releases derived rows');

// Execute actual migration classes only against a fresh synthetic database, preserving foreign tables.
$db = F::database(1);
require dirname(__DIR__, 2) . '/migrations/m261111_000001_candidate_index.php';
require dirname(__DIR__, 2) . '/migrations/m261111_000002_current_event_selection.php';
$indexMigration = new m261111_000001_candidate_index(['db' => $db]);
$selectionMigration = new m261111_000002_current_event_selection(['db' => $db]);
$indexMigration->down(); $selectionMigration->down();
lrCheck($db->schema->getTableSchema('matcher_recommendation_search_term', true) === null && $db->schema->getTableSchema('matcher_recommendation_current_selection', true) === null, 'actual down migrations remove only own derived index and selection tables');
lrCheck((int)$db->createCommand('SELECT COUNT(*) FROM user')->queryScalar() === 2 && (int)$db->createCommand('SELECT COUNT(*) FROM matcher_profile_state')->queryScalar() === 4, 'migration rollback preserves native users and P1 states');
$indexMigration->up(); $selectionMigration->up();
lrCheck(F::clean($db) && $db->schema->getTableSchema('matcher_recommendation_current_selection', true) !== null, 'actual migrations reinstall an empty isolated recommendation schema');

echo json_encode(['status' => 'passed', 'scope' => 'New SQLite synthetic databases; real SQL current selection/P1/P8/authorized index/SQL recall/projection/relations/rule application and migration roundtrip. Authenticated identity, policy publication, batch store and clock are explicit test-only adapters. No existing database, HTTP deployment, AI or network.', 'passed' => count($checks), 'observations' => $observations, 'checks' => $checks], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
