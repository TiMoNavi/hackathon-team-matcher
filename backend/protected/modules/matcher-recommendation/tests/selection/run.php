<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/support/autoload.php';

use humhub\modules\matcherRecommendation\domain\{DiscoveryMatch, MatchReason, RuleAssessment};
use humhub\modules\matcherRecommendation\domain\selection\RankedResultSelector;
use humhub\modules\matcherRecommendation\tests\support\FixtureEnvironment;

$checks = [];
function check(bool $value, string $name): void
{
    global $checks;
    if (!$value) { throw new RuntimeException('FAIL: ' . $name); }
    $checks[] = $name;
}
function rejects(callable $run, string $name): void
{
    try { $run(); } catch (InvalidArgumentException | UnexpectedValueException $e) { check(true, $name); return; }
    check(false, $name);
}
function matchItem(string $id, float $score, bool $qualified = true): DiscoveryMatch
{
    $projection = FixtureEnvironment::person($id);
    return new DiscoveryMatch($projection, new RuleAssessment($qualified, $score, [new MatchReason('synthetic_selector', 'Synthetic selector evidence', $projection->features['fixture_topic']['evidence'])]), FixtureEnvironment::relationship());
}
function ids(array $items): array { return array_map(static fn(DiscoveryMatch $m): string => $m->candidate->targetId, $items); }

$selector = new RankedResultSelector();
$base = ['near_tie_delta' => 0.05, 'exploration_slots' => 0, 'max_results' => 200];
$pool = [matchItem('103', .85), matchItem('102', .9), matchItem('101', .9)];
check(ids($selector->select($pool, $base)->items) === ['101', '102', '103'], 'score order and stable ID tie break without evidence diversity');
check($selector->select([], $base)->items === [], 'empty legal pool remains empty');
check(ids($selector->select([matchItem('101', .5)], $base)->items) === ['101'], 'single candidate remains a single result');
check(ids($selector->select($pool, array_replace($base, ['max_results' => 2]))->items) === ['101', '102'], 'explicit ordinary batch bound applies after ranking');
check(count($selector->select(array_map(static fn(int $id): DiscoveryMatch => matchItem((string)$id, .8), range(100, 129)), $base)->items) === 30, 'AI five-card budget does not truncate ordinary rule batches');

$categories = ['101' => ['contribution:technical'], '102' => ['contribution:technical'], '103' => ['contribution:commercial']];
check(ids($selector->select($pool, $base, [], $categories)->items) === ['101', '103', '102'], 'distinct matching contribution can move within anchored near-score band');
$rich = ['101' => ['topic:education'], '102' => ['topic:education', 'topic:hardware', 'topic:music']];
check(ids($selector->select([matchItem('102', .9), matchItem('101', .9)], $base, [], $rich)->items) === ['101', '102'], 'more profile tags do not beat stable ID with equal score and novelty');
$duplicate = ['101' => ['contribution:technical'], '102' => ['contribution:technical', 'contribution:technical'], '103' => ['contribution:commercial']];
check(ids($selector->select($pool, $base, [], $duplicate)->items) === ['101', '103', '102'], 'duplicate evidence categories cannot earn extra diversity priority');

$chain = [matchItem('101', .90), matchItem('102', .86), matchItem('103', .82)];
$history = ['101' => 8, '102' => 4, '103' => 0];
$exploration = array_replace($base, ['exploration_slots' => 1]);
$picked = $selector->select($chain, $exploration, $history);
check(ids($picked->items) === ['102', '101', '103'], 'low exposure cannot chain a candidate more than 0.05 above its score band');
check($picked->explorationIds === ['102'], 'at most one low-exposure promotion is recorded');
check($picked->items[0]->assessment->sortScore === .86, 'exploration does not rewrite a matching score');
check(ids($selector->select($chain, $exploration, $history)->items) === ids($picked->items), 'same inputs select deterministic fixed ordering');
check(ids($selector->select($chain, $base, $history)->items) === ['101', '102', '103'], 'explicit zero exploration slots does not use exposure to promote');
check($selector->select($chain, $exploration)->explorationIds === [], 'absent optional history does not invent exposure facts');
check($selector->select($chain, $exploration, ['101' => 0, '102' => 0, '103' => 0])->explorationIds === [], 'authoritative zero history leaves stable score ranking');
$across = [matchItem('101', .9), matchItem('102', .87), matchItem('103', .8), matchItem('104', .77)];
check($selector->select($across, $exploration, ['101' => 9, '102' => 0, '103' => 8, '104' => 0])->explorationIds === ['102'], 'exploration budget is shared across all score bands');
check(ids($selector->select([matchItem('101', .9), matchItem('102', .849)], $exploration, ['101' => 50, '102' => 0])->items) === ['101', '102'], 'exposure cannot cross a score difference larger than 0.05');

rejects(fn() => $selector->select([matchItem('101', .9, false)], $base), 'unqualified candidates cannot enter selection or exploration');
rejects(fn() => $selector->select([matchItem('101', .9), matchItem('101', .8)], $base), 'duplicate candidate IDs are rejected');
rejects(fn() => $selector->select($pool, $base, ['101' => 0]), 'incomplete configured history is rejected');
rejects(fn() => $selector->select($pool, $base, ['101' => 0, '102' => 1, '999' => 0]), 'history cannot introduce another candidate');
rejects(fn() => $selector->select($pool, $base, ['101' => -1, '102' => 0, '103' => 0]), 'negative exposure counts rejected');
rejects(fn() => $selector->select($pool, $base, ['101' => '0', '102' => 0, '103' => 0]), 'exposure counts require integer type');
rejects(fn() => $selector->select($pool, $base, [], ['999' => ['topic:secret']]), 'diversity cannot introduce a different subject');
rejects(fn() => $selector->select($pool, $base, [], ['101' => ['']]), 'empty diversity facts rejected');
foreach ([['max_results' => 0], ['max_results' => 201], ['max_results' => 1.5], ['near_tie_delta' => .2], ['near_tie_delta' => '0.05'], ['near_tie_delta' => NAN], ['exploration_slots' => 2], ['sql' => 'select all']] as $invalid) {
    rejects(fn() => $selector->select($pool, array_replace($base, $invalid)), 'invalid selection parameters rejected: ' . implode(',', array_keys($invalid)));
}
rejects(fn() => $selector->select(array_map(static fn(int $id): DiscoveryMatch => matchItem((string)$id, .8), range(100, 300)), $base), 'selector cannot process more than two hundred authorized candidates');
echo json_encode(['status' => 'passed', 'phase' => 'R2 deterministic bounded selection', 'checks' => count($checks), 'passed' => $checks, 'database_calls' => 0, 'network_calls' => 0, 'model_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
