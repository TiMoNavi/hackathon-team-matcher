<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/support/autoload.php';

use humhub\modules\matcherRecommendation\application\DiscoverPeople;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CandidateRequest, EvidenceRef, ProjectionVersions, QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\RecentExposureReader;
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;
use humhub\modules\matcherRecommendation\tests\support\FixtureEnvironment;
use humhub\modules\matcherRecommendation\tests\policy\Fixtures;

$checks = [];
function check(bool $value, string $name): void
{
    global $checks;
    if (!$value) { throw new RuntimeException('FAIL: ' . $name); }
    $checks[] = $name;
}
function rejects(callable $action, string $name): void
{
    try { $action(); } catch (Throwable $e) { check(true, $name); return; }
    check(false, $name);
}
function condition(string $feature, string $operator, mixed $value, string $strength = 'soft'): array
{
    return ['feature' => $feature, 'operator' => $operator, 'value' => $value, 'strength' => $strength, 'origin' => 'user_confirmed'];
}
function person(string $id, array $values): CandidateProjection
{
    $features = [];
    foreach ($values as $key => $value) {
        $scope = in_array($key, ['offers', 'availability'], true) ? 'space:7' : 'global';
        $features[$key] = ['value' => $value, 'evidence' => [new EvidenceRef('person', $id, 'profile_attribute', 'synthetic-' . $id . '-' . $key, $scope, 1, 1)]];
    }
    return new CandidateProjection('person', $id, 7, new ProjectionVersions(['global' => ['revision' => 1, 'permission_version' => 1], 'space:7' => ['revision' => 1, 'permission_version' => 1]], 2, 'synthetic-profile-policy-1', 1), $features);
}
function environment(array $people): FixtureEnvironment
{
    $env = FixtureEnvironment::create();
    $env->rules = new DeterministicRuleEvaluator();
    $env->policies->policy = Fixtures::policy();
    $env->profiles->rows = []; $env->relationships->states = []; $env->retriever->rows = [];
    foreach ($people as $i => $person) {
        $env->profiles->rows[$person->targetId] = $person;
        $env->relationships->states[$person->targetId] = FixtureEnvironment::relationship();
        $env->retriever->rows[] = ['id' => $person->targetId, 'target_type' => 'person', 'routes' => ['structured' => $i + 1]];
    }
    // Synthetic authorized provider; real P1 projection integration remains R3.
    $env->profiles->onRead = static function (CandidateRequest $request) use ($env): array {
        $out = [];
        foreach ($request->targetIds as $id) { if (isset($env->profiles->rows[$id])) { $out[] = $env->profiles->rows[$id]; } }
        return $out;
    };
    return $env;
}
function service(FixtureEnvironment $env, ?RecentExposureReader $history = null): DiscoverPeople
{
    return new DiscoverPeople($env->events, $env->retriever, $env->profiles, $env->relationships, $env->rules, $env->policies, $env->batches, $env->clock, $history);
}
function history(array $counts, ?Closure $callback = null): RecentExposureReader
{
    return new class($counts, $callback) implements RecentExposureReader {
        public array $seen = [];
        public function __construct(private array $counts, private ?Closure $callback) {}
        public function read(CandidateRequest $request): array
        {
            $this->seen[] = $request;
            if ($this->callback !== null) { ($this->callback)($request); }
            return $this->counts;
        }
    };
}

$topic = new QueryIntent('person', [condition('topics', 'similarity', ['robotics'])]);
foreach ([30, 35, 40] as $size) {
    $pool = [];
    for ($i = 0; $i < $size; $i++) { $pool[] = person((string)(100 + $i), $i < 2 ? ['topics' => ['robotics']] : []); }
    $env = environment($pool); $result = service($env)->execute(1, $topic, 7);
    check($result->batch->targetIds === ['100', '101'], $size . ' synthetic candidates with only two evidence matches return exactly two');
    check($result->outcome->reason === 'matched', $size . ' pool reports actual matching outcome');
    check($env->relationships->historyCalls === 0 && $env->relationships->capabilityCalls === 0, $size . ' ordinary matching never requests AI relationship history');
}
$env = environment([person('100', ['topics' => ['robotics'], 'offers' => ['backend']]), person('101', ['topics' => ['robotics']])]);
$query = new QueryIntent('person', [condition('topics', 'similarity', ['robotics']), condition('needs', 'supply_demand', ['backend'])]);
$result = service($env)->execute(1, $query, 7);
check(count($result->items) === 2, 'missing optional willingness remains unknown alongside a separate genuine shared topic');
check(abs($result->items[0]->assessment->diagnostics->matchScore - 1) < 1e-9, 'shared topic and explicit contribution reach full query match');
check(abs($result->items[1]->assessment->diagnostics->matchScore - .75) < 1e-9, 'unknown contribution uses neutral half under common query weights');
check($result->items[0]->assessment->diagnostics->normalizedWeights === $result->items[1]->assessment->diagnostics->normalizedWeights, 'all candidates share identical normalized query weights');
check($result->items[1]->assessment->diagnostics->unknowns !== [], 'unknown contribution remains visible in internal diagnostics');
check($result->outcome->suggestedActions() === [], 'matching outcome does not silently request another query');
check($env->batches->records[$result->batchId]->targetIds === $result->batch->targetIds, 'final selected order is fixed in the batch');
check(!str_contains(json_encode($result->batch, JSON_THROW_ON_ERROR), 'robotics'), 'batch does not copy profile or query text');

$hard = new QueryIntent('person', [condition('needs', 'supply_demand', ['backend'], 'hard')]);
$env = environment([person('100', ['skills' => ['backend']]), person('101', ['offers' => ['commercial']])]);
$empty = service($env)->execute(1, $hard, 7);
check($empty->items === [] && $empty->outcome->reason === 'hard_conditions_unmet', 'unknown willingness and explicit different contribution do not satisfy hard need');
check($empty->outcome->suggestedActions() === ['adjust_conditions', 'browse_current_event'], 'empty hard match offers only explicit next actions');
check(count($env->batches->records) === 1, 'empty result does not start automatic retries or additional batches');
check(!str_contains(json_encode($empty->outcome, JSON_THROW_ON_ERROR), '100'), 'empty outcome contains no excluded person identity');
$env = environment([person('100', [])]);
check(service($env)->execute(1, $topic, 7)->outcome->reason === 'no_clear_match', 'neutral unknown score is not presented as a clear match');
$env = environment([person('100', ['self_type' => ['INTJ']])]);
$typeOnly = new QueryIntent('person', [condition('self_type', 'explicit_preference', ['INTJ'])]);
check(service($env)->execute(1, $typeOnly, 7)->outcome->reason === 'no_clear_match', 'personality-only preference cannot replace required topic or contribution evidence');
$env = environment([]);
check(service($env)->execute(1, $topic, 7)->outcome->reason === 'no_authorized_candidates', 'empty authorized pool has a distinct generic outcome');
$env = environment([person('100', ['topics' => ['robotics']])]);
$env->relationships->states['100'] = FixtureEnvironment::relationship(blocked: true);
check(service($env)->execute(1, $topic, 7)->outcome->reason === 'no_authorized_candidates', 'blocked-only pool shares generic empty outcome without revealing blocks');

$env = environment([]);
$invalid = new QueryIntent('person', [condition('topics', 'execute_sql', 'SELECT *')]);
rejects(fn() => service($env)->execute(1, $invalid, 7), 'invalid operator rejected even when the authorized pool is empty');
check($env->batches->records === [] && $env->profiles->reads === 0, 'invalid empty-pool query publishes no successful batch');
$env = environment([person('100', ['topics' => ['robotics']])]);
$env->retriever->rows[0]['routes'] = ['semantic' => 1];
rejects(fn() => service($env)->execute(1, $topic, 7), 'disabled semantic recall route cannot supply candidates');
check($env->profiles->reads === 0, 'disabled route rejected before reading projections');
$env = environment(array_map(static fn(int $id): CandidateProjection => person((string)$id, ['topics' => ['robotics']]), range(100, 110)));
$p = Fixtures::parameters(); $p['limits']['recall'] = 10; $p['limits']['model_candidates'] = 10; $p['selection']['max_results'] = 10;
$env->policies->policy = new RulePolicy('synthetic-lower-recall', $p);
rejects(fn() => service($env)->execute(1, $topic, 7), 'lower published recall budget is enforced against eleven recalled candidates');
check($env->profiles->reads === 0 && $env->batches->records === [], 'lower recall bound fails before profile reads and persistence');

$two = [person('100', ['topics' => ['robotics']]), person('101', ['topics' => ['robotics']])];
$env = environment($two); $exposure = history(['100' => 9, '101' => 0]);
$result = service($env, $exposure)->execute(1, $topic, 7);
check($result->batch->targetIds === ['101', '100'] && $result->explorationIds === ['101'], 'one lesser-exposed near-score candidate can be promoted');
check($exposure->seen[0]->context->viewerId === 1 && $exposure->seen[0]->context->spaceId === 7, 'exposure request uses the verified viewer and current Space');
check($exposure->seen[0]->targetIds === ['100', '101'], 'exposure reader receives only already qualified candidate IDs');
$again = service($env, $exposure)->execute(1, $topic, 7);
check($again->batch->targetIds === $result->batch->targetIds, 'same rule and exposure snapshot gives the same stable ordering');
$env = environment($two);
$revoking = history(['100' => 0, '101' => 0], static function () use ($env): void { $env->profiles->rows = []; });
$empty = service($env, $revoking)->execute(1, $topic, 7);
check($empty->items === [] && $empty->outcome->reason === 'no_current_matches', 'revocation while reading exposure removes old reasons before publishing');
check($empty->explorationIds === [], 'revoked candidates cannot retain exploration positions');
$env = environment($two);
$blocking = history(['100' => 0, '101' => 0], static function () use ($env): void { $env->relationships->states['100'] = FixtureEnvironment::relationship(blocked: true); });
check(service($env, $blocking)->execute(1, $topic, 7)->batch->targetIds === ['101'], 'late block during exposure read is rechecked without refilling');
$env = environment($two);
rejects(fn() => service($env, history(['100' => 0]))->execute(1, $topic, 7), 'incomplete configured history is an error rather than fake zero counts');
check($env->batches->records === [], 'history failure does not masquerade as empty successful recommendation');
$env = environment($two);
$failing = history([], static function (): void { throw new RuntimeException('Synthetic history dependency failed.'); });
rejects(fn() => service($env, $failing)->execute(1, $topic, 7), 'history dependency failure propagates');
check($env->batches->records === [], 'dependency failure persists no successful batch');
$env = environment($two);
rejects(fn() => service($env)->execute(1, $topic, 8), 'rules remain bound to server-verified current Space');
rejects(fn() => service($env)->execute(1, new QueryIntent('person', $topic->conditions, ['self-field']), 7), 'unconnected self-field resolution remains explicit');
rejects(fn() => service($env)->execute(1, new QueryIntent('person', $topic->conditions, [], 'idea-1'), 7), 'unconnected project authorization remains explicit');

echo json_encode(['status' => 'passed', 'phase' => 'R2 formal evaluator with synthetic application adapters', 'checks' => count($checks), 'passed' => $checks, 'database_calls' => 0, 'network_calls' => 0, 'model_calls' => 0, 'real_data_or_http_test' => false], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
