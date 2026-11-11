<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/support/autoload.php';
require_once __DIR__ . '/Fixtures.php';
use humhub\modules\matcherRecommendation\application\ai\AiRecommendationService;
use humhub\modules\matcherRecommendation\contracts\{CurrentEventContext, QueryIntent};
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\domain\ai\{AiRankedCandidate, AiRecommendationException};
use humhub\modules\matcherRecommendation\tests\ai_runs\{Fixtures as F, Interpreter, Reranker};
use humhub\modules\matcherRecommendation\tests\rules\Fixtures as R;

$checks = [];
function verify(bool $condition, string $name): void { global $checks; if (!$condition) { throw new RuntimeException('FAIL: ' . $name); } $checks[] = $name; }
function rejects(callable $call, string $reason, string $name): void
{
    try { $call(); } catch (AiRecommendationException $error) { verify($error->reason === $reason && $error->getPrevious() === null, $name . ' [' . $error->reason . ']'); return; }
    verify(false, $name);
}
function completed(array $view, int $calls, string $name): void
{
    verify($view['interaction_status'] === 'completed' && $view['execution_status'] === 'succeeded' && $view['applicability'] === 'current'
        && $view['model_calls_used'] === $calls && $view['error'] === null, $name);
}
function failed(array $view, string $reason, int $calls, string $name): void
{
    verify($view['interaction_status'] === 'failed' && $view['execution_status'] === 'failed' && $view['error'] === $reason
        && $view['model_calls_used'] === $calls && $view['items'] === [] && $view['can_use_filters'], $name);
}
function answer(F $f, array $view, string $text = '共同兴趣', string $key = 'synthetic-answer-1'): array
{
    return $f->service()->answer(1, $view['run_id'], $view['version'], $view['question']['id'], $text, $key);
}

$f = F::create(); $view = $f->service()->startStructured(1, F::query());
completed($view, 1, 'structured input completes with exactly one rerank call');
$keys = array_keys($view); sort($keys);
verify($keys === ['applicability', 'can_use_filters', 'clarification_round', 'error', 'execution_status', 'interaction_status', 'items', 'model_calls_used', 'question', 'repair_used', 'run_id', 'search_calls_used', 'version'], 'internal run view uses the declared statuses and bounded fields');
verify($view['items'] !== [] && $view['items'][0] instanceof AiRankedCandidate && count($f->interpreter->calls) === 0, 'structured entry skips interpretation and keeps internal evidence-ranked DTOs');
verify($view['search_calls_used'] === 1 && count($f->search->calls) === 1 && count($f->platform->reservations) === 1 && $f->platform->remaining === 19, 'one backend search and one reserved platform attempt are used');
$before = $f->modelCalls(); $read = $f->service()->get(1, $view['run_id']);
verify($read['items'] === $view['items'] && $f->modelCalls() === $before, 'reading a completed result performs no model calls');
verify($f->profiles->requests !== [] && $f->contacts->historyRequests !== [], 'ordinary discovery eligibility is rechecked with explicit complete sent history');
verify(array_reduce($f->reranker->calls[0]['summaries'], static fn(bool $ok, array $s): bool => $ok && strlen(json_encode($s, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION)) <= 768, true), 'core sends bounded actual summaries to the reranker');

$f = F::create(); $f->reranker->responses = [F::invalidRank()]; $view = $f->service()->startStructured(1, F::query());
completed($view, 2, 'structured invalid output receives at most one counted repair');
verify($view['repair_used'] && count($f->search->calls) === 1 && count($f->platform->reservations) === 2, 'repair spends a new permit without repeating candidate search');
$f = F::create(); $f->reranker->responses = [F::invalidRank(), F::invalidRank()];
failed($f->service()->startStructured(1, F::query()), 'invalid_model_output', 2, 'second invalid structured output fails instead of a third attempt');
$f = F::create(); $f->reranker->responses = [new AiRecommendationException('provider_unavailable')];
failed($f->service()->startStructured(1, F::query()), 'provider_unavailable', 1, 'network or provider failure is not repaired or converted to rule success');
verify(count($f->reranker->calls) === 1 && count($f->platform->reservations) === 1, 'network failure has no hidden gateway retry');
$f = F::create(); $f->reranker->responses = [[]]; $view = $f->service()->startStructured(1, F::query());
completed($view, 1, 'a legal empty selection completes under the zero-to-five output contract');
verify($view['items'] === [] && !$view['repair_used'], 'legal zero selection consumes no repair');

$f = F::create(); $view = $f->service()->startChat(1, '想找共同兴趣相近的项目伙伴');
completed($view, 2, 'natural-language ready input uses one interpretation and one rerank');
verify(count($f->interpreter->calls) === 1 && count($f->reranker->calls) === 1 && count($f->search->calls) === 1, 'natural-language pipeline searches exactly once after validated conditions');
$input = $f->interpreter->calls[0]['input'];
verify(!isset($input['viewer_id'], $input['event_id'], $input['sql']) && in_array(['feature' => 'topics', 'operator' => 'similarity'], $input['allowed_conditions'], true), 'interpreter receives a policy feature whitelist without identity activity or SQL authority');
$f = F::create(); $f->interpreter->responses = [['unexpected' => true]]; $view = $f->service()->startChat(1, 'synthetic-query');
completed($view, 3, 'natural-language interpretation repair plus ranking stays within three calls');
verify($view['repair_used'] && count($f->interpreter->calls) === 2 && count($f->search->calls) === 1, 'interpretation repair does not repeat backend search');
$f = F::create(); $f->reranker->responses = [F::invalidRank()];
completed($f->service()->startChat(1, 'synthetic-query'), 3, 'natural-language rerank repair stays within three calls');
$f = F::create(); $f->interpreter->responses = [['unexpected' => true]]; $f->reranker->responses = [F::invalidRank()];
failed($f->service()->startChat(1, 'synthetic-query'), 'invalid_model_output', 3, 'one shared repair cannot be spent again in a later stage');
$f = F::create(); $hard = F::ready(); $hard['conditions'][0]['strength'] = 'hard'; $hard['conditions'][0]['origin'] = 'user_confirmed'; $f->interpreter->responses = [$hard];
$view = $f->service()->startChat(1, 'synthetic-query'); completed($view, 3, 'model cannot promote interpreted conditions into user-confirmed hard constraints');
verify($f->search->calls[0]['intent']->conditions[0]['strength'] === 'soft', 'only the repaired allowed soft condition reaches backend search');

$f = F::create(); $f->interpreter->responses = [F::question('第一轮明确项目目标'), F::question('第二轮明确角色'), F::question('第三轮明确时间'), F::ready()];
$view = $f->service()->startChat(1, 'synthetic-query'); $runId = $view['run_id'];
for ($round = 1; $round <= 3; $round++) {
    verify($view['interaction_status'] === 'awaiting_input' && $view['execution_status'] === 'succeeded' && $view['clarification_round'] === $round && $view['model_calls_used'] === $round, 'clarification round ' . $round . ' completes its current task without inventing a waiting execution status');
    verify($view['run_id'] === $runId && $view['question']['kind'] === 'clarification' && $view['question']['allow_free_text'] === true && count($f->search->calls) === 0, 'clarification round ' . $round . ' stays in the same run before any search');
    $view = answer($f, $view, 'synthetic-answer-' . $round, 'synthetic-key-' . $round);
}
completed($view, 5, 'three clarification questions plus final interpretation and ranking use at most five calls');
verify($view['clarification_round'] === 3 && count($f->search->calls) === 1 && count($f->platform->reservations) === 5, 'maximum clarification path charges every attempt and searches once');

$f = F::create(); $f->interpreter->responses = [['unexpected' => true], F::question(), F::question(), F::ready()];
$view = $f->service()->startChat(1, 'synthetic-query'); $view = answer($f, $view, key: 'early-repair-a'); $view = answer($f, $view, key: 'early-repair-b');
completed($view, 5, 'early interpretation repair still leaves two clarification rounds within five calls');
$f = F::create(); $f->interpreter->responses = [['unexpected' => true], F::question(), F::question(), F::question()];
$view = $f->service()->startChat(1, 'synthetic-query'); $view = answer($f, $view, key: 'reserve-a'); $view = answer($f, $view, key: 'reserve-b');
failed($view, 'budget_exhausted', 4, 'question requiring a sixth future call fails before asking it');
verify($view['question'] === null && $view['clarification_round'] === 2 && count($f->search->calls) === 0 && count($f->reranker->calls) === 0, 'insufficient budget reserves final interpretation plus rerank instead of trapping the user in another question');
$f = F::create(); $f->interpreter->responses = [F::question(), F::question(), F::question(), F::question()];
$view = $f->service()->startChat(1, 'synthetic-query');
foreach ([1, 2, 3] as $round) { $view = answer($f, $view, key: 'max-round-' . $round); }
failed($view, 'clarification_limit', 4, 'a fourth clarification question is explicitly rejected');

$f = F::create(); $f->interpreter->responses = [F::question()]; $waiting = $f->service()->startChat(1, 'synthetic-query');
$result = answer($f, $waiting, 'same-answer', 'same-idem'); $calls = $f->modelCalls();
$replayed = answer($f, $waiting, 'same-answer', 'same-idem');
verify($replayed === $result && $f->modelCalls() === $calls, 'identical continuation idempotency replay returns the current saved result without charging again');
rejects(fn() => answer($f, $waiting, 'changed-answer', 'same-idem'), 'run_conflict', 'same idempotency key with changed answer is a conflict');
rejects(fn() => answer($f, $waiting, 'new-key-old-question', 'different-key'), 'run_conflict', 'stale question/version cannot be answered under a new key');
rejects(fn() => $f->service()->get(2, $result['run_id']), 'invalid_request', 'another actor cannot read a run');

foreach (['empty', 'ever_sent', 'friend', 'pending_in', 'pending_out', 'blocked'] as $condition) {
    $f = F::create($condition === 'empty' ? 0 : 1);
    if ($condition === 'ever_sent') { $f->contacts->history[2]['ever_sent'] = true; }
    if (in_array($condition, ['friend', 'pending_in', 'pending_out', 'blocked'], true)) { $f->contacts->current[2][$condition] = true; }
    $view = $f->service()->startStructured(1, F::query()); completed($view, 0, $condition . ' yields zero eligible summaries and no model call');
    verify($view['items'] === [] && $view['search_calls_used'] === 1 && count($f->reranker->calls) === 0, $condition . ' is real insufficiency without a ranking invocation');
}
$f = F::create(); $f->contacts->historySupported = false;
rejects(fn() => $f->service()->startStructured(1, F::query()), 'history_unavailable', 'missing complete historical eligibility fails before ordinary-list reuse');
verify($f->modelCalls() === 0 && $f->search->calls === [] && $f->profiles->requests === [], 'missing history consumes no model search or profile work');
$f = F::create(); $f->providers->unregister('synthetic-ai-provider');
rejects(fn() => $f->service()->startStructured(1, F::query()), 'provider_unconfigured', 'explicit AI request fails when the optional provider is absent');
verify(count($f->search->search($f->events->context, F::query())) === 3 && $f->modelCalls() === 0, 'backend rule search still works with no registered AI provider');
$f = F::create(); $f->platform->remaining = 0;
failed($f->service()->startStructured(1, F::query()), 'budget_exhausted', 0, 'unavailable platform allowance fails without an outbound model attempt');
verify($f->modelCalls() === 0 && $f->platform->reservations === [], 'platform quota failure does not create a fake successful permit');

foreach (['membership', 'policy', 'provider', 'profile', 'relationship', 'history', 'history_capability'] as $change) {
    $f = F::create(30);
    $f->reranker->onCall = static function () use ($f, $change): void {
        if ($change === 'membership') { $f->events->available = false; }
        if ($change === 'policy') { $f->policies->policy = new RulePolicy('synthetic-policy-new', $f->policies->policy->parameters); }
        if ($change === 'provider') { $f->providers->register('synthetic-ai-provider', new Interpreter(), new Reranker()); }
        if ($change === 'profile') { unset($f->profiles->rows[31]); }
        if ($change === 'relationship') { $f->contacts->current[31]['friend'] = true; $f->contacts->current[31]['version'] = 'new-relation'; }
        if ($change === 'history') { $f->contacts->history[31]['ever_sent'] = true; $f->contacts->history[31]['version'] = 'new-history'; }
        if ($change === 'history_capability') { $f->contacts->historySupported = false; }
    };
    $view = $f->service()->startStructured(1, F::query());
    failed($view, $change === 'history_capability' ? 'history_unavailable' : 'context_invalidated', 1, 'during-model ' . $change . ' change prevents publication');
    verify($view['applicability'] !== 'current' && !$view['repair_used'] && count($f->reranker->calls) === 1, $change . ' cannot be repaired into a stale success');
}
$f = F::create(); $f->reranker->onCall = static function () use ($f): void {
    $id = $f->platform->lastRunId(); $running = $f->service()->get(1, $id); $f->service()->cancel(1, $id, $running['version']);
};
$view = $f->service()->startStructured(1, F::query());
verify($view['interaction_status'] === 'cancelled' && $view['execution_status'] === 'cancelled' && $view['applicability'] === 'revoked' && $view['items'] === [] && $view['model_calls_used'] === 1, 'cancel during model execution discards the late result');
$f = F::create(); $f->platform->onReserve = static function ($platform, string $runId) use ($f): void {
    $running = $f->service()->get(1, $runId); $f->service()->cancel(1, $runId, $running['version']);
};
$view = $f->service()->startStructured(1, F::query());
verify($view['interaction_status'] === 'cancelled' && $view['items'] === [] && $f->modelCalls() === 0, 'cancel during quota reservation prevents starting the provider');

$f = F::create(); $view = $f->service()->startStructured(1, F::query()); $calls = $f->modelCalls(); $f->contacts->history[4]['ever_sent'] = true;
$read = $f->service()->get(1, $view['run_id']);
verify($read['items'] === [] && $read['execution_status'] === 'failed' && $read['applicability'] === 'revoked' && $f->modelCalls() === $calls, 'GET rechecks complete eligibility and hides revoked saved items without rerunning AI');
$f = F::create(); $view = $f->service()->startStructured(1, F::query()); $calls = $f->modelCalls(); $f->clock->time = $f->clock->time->modify('+15 minutes');
$read = $f->service()->get(1, $view['run_id']);
verify($read['items'] === [] && $read['applicability'] === 'superseded' && $f->modelCalls() === $calls, 'absolute session expiry invalidates saved results without renewal or model calls');
$f = F::create(); $view = $f->service()->startStructured(1, F::query());
$other = new AiRecommendationService($f->events, $f->policies, $f->queryValidator, $f->search, $f->profiles, $f->contacts, $f->platform, $f->providers, $f->clock);
rejects(fn() => $other->get(1, $view['run_id']), 'invalid_request', 'a new service instance cannot pretend to restore or reset an existing internal run');

$f = F::create();
foreach (['', str_repeat('a', 1537), "\xff"] as $message) { rejects(fn() => $f->service()->startChat(1, $message), 'invalid_request', 'unbounded empty or invalid UTF-8 chat input is rejected before work'); }
rejects(fn() => $f->service()->startStructured(1, new QueryIntent('person', F::query()->conditions, ['unconnected-self-attribute'])), 'invalid_request', 'unconnected self-attribute selection is not silently trusted');
rejects(fn() => $f->service()->startStructured(1, new QueryIntent('person', F::query()->conditions, [], 'unconnected-idea')), 'invalid_request', 'unconnected idea context is not silently trusted');
verify($f->modelCalls() === 0 && $f->search->calls === [], 'invalid inputs produce no model or candidate search work');

foreach (['policy', 'event'] as $upstream) {
    $f = F::create(); $f->interpreter->responses = [F::question()];
    $waiting = $f->service()->startChat(1, 'synthetic-query');
    $marker = 'synthetic-private-answer-' . $upstream;
    $fault = static function () use ($marker): void { throw new RuntimeException($marker); };
    if ($upstream === 'policy') { $f->policies->onCurrent = $fault; }
    else { $f->events->onCheck = $fault; }
    $view = answer($f, $waiting, key: 'upstream-answer-' . $upstream);
    failed($view, $upstream === 'event' ? 'context_invalidated' : 'provider_unavailable', 1, 'answer safely maps a raw ' . $upstream . ' authority exception');
    verify($view['question'] === null && !str_contains(json_encode($view, JSON_THROW_ON_ERROR), $marker)
        && $f->modelCalls() === 1 && count($f->platform->reservations) === 1 && $f->search->calls === [], 'answer ' . $upstream . ' failure clears the question without exposing details or charging a continuation');
    if ($upstream === 'event') { verify($view['applicability'] === 'revoked', 'answer revokes applicability after current-event authority failure'); }
    $f->policies->onCurrent = null; $f->events->onCheck = null;
    for ($read = 1; $read <= 3; $read++) {
        verify($f->service()->get(1, $view['run_id']) === $view, 'failed answer ' . $upstream . ' read ' . $read . ' keeps the exact terminal state and version');
    }
    verify($f->modelCalls() === 1 && count($f->platform->reservations) === 1, 'recovered ' . $upstream . ' authority cannot retry a failed continuation through GET');
}

$f = F::create(); $f->interpreter->responses = [F::question()]; $waiting = $f->service()->startChat(1, 'synthetic-query');
$f->events->onCheck = static function (): void { throw new RuntimeException('synthetic-private-cancel-marker'); };
rejects(fn() => $f->service()->cancel(1, $waiting['run_id'], $waiting['version']), 'context_invalidated', 'cancel maps a raw current-event exception to a safe error without chaining the upstream exception');
$f->events->onCheck = null;
verify($f->service()->get(1, $waiting['run_id']) === $waiting, 'failed cancellation does not mutate the original waiting question status or version');
$cancelled = $f->service()->cancel(1, $waiting['run_id'], $waiting['version']);
verify($cancelled['interaction_status'] === 'cancelled' && $cancelled['execution_status'] === 'cancelled'
    && $cancelled['applicability'] === 'revoked' && $cancelled['error'] === 'cancelled' && $cancelled['question'] === null
    && $cancelled['items'] === [] && $cancelled['version'] === $waiting['version'] + 1, 'authorized cancellation records one terminal transition and clears pending content');
for ($read = 1; $read <= 3; $read++) {
    verify($f->service()->get(1, $cancelled['run_id']) === $cancelled, 'cancelled read ' . $read . ' preserves the exact terminal state and version');
}
verify($f->modelCalls() === 1 && count($f->platform->reservations) === 1 && $f->search->calls === [], 'cancel and repeated cancelled GET consume no additional work or platform budget');

$f = F::create(); $f->reranker->responses = [new AiRecommendationException('provider_unavailable')];
$terminal = $f->service()->startStructured(1, F::query());
failed($terminal, 'provider_unavailable', 1, 'failed provider records its initial terminal state');
for ($read = 1; $read <= 3; $read++) {
    verify($f->service()->get(1, $terminal['run_id']) === $terminal, 'provider-failed read ' . $read . ' preserves the exact terminal state and version');
}
verify($f->modelCalls() === 1 && count($f->platform->reservations) === 1 && count($f->search->calls) === 1, 'repeated failed provider GET neither repeats recall nor spends another model attempt');

$f = F::create(); $intermediate = null;
$f->reranker->onCall = static function () use ($f, &$intermediate): void {
    $f->policies->onCurrent = static function ($policies): void {
        $policies->onCurrent = null;
        throw new RuntimeException('synthetic-private-transient-policy-marker');
    };
    $intermediate = $f->service()->get(1, $f->platform->lastRunId());
};
$view = $f->service()->startStructured(1, F::query());
failed($intermediate, 'provider_unavailable', 1, 'GET during reranking records a one-time policy authority failure');
verify($view === $intermediate && $view['items'] === [] && !$view['repair_used'], 'late valid reranker output cannot restore completion or rewrite the failed version');
verify($f->service()->get(1, $view['run_id']) === $view && $f->policies->onCurrent === null, 'recovered policy and later GET cannot revive the failed in-flight run');
verify($f->modelCalls() === 1 && count($f->platform->reservations) === 1 && count($f->search->calls) === 1
    && !str_contains(json_encode($view, JSON_THROW_ON_ERROR), 'synthetic-private-transient-policy-marker'), 'late-result rejection leaks no upstream details and uses no repair search or model attempt');

foreach ([
    'unsupported feature' => R::condition('unsupported_feature', 'similarity', ['social']),
    'unsupported operator' => R::condition('topics', 'unsupported_operator', ['social']),
    'wrong value type' => R::condition('topics', 'similarity', 42),
] as $case => $condition) {
    $f = F::create(); $view = $f->service()->startStructured(1, new QueryIntent('person', [$condition]));
    failed($view, 'invalid_request', 0, 'structured ' . $case . ' maps to invalid_request rather than provider failure');
    verify($view['search_calls_used'] === 0 && $f->search->calls === [] && $f->profiles->requests === []
        && $f->modelCalls() === 0 && $f->platform->reservations === [], 'structured ' . $case . ' is rejected before profile recall or model budget');
}

foreach (['completed', 'awaiting_input'] as $state) {
    $f = F::create();
    if ($state === 'awaiting_input') { $f->interpreter->responses = [F::question()]; }
    $original = $state === 'completed' ? $f->service()->startStructured(1, F::query()) : $f->service()->startChat(1, 'synthetic-query');
    $f->providers->unregister('synthetic-ai-provider');
    $view = $f->service()->get(1, $original['run_id']);
    failed($view, 'provider_unconfigured', 1, 'provider unregister safely fails an existing ' . $state . ' run');
    verify($view['applicability'] === 'superseded' && $view['question'] === null && $view['version'] === $original['version'] + 1, 'provider unregister supersedes ' . $state . ' content in one transition');
    $f->providers->register('synthetic-ai-provider', $f->interpreter, $f->reranker);
    verify($f->service()->get(1, $view['run_id']) === $view && $f->modelCalls() === 1 && count($f->platform->reservations) === 1, 'provider re-registration cannot revive the superseded ' . $state . ' run');
}

$f = F::create();
$f->reranker->onCall = static function () use ($f): void { $f->providers->unregister('synthetic-ai-provider'); };
$view = $f->service()->startStructured(1, F::query());
failed($view, 'provider_unconfigured', 1, 'provider unregister while reranking prevents a late result from being published');
verify($view['applicability'] === 'superseded' && !$view['repair_used'] && count($f->platform->reservations) === 1, 'in-flight provider unregister supersedes the result without a repair attempt');
echo json_encode(['status' => 'passed', 'scope' => 'Internal same-process AI run state and explicit finite platform quota using pure synthetic authorities and scripted providers. Not shared AIJob persistence or live provider validation.', 'checks' => count($checks), 'checks_passed' => $checks, 'network_calls' => 0, 'real_model_calls' => 0, 'production_database_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
