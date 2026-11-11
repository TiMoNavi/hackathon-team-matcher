<?php
declare(strict_types=1);
$backend = dirname(__DIR__, 5);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
require_once dirname(__DIR__) . '/support/autoload.php';
require_once dirname(__DIR__) . '/native_access/Fixtures.php';

use humhub\modules\matcherRecommendation\adapters\native\{NativeEligibilityQuery, NativeAccessException};
use humhub\modules\matcherRecommendation\adapters\retrieval\SqlCandidateRetriever;
use humhub\modules\matcherRecommendation\contracts\{AuthorizedIndexSnapshot, CurrentEventContext, QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\{CandidateIndexAccess, PolicyStore};
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;
use humhub\modules\matcherRecommendation\tests\native_access\Fixtures as NativeFixtures;
use humhub\modules\matcherRecommendation\tests\policy\Fixtures as PolicyFixtures;

final class SyntheticPolicyStore implements PolicyStore
{
    public function __construct(public RulePolicy $policy) {}
    public function current(CurrentEventContext $context): RulePolicy { return $this->policy; }
}
class SyntheticIndexAccess implements CandidateIndexAccess
{
    public bool $available = true;
    public bool $current = true;
    public ?AuthorizedIndexSnapshot $override = null;
    public ?Closure $afterRead = null;
    public array $calls = [];
    public function acquire(CurrentEventContext $context, RulePolicy $policy): AuthorizedIndexSnapshot
    {
        $this->calls[] = 'acquire';
        if (!$this->available) { throw new RuntimeException('Synthetic upstream bulk discovery source unavailable.'); }
        return $this->override ?? new AuthorizedIndexSnapshot('synthetic-generation-1', $context->spaceId, Fingerprint::of($context), Fingerprint::of($policy), 'synthetic-source-purpose-1');
    }
    public function assertCurrent(CurrentEventContext $context, RulePolicy $policy, AuthorizedIndexSnapshot $snapshot): void
    {
        $this->calls[] = 'assertCurrent';
        if ($this->afterRead !== null) { ($this->afterRead)(); }
        if (!$this->current) { throw new RuntimeException('Synthetic authorized source epoch changed.'); }
    }
}
$checks = [];
function verify(bool $value, string $name): void { global $checks; if (!$value) { throw new RuntimeException('FAIL: ' . $name); } $checks[] = $name; }
function rejects(callable $call, string $name): void
{
    try { $call(); } catch (RuntimeException | InvalidArgumentException | UnexpectedValueException $error) { verify(true, $name); return; }
    verify(false, $name);
}
function setup(int $size = 4): array
{
    $db = NativeFixtures::database($size);
    // Test-owned memory schema only. Lifecycle authorization is synthetic in this suite.
    $db->createCommand('CREATE TABLE matcher_recommendation_search_term (generation TEXT NOT NULL, space_id INTEGER NOT NULL, target_id INTEGER NOT NULL, route TEXT NOT NULL, feature TEXT NOT NULL, term TEXT NOT NULL)')->execute();
    $db->createCommand('CREATE INDEX synthetic_recall_terms ON matcher_recommendation_search_term (space_id,generation,route,feature,term,target_id)')->execute();
    $events = NativeFixtures::events($db); $context = $events->resolve(1);
    $policies = new SyntheticPolicyStore(PolicyFixtures::policy()); $gate = new SyntheticIndexAccess();
    $retriever = new SqlCandidateRetriever(new NativeEligibilityQuery($db), $events, $policies, new DeterministicRuleEvaluator(), $gate);
    return [$db, $context, $policies, $gate, $retriever];
}
function term($db, int $id, string $value, string $feature = 'topics', string $route = 'structured', int $space = 7, string $generation = 'synthetic-generation-1'): void
{
    $db->createCommand()->insert('matcher_recommendation_search_term', ['generation' => $generation, 'space_id' => $space, 'target_id' => $id, 'route' => $route, 'feature' => $feature, 'term' => $value])->execute();
}
function condition(string $feature, string $operator, mixed $value, string $strength = 'soft'): array
{
    return ['feature' => $feature, 'operator' => $operator, 'value' => $value, 'strength' => $strength, 'origin' => 'user_confirmed'];
}
function query(array $values = ['robotics']): QueryIntent { return new QueryIntent('person', [condition('topics', 'similarity', $values)]); }
function lowLimit(SyntheticPolicyStore $store): void
{
    $p = PolicyFixtures::parameters();
    $p['limits']['recall'] = $p['limits']['model_candidates'] = $p['limits']['final_results'] = $p['selection']['max_results'] = 1;
    $store->policy = new RulePolicy('synthetic-low-limit', $p);
}

$counts = [];
foreach ([30, 35, 40, 300, 400] as $size) {
    [$db, $context, $policies, $gate, $retriever] = setup($size);
    for ($id = 2; $id <= $size + 1; $id++) {
        term($db, $id, 'robotics');
        if ($id > $size - 39) { term($db, $id, 'robotics', route: 'fulltext'); }
    }
    term($db, $size + 1, 'education');
    $db->selects = [];
    $rows = $retriever->recall($context, query(['robotics', 'education']));
    $routeCounts = ['structured' => 0, 'fulltext' => 0]; $ranksBounded = true;
    foreach ($rows as $row) { foreach ($row['routes'] as $route => $rank) { $routeCounts[$route]++; $ranksBounded = $ranksBounded && $rank >= 1 && $rank <= ($route === 'structured' ? 80 : 40); } }
    verify($ranksBounded, $size . ' pool all route ranks are one-based and bounded');
    $counts[$size] = ['selects' => count($db->selects), 'returned' => count($rows), 'routes' => $routeCounts];
    verify(count($db->selects) === 4, $size . ' pool uses two bounded recall SQLs plus two current-access checks');
    verify($routeCounts['structured'] <= 80 && $routeCounts['fulltext'] <= 40 && count($rows) <= 200, $size . ' pool obeys route and aggregate budgets');
    verify(in_array((string)($size + 1), array_column($rows, 'id'), true), $size . ' pool ranks a relevant late ID before limiting instead of truncating earliest members');
    verify(count(array_unique(array_column($rows, 'id'))) === count($rows), $size . ' pool merges route hits without duplicate people');
    verify($gate->calls === ['acquire', 'assertCurrent'], $size . ' pool requires index authorization before and after SQL');
    verify(array_reduce($db->selects, static fn(bool $ok, array $entry): bool => $ok && $entry['master'] && $entry['cache_disabled'], true), $size . ' pool never uses cached or replica authorization');
}

[$db, $context, $policies, $gate, $retriever] = setup();
term($db, 2, 'social'); term($db, 2, 'social'); term($db, 2, 'social');
term($db, 3, 'social'); term($db, 3, 'education'); lowLimit($policies);
verify(array_column($retriever->recall($context, query(['social', 'education'])), 'id') === ['3'], 'duplicate index facts cannot outrank two distinct matches');
NativeFixtures::member($db, 2);
verify(array_column($retriever->recall($context, query(['social', 'education'])), 'id') === ['3'], 'duplicate native joins cannot inflate recall relevance');

[$db, $context, $policies, $gate, $retriever] = setup();
term($db, 2, 'social'); term($db, 2, 'education'); term($db, 3, 'social'); term($db, 3, 'backend', 'offers'); lowLimit($policies);
$hard = new QueryIntent('person', [condition('topics', 'similarity', ['social', 'education']), condition('needs', 'supply_demand', ['backend'], 'hard')]);
verify(array_column($retriever->recall($context, $hard), 'id') === ['3'], 'hard willingness is applied before route limit and preserves a qualified candidate');
$all = new QueryIntent('person', [condition('topics', 'similarity', ['social', 'education'], 'hard')]);
verify(array_column($retriever->recall($context, $all), 'id') === ['2'], 'hard similarity requires every explicit token before limit');
$none = new QueryIntent('person', [condition('needs', 'supply_demand', ['backend', 'commercial'], 'hard')]);
verify($retriever->recall($context, $none) === [], 'unknown additional hard contribution is not assumed satisfied');
term($db, 3, 'async', 'preferences');
$style = new QueryIntent('person', [condition('topics', 'similarity', ['social']), condition('preferences', 'explicit_preference', ['async', 'sync'], 'hard')]);
verify(array_column($retriever->recall($context, $style), 'id') === ['3'], 'explicit hard preference uses acceptable alternatives and is checked before limit');
$soft = new QueryIntent('person', [condition('topics', 'similarity', ['social']), condition('needs', 'supply_demand', ['commercial'])]);
$policies->policy = PolicyFixtures::policy();
verify(count($retriever->recall($context, $soft)) === 2, 'missing soft contribution does not become an AND filter');

[$db, $context, $policies, $gate, $retriever] = setup();
foreach ([1, 2, 3, 4, 5] as $id) { term($db, $id, 'robotics'); }
NativeFixtures::block($db, 10001, 2); NativeFixtures::block($db, 10003, 1); NativeFixtures::block($db, 1007, 4);
verify(array_column($retriever->recall($context, query()), 'id') === ['5'], 'self and all block directions are excluded inside recall SQL');
$db->createCommand()->update('user', ['visibility' => 3], ['id' => 5])->execute();
verify($retriever->recall($context, query()) === [], 'hidden candidate is not revived from an existing index');
[$db, $context, $policies, $gate, $retriever] = setup();
term($db, 2, 'robotics', space: 8); term($db, 3, 'robotics', generation: 'superseded-generation');
term($db, 4, 'robotics'); $db->createCommand()->delete('space_membership', ['user_id' => 4, 'space_id' => 7])->execute(); NativeFixtures::member($db, 4, 8);
verify($retriever->recall($context, query()) === [], 'cross-Space rows old generations and removed members cannot fill current recall');

[$db, $context, $policies, $gate, $retriever] = setup();
term($db, 2, 'robotics');
verify($retriever->recall($context, query(["robotics') OR 1=1 --"])) === [], 'query tokens remain bound SQL parameters');
$p = PolicyFixtures::parameters(); $p['rules'][0]['aliases'] = ['robots' => 'robotics']; $policies->policy = new RulePolicy('synthetic-alias', $p);
verify(array_column($retriever->recall($context, query([' ROBOTS '])), 'id') === ['2'], 'explicit aliases and normalization align with canonical index terms');
$p['rules'][3]['aliases'] = ['dev' => 'backend']; $policies->policy = new RulePolicy('synthetic-ambiguous-alias', $p);
rejects(fn() => $retriever->recall($context, query()), 'different rule aliases for one indexed feature are explicitly unsupported');
$policies->policy = PolicyFixtures::policy();
$interval = new QueryIntent('person', [condition('topics', 'similarity', ['robotics']), condition('availability', 'interval_overlap', [['starts_at' => '2026-11-11T10:00:00Z', 'ends_at' => '2026-11-11T11:00:00Z']], 'hard')]);
rejects(fn() => $retriever->recall($context, $interval), 'missing authorized hard-interval index fails explicitly instead of returning false empty matches');
$p = PolicyFixtures::parameters(); $p['enabled_routes'][] = 'semantic'; $policies->policy = new RulePolicy('synthetic-semantic', $p);
rejects(fn() => $retriever->recall($context, query()), 'semantic configuration cannot silently substitute an absent provider');
$policies->policy = PolicyFixtures::policy(); $gate->available = false; $db->selects = [];
rejects(fn() => $retriever->recall($context, query()), 'missing real bulk/index authorization provider fails closed');
verify(count($db->selects) === 1, 'unavailable source stops before any index read');
$gate->available = true; $gate->current = false;
rejects(fn() => $retriever->recall($context, query()), 'source revocation after index reads prevents returning stale candidates');
$gate->current = true; $gate->override = new AuthorizedIndexSnapshot('synthetic-generation-1', 8, Fingerprint::of($context), Fingerprint::of($policies->policy), 'synthetic-source-purpose-1');
rejects(fn() => $retriever->recall($context, query()), 'foreign index snapshot cannot authorize current Space');
$gate->override = null;
$gate->afterRead = static function () use ($db): void { $db->createCommand()->delete('space_membership', ['user_id' => 1, 'space_id' => 7])->execute(); };
rejects(fn() => $retriever->recall($context, query()), 'viewer revocation during index revalidation is rechecked');
[$db, $context, $policies, $gate, $retriever] = setup();
$gate->afterRead = static function () use ($policies): void { $policies->policy = PolicyFixtures::policy('synthetic-policy-new'); };
rejects(fn() => $retriever->recall($context, query()), 'policy change during recall cannot publish old-policy IDs');
[$db, $context, $policies, $gate, $retriever] = setup();
$db->createCommand('DROP TABLE matcher_recommendation_search_term')->execute();
rejects(fn() => $retriever->recall($context, query()), 'missing index schema is a dependency failure not zero candidates');
require __DIR__ . '/managed_intervals.php';
verify(Yii::$app === null, 'SQL recall tests do not bootstrap an application');
echo json_encode(['status' => 'passed', 'scope' => 'Actual Yii SQL retrieval on synthetic SQLite memory index and native tables; index authorization is synthetic, production publication has separate integration tests.', 'checks' => count($checks), 'scale_observations' => $counts, 'native_sql_executed' => true, 'production_database_calls' => 0, 'upstream_bulk_provider_connected' => false, 'managed_index_lifecycle_verified' => true, 'network_calls' => 0, 'model_calls' => 0, 'checks_passed' => $checks], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
