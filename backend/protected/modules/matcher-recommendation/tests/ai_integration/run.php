<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/support/autoload.php';
require_once dirname(__DIR__) . '/ai_runs/Fixtures.php';

use humhub\modules\matcherRecommendation\application\ai\{AiRecommendationService, SearchAiCandidates};
use humhub\modules\matcherRecommendation\contracts\{CurrentEventContext, QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\CandidateRetriever;
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\domain\ai\{AiRankedCandidate, AiRecommendationException};
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;
use humhub\modules\matcherRecommendation\tests\ai_runs\{Fixtures as F, Reranker};
use humhub\modules\matcherRecommendation\tests\rules\Fixtures as R;

/**
 * In-memory end-to-end application test. The actual service, search, deterministic evaluator,
 * minimal pool builder and output validator all run. Only external ports/providers are synthetic.
 * Does not load HumHub, contact a database, enable an installed module or connect to a gateway.
 */
final class IntegrationRetriever implements CandidateRetriever
{
    public array $rows = [];
    public array $calls = [];
    public ?Closure $onRecall = null;
    public function __construct(array $ids)
    {
        foreach ($ids as $index => $id) {
            [$route, $rank] = $index < 80 ? ['structured', $index + 1]
                : ($index < 120 ? ['fulltext', $index - 79] : ['semantic', $index - 119]);
            $this->rows[] = ['target_type' => 'person', 'id' => (string)$id, 'routes' => [$route => $rank]];
        }
    }
    public function recall(CurrentEventContext $context, QueryIntent $intent): array
    {
        $this->calls[] = ['context' => $context, 'intent' => $intent];
        if ($this->onRecall !== null) { ($this->onRecall)($this, $context, $intent); }
        return $this->rows;
    }
}

final class IntegrationHarness
{
    public F $ports;
    public IntegrationRetriever $retriever;
    public SearchAiCandidates $search;
    public AiRecommendationService $service;
    public function __construct(int $size = 30)
    {
        $this->ports = F::create($size);
        $p = $this->ports;
        if ($size > 120) {
            $parameters = $p->policies->policy->parameters; $parameters['enabled_routes'][] = 'semantic';
            $p->policies->policy = new RulePolicy('synthetic-ai-integration-policy-1', $parameters);
        }
        $this->retriever = new IntegrationRetriever(array_keys($p->profiles->rows));
        $evaluator = new DeterministicRuleEvaluator();
        $this->search = new SearchAiCandidates($p->events, $this->retriever, $p->profiles, $p->contacts, $evaluator, $p->policies);
        $this->service = new AiRecommendationService($p->events, $p->policies, $evaluator, $this->search,
            $p->profiles, $p->contacts, $p->platform, $p->providers, $p->clock);
        $p->reranker->responses = [self::selectFive(...)];
    }
    public static function selectFive(QueryIntent $intent, array $summaries, string $permit, Reranker $provider): array
    {
        return array_map(static fn(array $summary): array => ['target_type' => 'person', 'id' => $summary['id'],
            'evidence_ids' => $summary['facts'][0]['evidence_ids']], array_slice($summaries, 0, 5));
    }
    public function start(string $mode = 'structured', ?QueryIntent $query = null): array
    {
        return $mode === 'structured' ? $this->service->startStructured(1, $query ?? F::query())
            : $this->service->startChat(1, '希望找到对机器人和公益项目有兴趣的伙伴');
    }
}

$checks = [];
function verify(bool $value, string $label): void
{
    global $checks;
    if (!$value) { throw new RuntimeException('FAIL: ' . $label); }
    $checks[] = $label;
}
function completed(array $view, int $calls, string $label): void
{
    verify($view['interaction_status'] === 'completed' && $view['execution_status'] === 'succeeded'
        && $view['applicability'] === 'current' && $view['error'] === null && $view['model_calls_used'] === $calls, $label);
}
function failed(array $view, string $reason, int $calls, string $label): void
{
    verify($view['interaction_status'] === 'failed' && $view['execution_status'] === 'failed'
        && $view['error'] === $reason && $view['items'] === [] && $view['model_calls_used'] === $calls, $label);
}
function rejects(callable $call, string $reason, string $label): void
{
    try { $call(); }
    catch (AiRecommendationException $error) {
        verify($error->reason === $reason && $error->getPrevious() === null, $label); return;
    }
    throw new RuntimeException('FAIL: ' . $label . ' did not reject.');
}
function itemIds(array $items): array { return array_map(static fn(AiRankedCandidate $item): string => $item->id, $items); }
function allReadsContain(array $reads, array $expectedIds): bool
{
    sort($expectedIds, SORT_STRING);
    foreach ($reads as $ids) { sort($ids, SORT_STRING); if ($ids !== $expectedIds) { return false; } }
    return $reads !== [];
}

// Both entrypoints call the real backend search once; the existing fake Search is never injected.
foreach (['structured', 'natural'] as $mode) {
    $h = new IntegrationHarness(); $p = $h->ports; $view = $h->start($mode);
    completed($view, $mode === 'structured' ? 1 : 2, $mode . ' runs actual search, rules, pool builder and final evidence validator');
    verify(count($view['items']) === 5 && $view['search_calls_used'] === 1 && count($h->retriever->calls) === 1,
        $mode . ' produces five results from one backend recall');
    verify($p->search->calls === [] && $h->search instanceof SearchAiCandidates, $mode . ' never invokes ai_runs fake search');
    verify(count($p->interpreter->calls) === ($mode === 'structured' ? 0 : 1) && count($p->reranker->calls) === 1,
        $mode . ' has exactly the intended provider stages');
    $call = $h->retriever->calls[0];
    verify($call['context'] === $p->events->context && $call['intent']->targetType === 'person'
        && $call['context']->spaceId === 7, $mode . ' gives retriever the verified current Space');
    $summaries = $p->reranker->calls[0]['summaries'];
    verify(count($summaries) === 24 && itemIds($view['items']) === array_column(array_slice($summaries, 0, 5), 'id'),
        $mode . ' reduces thirty rule candidates to twenty-four summaries and five validated results');
    $summaryJson = json_encode($summaries, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    verify(!str_contains($summaryJson, 'offers=') && !str_contains($summaryJson, 'preferences=')
        && !str_contains($summaryJson, 'attribute-fixture'), $mode . ' only sends query-relevant minimal facts and opaque evidence aliases');
    verify(array_reduce($summaries, static fn(bool $ok, array $summary): bool => $ok
        && strlen(json_encode($summary, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR)) <= 768, true),
        $mode . ' enforces every candidate summary byte limit');
    $expectedIds = array_map('strval', array_keys($p->profiles->rows));
    verify(count($p->profiles->requests) >= 4 && allReadsContain($p->profiles->requests, $expectedIds)
        && allReadsContain($p->contacts->currentRequests, $expectedIds) && allReadsContain($p->contacts->historyRequests, $expectedIds),
        $mode . ' revalidates the complete candidate pool in bounded batches before and after model output');
    foreach ($view['items'] as $index => $item) {
        $recall = current(array_filter($h->retriever->rows, static fn(array $row): bool => $row['id'] === $item->id));
        $assessment = (new DeterministicRuleEvaluator())->evaluate($p->events->context, $call['intent'], $p->profiles->rows[$item->id], $p->policies->policy, $recall['routes']);
        if ($item->aiRank !== $index + 1 || abs($item->ruleScore - $assessment->sortScore) > 1e-12) { throw new RuntimeException('Final ranking changed the deterministic score.'); }
        foreach ($item->reasons as $reason) {
            foreach ($reason->evidence as $ref) {
                if ($ref->targetId !== $item->id || $ref->scope !== 'global' || $ref->sourceId !== 'attribute-fixture-topics') { throw new RuntimeException('Final reason lost authorized provenance.'); }
            }
        }
    }
    verify(true, $mode . ' preserves deterministic scores separately from AI rank and reconstructs real authorized reason evidence');
    $models = $p->modelCalls(); $read = $h->service->get(1, $view['run_id']);
    verify(itemIds($read['items']) === itemIds($view['items']) && $p->modelCalls() === $models && count($h->retriever->calls) === 1,
        $mode . ' completed-run read rechecks authorization without a second recall or model');
}

// One full bounded recall traverses 80 structured + 40 fulltext + 80 semantic synthetic route entries.
$h = new IntegrationHarness(200); $p = $h->ports; $beforeProviderReads = [];
$p->reranker->onCall = static function () use ($p, &$beforeProviderReads): void {
    $beforeProviderReads = [count($p->profiles->requests), count($p->contacts->historyRequests)];
};
$view = $h->start(); completed($view, 1, '200-person actual search pipeline completes');
verify(count($h->retriever->calls) === 1 && count($h->retriever->rows) === 200
    && count($p->reranker->calls[0]['summaries']) === 24 && count($view['items']) === 5, 'one recall performs the exact 200 to 24 to 5 reduction');
$expectedIds = array_map('strval', array_keys($p->profiles->rows));
verify(allReadsContain($p->profiles->requests, $expectedIds) && allReadsContain($p->contacts->historyRequests, $expectedIds), 'all two hundred candidates remain in publication rechecks, including unsent summaries');
verify($beforeProviderReads[0] >= 2 && $beforeProviderReads[1] >= 2 && count($p->profiles->requests) > $beforeProviderReads[0]
    && count($p->contacts->historyRequests) > $beforeProviderReads[1], 'authorization batches run on both sides of provider execution');
verify(count($p->platform->reservations) === 1 && $p->search->calls === [], 'full-pool integration spends one explicit model permit and no fake search');

// A high-quality later member must survive recall ordering and minimal-pool reduction.
$h = new IntegrationHarness(200); $p = $h->ports;
foreach (array_keys($p->profiles->rows) as $id) { $p->profiles->rows[$id] = R::candidate(['topics' => [(string)$id === '201' ? 'robotics' : 'social']], id: (string)$id); }
$query = new QueryIntent('person', [R::condition('topics', 'similarity', ['robotics'])]);
$view = $h->start(query: $query); completed($view, 1, 'later best candidate survives actual two hundred-person search');
verify(itemIds($view['items']) === ['201'] && array_column($p->reranker->calls[0]['summaries'], 'id') === ['201'], 'rule filtering and packaging do not truncate to first registered members');

// An absent historical source blocks both modes before recall, profile reads or any model budget.
foreach (['structured', 'natural'] as $mode) {
    foreach ([0, 30] as $count) {
        $h = new IntegrationHarness($count); $p = $h->ports; $p->contacts->historySupported = false;
        rejects(fn() => $h->start($mode), 'history_unavailable', $mode . ' rejects missing history capability even with pool size ' . $count);
        verify($h->retriever->calls === [] && $p->profiles->requests === [] && $p->modelCalls() === 0 && $p->platform->reservations === [],
            $mode . ' missing history does no downstream work for pool size ' . $count);
    }
}
$h = new IntegrationHarness(); $p = $h->ports;
$p->profiles->onRead = static function () use ($p): void { $p->contacts->historySupported = false; };
failed($h->start(), 'history_unavailable', 0, 'history capability revoked during real search stops before model');
verify(count($h->retriever->calls) === 1 && $p->modelCalls() === 0 && $p->platform->reservations === [], 'mid-search history revocation consumes no model permit');
$h = new IntegrationHarness(); $p = $h->ports; unset($p->contacts->history['2']);
failed($h->start(), 'history_unavailable', 0, 'incomplete real batch history cannot become an all-false eligibility map');

// Empty candidates use no reranking call; natural input still needs its one explicit interpretation.
foreach (['structured', 'natural'] as $mode) {
    $h = new IntegrationHarness(0); $p = $h->ports; $view = $h->start($mode);
    completed($view, $mode === 'structured' ? 0 : 1, $mode . ' empty current activity completes honestly');
    verify($view['items'] === [] && $p->reranker->calls === [] && count($h->retriever->calls) === 1
        && $p->profiles->requests === [] && $p->contacts->historyRequests === [], $mode . ' empty recall does not call candidate model or query another activity');
}
$h = new IntegrationHarness(); $p = $h->ports;
$view = $h->start(query: new QueryIntent('person', [R::condition('topics', 'similarity', ['no-synthetic-match'])]));
completed($view, 0, 'nonempty roster with zero evidence-backed matches uses zero model calls');
verify($view['items'] === [] && count($p->profiles->requests) === 1 && count($p->contacts->historyRequests) === 1, 'real rule rejection ends after one bounded data read');

// Real search exclusions carry through packaging and final result validation.
$h = new IntegrationHarness(6); $p = $h->ports;
foreach (['blocked', 'friend', 'pending_in', 'pending_out'] as $i => $flag) { $p->contacts->current[(string)($i + 2)][$flag] = true; }
$p->contacts->history['6']['ever_sent'] = true;
$view = $h->start(); completed($view, 1, 'actual eligibility exclusions leave the one legitimate candidate');
verify(itemIds($view['items']) === ['7'] && array_column($p->reranker->calls[0]['summaries'], 'id') === ['7'], 'blocked, existing friend, both pending directions and terminal sent history never reach model');
$h = new IntegrationHarness(); $p = $h->ports; unset($p->profiles->rows['2']);
$view = $h->start(); completed($view, 1, 'authorization omission from real projection is respected');
verify(!in_array('2', array_column($p->reranker->calls[0]['summaries'], 'id'), true), 'denied person is not replaced with an unauthorized projection');

// Revoke an eligible but unsent person during model work: validating only the final five would miss this.
foreach (['history', 'profile'] as $source) {
    $h = new IntegrationHarness(200); $p = $h->ports; $changedId = null;
    $p->reranker->onCall = static function ($provider, $intent, $summaries) use ($p, $source, &$changedId): void {
        $sent = array_column($summaries, 'id');
        foreach (array_keys($p->profiles->rows) as $id) { if (!in_array((string)$id, $sent, true)) { $changedId = (string)$id; break; } }
        if ($changedId === null) { throw new RuntimeException('Expected an unsent candidate for this test.'); }
        if ($source === 'history') { $p->contacts->history[$changedId] = ['ever_sent' => true, 'version' => 'synthetic-history-revoked']; }
        else { unset($p->profiles->rows[$changedId]); }
    };
    $view = $h->start(); failed($view, 'context_invalidated', 1, 'post-model ' . $source . ' revocation of unsent candidate blocks publication');
    verify($view['applicability'] === 'revoked' && $changedId !== null && count($h->retriever->calls) === 1
        && count($p->reranker->calls) === 1 && !$view['repair_used'], 'full-pool ' . $source . ' revocation is terminal without re-search or repair');
}
$h = new IntegrationHarness(); $p = $h->ports;
rejects(fn() => $h->service->startStructured(1, F::query(), 8), 'context_invalidated', 'caller cannot replace the verified current Space');
verify($h->retriever->calls === [] && $p->modelCalls() === 0, 'wrong current Space has no recall or model cost');

// Actual validator catches provider inventions and shares one search across a counted repair.
$h = new IntegrationHarness(); $p = $h->ports;
$p->reranker->responses = [F::invalidRank(), IntegrationHarness::selectFive(...)];
$view = $h->start(); completed($view, 2, 'invalid provider selection receives one validated repair through the full pipeline');
verify($view['repair_used'] && count($view['items']) === 5 && count($h->retriever->calls) === 1 && count($p->platform->reservations) === 2,
    'repair spends a second permit while retaining the original backend search');
$h = new IntegrationHarness(); $p = $h->ports; $p->reranker->responses = [F::invalidRank(), F::invalidRank()];
$view = $h->start(); failed($view, 'invalid_model_output', 2, 'repeated invented output fails after one repair');
verify(count($h->retriever->calls) === 1 && count($p->reranker->calls) === 2, 'invalid model cannot cause a second recall or unlimited repair');
$h = new IntegrationHarness(); $p = $h->ports; $p->reranker->responses = [[]];
$view = $h->start(); completed($view, 1, 'legal zero final selection is accepted despite nonempty genuine candidates');
verify($view['items'] === [] && !$view['repair_used'], 'legal empty final selection is not overwritten by forced cards');

echo json_encode(['suite' => 'ai_integration', 'status' => 'passed', 'checks' => count($checks),
    'real_components' => ['AiRecommendationService', 'SearchAiCandidates', 'DeterministicRuleEvaluator', 'MinimalCandidatePoolBuilder', 'ValidateAiRerankOutput'],
    'external_ports' => 'synthetic in-memory only', 'network_calls' => 0, 'database_connections' => 0], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL;
