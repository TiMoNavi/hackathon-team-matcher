<?php
declare(strict_types=1);
// Included by run.php; shares that suite's synthetic memory database only.
use humhub\modules\matcherRecommendation\adapters\native\NativeEligibilityQuery;
use humhub\modules\matcherRecommendation\adapters\retrieval\SqlCandidateRetriever;
use humhub\modules\matcherRecommendation\contracts\{AuthorizedIndexSnapshot, CandidateProjection, EvidenceRef, QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\ManagedCandidateIndexAccess;
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;
use humhub\modules\matcherRecommendation\tests\native_access\Fixtures as NativeFixtures;
use humhub\modules\matcherRecommendation\tests\policy\Fixtures as PolicyFixtures;

final class SyntheticManagedIndexAccess extends SyntheticIndexAccess implements ManagedCandidateIndexAccess
{
    public bool $releaseFails = false;
    public function release(AuthorizedIndexSnapshot $snapshot): void
    {
        $this->calls[] = 'release';
        if ($this->releaseFails) { throw new RuntimeException('Synthetic cleanup unavailable.'); }
    }
}
function intervalSchema($db): void
{
    $db->createCommand('CREATE TABLE matcher_recommendation_search_interval (generation TEXT NOT NULL, space_id INTEGER NOT NULL, target_id INTEGER NOT NULL, feature TEXT NOT NULL, starts_at DOUBLE NOT NULL, ends_at DOUBLE NOT NULL)')->execute();
    $db->createCommand('CREATE INDEX synthetic_interval_lookup ON matcher_recommendation_search_interval (generation, space_id, target_id, feature, starts_at, ends_at)')->execute();
}
function intervalRow($db, int $id, string $start, string $end, string $feature = 'availability', int $space = 7, string $generation = 'synthetic-generation-1'): void
{
    $db->createCommand('INSERT INTO matcher_recommendation_search_interval (generation, space_id, target_id, feature, starts_at, ends_at) VALUES (:generation, :space, :target, :feature, :start, :end)', [':generation' => $generation, ':space' => $space, ':target' => $id, ':feature' => $feature, ':start' => sprintf('%.6F', (float)(new DateTimeImmutable($start))->format('U.u')), ':end' => sprintf('%.6F', (float)(new DateTimeImmutable($end))->format('U.u'))])->execute();
}
function timeQuery(array $intervals): QueryIntent
{
    return new QueryIntent('person', [condition('topics', 'similarity', ['robotics']), condition('availability', 'interval_overlap', $intervals, 'hard')]);
}
function span(string $start, string $end): array { return ['starts_at' => $start, 'ends_at' => $end]; }

[$db, $context, $policies, $gate, $retriever] = setup(7); intervalSchema($db);
foreach (range(2, 8) as $id) { term($db, $id, 'robotics'); }
$wanted = [span('2026-11-11T10:00:00Z', '2026-11-11T11:00:00Z')];
intervalRow($db, 2, '2026-11-11T10:00:00Z', '2026-11-11T10:30:00Z');
intervalRow($db, 3, '2026-11-11T09:59:00Z', '2026-11-11T11:01:00Z');
intervalRow($db, 4, '2026-11-11T10:00:00Z', '2026-11-11T10:30:00Z');
intervalRow($db, 4, '2026-11-11T10:30:00Z', '2026-11-11T11:00:00Z');
intervalRow($db, 5, '2026-11-11T10:00:00Z', '2026-11-11T10:30:00Z');
intervalRow($db, 5, '2026-11-11T10:30:00.000001Z', '2026-11-11T11:00:00Z');
intervalRow($db, 6, '2026-11-11T18:00:00+08:00', '2026-11-11T19:00:00+08:00');
intervalRow($db, 7, '2026-11-11T09:00:00Z', '2026-11-11T10:00:00Z');
intervalRow($db, 8, '2026-11-11T10:00:00Z', '2026-11-11T11:00:00Z', space: 8);
intervalRow($db, 8, '2026-11-11T10:00:00Z', '2026-11-11T11:00:00Z', generation: 'old-generation');
verify(array_column($retriever->recall($context, timeQuery($wanted)), 'id') === ['3', '4', '6'], 'hard intervals require full coverage, merge adjacency, preserve microsecond gaps and normalize timezone offsets');
lowLimit($policies);
verify(array_column($retriever->recall($context, timeQuery($wanted)), 'id') === ['3'], 'partial early candidate cannot consume route LIMIT before full time coverage');
$policies->policy = PolicyFixtures::policy();
$multi = [...$wanted, span('2026-11-11T12:00:00Z', '2026-11-11T12:30:00Z')];
intervalRow($db, 4, '2026-11-11T12:00:00Z', '2026-11-11T12:30:00Z');
verify(array_column($retriever->recall($context, timeQuery($multi)), 'id') === ['4'], 'every requested interval must be covered, including separated windows');
$overlappingWanted = [...$wanted, span('2026-11-11T10:15:00Z', '2026-11-11T10:45:00Z'), $wanted[0]];
verify(array_column($retriever->recall($context, timeQuery($overlappingWanted)), 'id') === ['3', '4', '6'], 'overlapping and duplicate requested windows do not introduce extra constraints');

[$db, $context, $policies, $gate, $retriever] = setup(3); intervalSchema($db);
$p = PolicyFixtures::parameters();
$p['bindings']['extra_availability'] = $p['bindings']['availability'];
$p['bindings']['extra_availability']['source_key'] = 'synthetic_extra_availability';
$p['rules'][6]['candidate_features'][] = 'extra_availability';
$policies->policy = new RulePolicy('synthetic-multiple-time-sources', $p);
foreach ([2, 3, 4] as $id) { term($db, $id, 'robotics'); intervalRow($db, $id, '2026-11-11T10:00:00Z', '2026-11-11T10:30:00Z'); }
intervalRow($db, 2, '2026-11-11T10:30:00Z', '2026-11-11T11:00:00Z', 'extra_availability');
intervalRow($db, 3, '2026-11-11T10:30:00.000001Z', '2026-11-11T11:00:00Z', 'extra_availability');
intervalRow($db, 4, '2026-11-11T10:30:00Z', '2026-11-11T11:00:00Z', 'unconfigured_time');
verify(array_column($retriever->recall($context, timeQuery($wanted)), 'id') === ['2'], 'coverage union spans configured features only and cannot hide cross-feature gaps');

// Differential contract against the existing pure evaluator over a varied finite fixture set.
[$db, $context, $policies, $gate, $retriever] = setup(200); intervalSchema($db);
$p = PolicyFixtures::parameters(); $p['bindings']['extra_availability'] = $p['bindings']['availability'];
$p['bindings']['extra_availability']['source_key'] = 'synthetic_extra_availability'; $p['rules'][6]['candidate_features'][] = 'extra_availability';
$policies->policy = new RulePolicy('synthetic-differential-intervals', $p);
$evaluated = []; $ruleEvaluator = new DeterministicRuleEvaluator();
$iso = static fn(int $seconds): string => (new DateTimeImmutable('2026-11-11T10:00:00Z'))->modify('+' . $seconds . ' seconds')->format('Y-m-d\TH:i:s\Z');
$testIntent = timeQuery([span($iso(2), $iso(8)), span($iso(10), $iso(12))]);
for ($id = 2; $id <= 201; $id++) {
    term($db, $id, 'robotics'); $times = ['availability' => [], 'extra_availability' => []];
    for ($j = 0; $j < 5; $j++) {
        $start = (($id * 17 + $j * 7) % 14); $end = min(15, $start + 1 + (($id * 13 + $j * 11) % 8));
        $feature = $j % 2 === 0 ? 'availability' : 'extra_availability';
        $times[$feature][] = span($iso($start), $iso($end)); intervalRow($db, $id, $iso($start), $iso($end), $feature);
    }
    $features = ['topics' => ['value' => ['robotics'], 'evidence' => [new EvidenceRef('person', (string)$id, 'profile_attribute', 'topic-' . $id, 'global', 4, 2)]]];
    foreach ($times as $key => $value) { $features[$key] = ['value' => $value, 'evidence' => [new EvidenceRef('person', (string)$id, 'profile_attribute', $key . '-' . $id, 'space:7', 6, 3)]]; }
    $candidate = new CandidateProjection('person', (string)$id, 7, PolicyFixtures::versions(), $features);
    if ($ruleEvaluator->evaluate($context, $testIntent, $candidate, $policies->policy, ['structured' => 1])->qualifies) { $evaluated[] = (string)$id; }
}
$actual = array_column($retriever->recall($context, $testIntent), 'id');
verify($actual === array_slice($evaluated, 0, 80), 'SQL before-LIMIT interval union agrees with pure rule evaluator over 200 varied fragmented schedules');

[$db, $context, $policies, $gate, $retriever] = setup();
$gate->override = new AuthorizedIndexSnapshot('synthetic-generation-1', 7, Fingerprint::of($context), Fingerprint::of($policies->policy), 'synthetic-source-purpose-1', 'sha256');
term($db, 2, hash('sha256', 'robotics')); term($db, 2, hash('sha256', 'backend'), 'offers');
term($db, 3, 'robotics'); term($db, 3, 'backend', 'offers');
$hashIntent = new QueryIntent('person', [condition('topics', 'similarity', [' ROBOTICS ']), condition('needs', 'supply_demand', ['BACKEND'], 'hard')]);
verify(array_column($retriever->recall($context, $hashIntent), 'id') === ['2'], 'snapshot SHA256 encoding applies after normalization to recall terms and hard predicates');
$p = PolicyFixtures::parameters(); $p['rules'][0]['aliases'] = ['robots' => 'robotics']; $policies->policy = new RulePolicy('synthetic-hashed-aliases', $p);
$gate->override = new AuthorizedIndexSnapshot('synthetic-generation-1', 7, Fingerprint::of($context), Fingerprint::of($policies->policy), 'synthetic-source-purpose-1', 'sha256');
verify(array_column($retriever->recall($context, query(['robots'])), 'id') === ['2'], 'SHA256 alias canonicalization matches plain exact lexical semantics');

foreach (['success', 'empty', 'foreign', 'sql_failure', 'source_changed', 'policy_changed', 'cleanup_failure'] as $scenario) {
    [$db, $context, $policies] = setup(); $events = NativeFixtures::events($db);
    $managed = new SyntheticManagedIndexAccess();
    $retriever = new SqlCandidateRetriever(new NativeEligibilityQuery($db), $events, $policies, new DeterministicRuleEvaluator(), $managed);
    if ($scenario !== 'empty') { term($db, 2, 'robotics'); }
    if ($scenario === 'foreign') { $managed->override = new AuthorizedIndexSnapshot('synthetic-generation-1', 8, Fingerprint::of($context), Fingerprint::of($policies->policy), 'synthetic-source-purpose-1'); }
    if ($scenario === 'sql_failure') { $db->createCommand('DROP TABLE matcher_recommendation_search_term')->execute(); }
    if ($scenario === 'source_changed') { $managed->current = false; }
    if ($scenario === 'policy_changed') { $managed->afterRead = static function () use ($policies): void { $policies->policy = PolicyFixtures::policy('changed'); }; }
    if ($scenario === 'cleanup_failure') { $managed->releaseFails = true; }
    if (in_array($scenario, ['success', 'empty'], true)) { $rows = $retriever->recall($context, query()); verify(count($rows) === ($scenario === 'empty' ? 0 : 1), 'managed index keeps expected result for ' . $scenario); }
    else { rejects(fn() => $retriever->recall($context, query()), 'managed index fails closed for ' . $scenario); }
    verify(array_count_values($managed->calls)['release'] === 1 && end($managed->calls) === 'release', 'managed index is released exactly once on ' . $scenario);
}
[$db, $context, $policies] = setup(); $managed = new SyntheticManagedIndexAccess(); $managed->available = false;
$retriever = new SqlCandidateRetriever(new NativeEligibilityQuery($db), NativeFixtures::events($db), $policies, new DeterministicRuleEvaluator(), $managed);
rejects(fn() => $retriever->recall($context, query()), 'failed acquire remains a dependency error');
verify($managed->calls === ['acquire'], 'failed acquire never releases a snapshot it did not receive');
