<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\application\ai;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CandidateRequest, CurrentEventContext, QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\{AiCandidateSearch, AiPlatformBudget, CandidateProjectionReader, Clock, ContactEligibilityReader, CurrentEventAccess, PolicyStore, RuleQueryValidator};
use humhub\modules\matcherRecommendation\domain\DiscoveryMatch;
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;
use humhub\modules\matcherRecommendation\domain\ai\{AiRecommendationException, InternalAiRun, MinimalCandidatePoolBuilder};

/**
 * Internal same-process staged orchestration. Explicit authorities only; no HTTP, worker or durable
 * AIJob registration. A lost process loses the session rather than silently resetting a saved budget.
 * Production cross-process CAS/idempotency needs the shared task/run store before exposing an API.
 */
final class AiRecommendationService
{
    /** @var array<string,InternalAiRun> */
    private array $runs = [];
    public function __construct(
        private readonly CurrentEventAccess $events, private readonly PolicyStore $policies,
        private readonly RuleQueryValidator $queryValidator, private readonly AiCandidateSearch $search,
        private readonly CandidateProjectionReader $profiles, private readonly ContactEligibilityReader $contacts,
        private readonly AiPlatformBudget $platform, #[\SensitiveParameter] private readonly AiProviderRegistry $providers,
        private readonly Clock $clock,
    ) {}

    public function startStructured(int $viewerId, #[\SensitiveParameter] QueryIntent $intent, ?int $requestedSpaceId = null): array
    {
        $this->assertIntentInput($intent);
        $run = $this->create($viewerId, 'structured', '', $requestedSpaceId);
        $run->intent = $intent;
        return $this->work($run);
    }
    public function startChat(int $viewerId, #[\SensitiveParameter] string $message, ?int $requestedSpaceId = null): array
    {
        if (trim($message) === '' || strlen($message) > 1536 || preg_match('//u', $message) !== 1) { throw new AiRecommendationException('invalid_request'); }
        return $this->work($this->create($viewerId, 'natural', $message, $requestedSpaceId));
    }
    public function answer(int $viewerId, string $runId, int $expectedVersion, string $questionId, #[\SensitiveParameter] string $answer, string $idempotencyKey): array
    {
        $run = $this->owned($viewerId, $runId);
        if (strlen($idempotencyKey) < 1 || strlen($idempotencyKey) > 128 || preg_match('/[\x00-\x20\x7f]/', $idempotencyKey)
            || trim($answer) === '' || strlen($answer) > 512 || preg_match('//u', $answer) !== 1) { throw new AiRecommendationException('invalid_request'); }
        $digest = Fingerprint::of([$expectedVersion, $questionId, $answer]);
        if (isset($run->answerKeys[$idempotencyKey])) {
            if ($run->answerKeys[$idempotencyKey] !== $digest) { throw new AiRecommendationException('run_conflict'); }
            return $this->get($viewerId, $runId);
        }
        if ($run->busy || $run->version !== $expectedVersion || $run->interaction !== 'awaiting_input' || ($run->question['id'] ?? null) !== $questionId) {
            throw new AiRecommendationException('run_conflict');
        }
        try { $this->guard($run); }
        catch (\Throwable $error) { $this->fail($run, $error); return $this->view($run); }
        $run->answerKeys[$idempotencyKey] = $digest;
        $run->answers[] = ['question' => $run->question['text'], 'answer' => $answer];
        $run->question = null; $run->interaction = 'processing'; $run->version++;
        return $this->work($run);
    }
    public function get(int $viewerId, string $runId): array
    {
        $run = $this->owned($viewerId, $runId);
        try {
            $this->guard($run);
            if ($run->interaction === 'completed' && $run->matches !== []) { $this->checkPool($run); $this->guard($run); }
        } catch (\Throwable $error) { $this->fail($run, $error); }
        return $this->view($run);
    }
    public function cancel(int $viewerId, string $runId, int $expectedVersion): array
    {
        $run = $this->owned($viewerId, $runId);
        if ($run->version !== $expectedVersion) { throw new AiRecommendationException('run_conflict'); }
        // The authenticated activity remains authoritative even for cancellation; no new provider call occurs.
        try { $this->events->assertCurrent($run->context); }
        catch (\Throwable) { throw new AiRecommendationException('context_invalidated'); }
        $run->interaction = 'cancelled'; $run->execution = 'cancelled'; $run->applicability = 'revoked';
        $run->items = []; $run->question = null; $run->error = 'cancelled'; $run->version++;
        return $this->view($run);
    }

    private function create(int $viewerId, string $mode, #[\SensitiveParameter] string $message, ?int $space): InternalAiRun
    {
        try {
            if ($viewerId < 1 || ($space !== null && $space < 1)) { throw new AiRecommendationException('invalid_request'); }
            // Missing historical eligibility blocks AI before projection reads, search or model costs.
            if (!$this->contacts->supportsSentHistory()) { throw new AiRecommendationException('history_unavailable'); }
            $provider = $this->providers->identity();
            $context = $this->events->resolve($viewerId, $space);
            if ($context->viewerId !== $viewerId || ($space !== null && $context->spaceId !== $space)) { throw new AiRecommendationException('context_invalidated'); }
            $this->events->assertCurrent($context); $policy = $this->policies->current($context);
            $now = $this->clock->now();
            foreach ($this->runs as $id => $old) { if (!$old->busy && $now >= $old->expiresAt) { unset($this->runs[$id]); } }
            if (count($this->runs) >= 128) { throw new AiRecommendationException('budget_exhausted'); }
            $run = new InternalAiRun(bin2hex(random_bytes(24)), $context, $provider, $policy, $mode, $message, $now, $now->add(new \DateInterval('PT15M')));
            $this->guard($run); $this->runs[$run->id] = $run; return $run;
        } catch (AiRecommendationException $error) { throw new AiRecommendationException($error->reason); }
        catch (\Throwable) { throw new AiRecommendationException('provider_unavailable'); }
    }
    private function owned(int $viewerId, string $id): InternalAiRun
    {
        $run = $this->runs[$id] ?? null;
        if ($run === null || $run->context->viewerId !== $viewerId) { throw new AiRecommendationException('invalid_request'); }
        return $run;
    }
    private function work(#[\SensitiveParameter] InternalAiRun $run): array
    {
        if ($run->busy) { throw new AiRecommendationException('run_conflict'); }
        $run->busy = true; $run->execution = 'running';
        try {
            $this->guard($run);
            if ($run->intent === null) {
                $input = ['target_type' => 'person', 'message' => $run->message, 'allowed_conditions' => $this->allowed($run),
                    'schema_version' => 'recommendation-query-v1', 'prompt_version' => 'recommendation-interpret-v1', 'clarifications' => $run->answers];
                $draft = $this->attempt($run, 'interpret', function (string $permit) use ($run, $input): array {
                    $value = $this->providers->interpreter()->interpret($input, $permit);
                    $this->guard($run); return $this->interpretation($run, $value);
                }, 1);
                if ($draft['status'] === 'clarification') {
                    if ($run->rounds >= 3) { throw new AiRecommendationException('clarification_limit'); }
                    // A question needs one future condition-generation call AND one rerank, even after an early repair.
                    if ($run->calls + 2 > 5) { throw new AiRecommendationException('budget_exhausted'); }
                    $run->rounds++;
                    $run->question = ['id' => 'q-' . bin2hex(random_bytes(12)), 'kind' => 'clarification', 'text' => $draft['question']['text'], 'options' => $draft['question']['options'], 'allow_free_text' => true];
                    $run->interaction = 'awaiting_input'; $run->execution = 'succeeded'; $run->version++;
                    return $this->view($run);
                }
                $run->intent = new QueryIntent('person', $draft['conditions']);
            }
            try { $this->queryValidator->validateQuery($run->intent, $run->policy); }
            catch (\Throwable) { throw new AiRecommendationException('invalid_request'); }
            if ($run->searchUsed) { throw new AiRecommendationException('run_conflict'); }
            $run->searchUsed = true; $run->version++;
            $rows = $this->search->search($run->context, $run->intent);
            $this->guard($run);
            [$run->matches, $run->authorizationFingerprint] = $this->authorizeMatches($run, $rows, true);
            $pool = (new MinimalCandidatePoolBuilder())->build($run->context, $run->intent, $run->policy, $run->matches);
            $items = [];
            if (!$pool->isEmpty()) {
                $this->checkPool($run);
                $items = $this->attempt($run, 'rerank', function (string $permit) use ($run, $pool): array {
                    $output = $this->providers->reranker()->rerank($run->intent, $pool->summaries, $permit);
                    $this->guard($run); $this->checkPool($run);
                    return (new ValidateAiRerankOutput())->validate($pool, $output);
                });
            }
            $this->guard($run); $this->checkPool($run); $this->guard($run);
            $run->items = $items; $run->interaction = 'completed'; $run->execution = 'succeeded'; $run->version++;
        } catch (\Throwable $error) { $this->fail($run, $error); }
        finally { $run->busy = false; }
        return $this->view($run);
    }

    private function attempt(#[\SensitiveParameter] InternalAiRun $run, string $stage, #[\SensitiveParameter] callable $operation, int $requiredAfter = 0): mixed
    {
        try { return $operation($this->permit($run, $stage, $requiredAfter)); }
        catch (AiRecommendationException $error) {
            if ($error->reason !== 'invalid_model_output' || $run->repairUsed) { throw new AiRecommendationException($error->reason); }
            $this->guard($run);
            if ($run->calls + 1 + $requiredAfter > $this->callLimit($run)) { throw new AiRecommendationException('budget_exhausted'); }
            $run->repairUsed = true; $run->version++;
            return $operation($this->permit($run, $stage . '_repair', $requiredAfter));
        }
    }
    private function permit(#[\SensitiveParameter] InternalAiRun $run, string $stage, int $requiredAfter): string
    {
        $this->guard($run);
        if ($run->calls + 1 + $requiredAfter > $this->callLimit($run)) { throw new AiRecommendationException('budget_exhausted'); }
        $permit = 'attempt-' . bin2hex(random_bytes(24));
        $run->version++; // Claim this operation before waiting on an external platform quota adapter.
        try { $this->platform->reserveAttempt($run->id, $stage, $permit); }
        catch (\Throwable) { throw new AiRecommendationException('budget_exhausted'); }
        $this->guard($run);
        if ($run->matches !== []) { $this->checkPool($run); $this->guard($run); }
        $run->calls++; $run->version++;
        return $permit;
    }
    private function callLimit(InternalAiRun $run): int { return $run->mode === 'structured' ? 2 : ($run->rounds > 0 ? 5 : 3); }

    private function guard(#[\SensitiveParameter] InternalAiRun $run): void
    {
        if ($run->interaction === 'cancelled') { throw new AiRecommendationException('cancelled'); }
        if ($run->interaction === 'failed') { throw new AiRecommendationException($run->error ?? 'provider_unavailable'); }
        if ($run->applicability !== 'current') { throw new AiRecommendationException('context_invalidated'); }
        if ($this->clock->now() >= $run->expiresAt || $this->clock->now() < $run->createdAt) { $run->applicability = 'superseded'; throw new AiRecommendationException('context_invalidated'); }
        if (!$this->contacts->supportsSentHistory()) { $run->applicability = 'revoked'; throw new AiRecommendationException('history_unavailable'); }
        try { $this->events->assertCurrent($run->context); }
        catch (\Throwable) { $run->applicability = 'revoked'; throw new AiRecommendationException('context_invalidated'); }
        try { $identity = $this->providers->identity(); }
        catch (AiRecommendationException $error) { $run->applicability = 'superseded'; throw new AiRecommendationException($error->reason); }
        if ($identity !== $run->providerIdentity || Fingerprint::of($this->policies->current($run->context)) !== Fingerprint::of($run->policy)) {
            $run->applicability = 'superseded'; throw new AiRecommendationException('context_invalidated');
        }
    }
    private function checkPool(#[\SensitiveParameter] InternalAiRun $run): void
    {
        if ($run->authorizationFingerprint === null) { return; }
        [, $current] = $this->authorizeMatches($run, $run->matches, false);
        if ($current !== $run->authorizationFingerprint) { $run->applicability = 'revoked'; throw new AiRecommendationException('context_invalidated'); }
    }
    /** @return array{array,string} */
    private function authorizeMatches(#[\SensitiveParameter] InternalAiRun $run, #[\SensitiveParameter] array $matches, bool $filter): array
    {
        if (!array_is_list($matches) || count($matches) > CandidateRequest::MAX_CANDIDATES) { throw new AiRecommendationException('provider_unavailable'); }
        $ids = []; $map = [];
        foreach ($matches as $match) {
            if (!$match instanceof DiscoveryMatch || !$match->assessment->qualifies || $match->candidate->targetType !== 'person'
                || $match->candidate->spaceId !== $run->context->spaceId || $match->candidate->targetId === (string)$run->context->viewerId
                || isset($map[$match->candidate->targetId])) { throw new AiRecommendationException('provider_unavailable'); }
            $ids[] = $match->candidate->targetId; $map[$match->candidate->targetId] = $match;
        }
        if ($ids === []) { return [[], Fingerprint::of([])]; }
        $request = new CandidateRequest($run->context, 'person', $ids);
        $fresh = $this->profiles->read($request); $relations = $this->contacts->readCurrent($request); $history = $this->contacts->readSentHistory($request);
        if (!array_is_list($fresh) || count($fresh) !== count($ids) || count($relations) !== count($ids) || count($history) !== count($ids)) {
            $run->applicability = 'revoked'; throw new AiRecommendationException('context_invalidated');
        }
        $freshMap = [];
        foreach ($fresh as $row) {
            if (!$row instanceof CandidateProjection || !isset($map[$row->targetId]) || isset($freshMap[$row->targetId])
                || Fingerprint::of($row) !== Fingerprint::of($map[$row->targetId]->candidate)) { $run->applicability = 'revoked'; throw new AiRecommendationException('context_invalidated'); }
            $freshMap[$row->targetId] = $row;
        }
        $selected = []; $fingerprints = [];
        foreach ($ids as $id) {
            $relation = $relations[$id] ?? null; $sent = $history[$id] ?? null;
            if (!is_array($relation) || !is_array($sent)) { throw new AiRecommendationException('provider_unavailable'); }
            $keys = array_keys($relation); sort($keys); $historyKeys = array_keys($sent); sort($historyKeys);
            if ($keys !== ['blocked', 'friend', 'pending_in', 'pending_out', 'version'] || $historyKeys !== ['ever_sent', 'version']
                || !is_string($relation['version']) || trim($relation['version']) === '' || !is_string($sent['version']) || trim($sent['version']) === '' || !is_bool($sent['ever_sent'])) { throw new AiRecommendationException('provider_unavailable'); }
            foreach (['blocked', 'friend', 'pending_in', 'pending_out'] as $key) { if (!is_bool($relation[$key])) { throw new AiRecommendationException('provider_unavailable'); } }
            $eligible = !$sent['ever_sent'] && !$relation['blocked'] && !$relation['friend'] && !$relation['pending_in'] && !$relation['pending_out'];
            if (!$eligible) {
                if ($filter) { continue; }
                $run->applicability = 'revoked'; throw new AiRecommendationException('context_invalidated');
            }
            $selected[] = new DiscoveryMatch($freshMap[$id], $map[$id]->assessment, $relation);
            $fingerprints[$id] = Fingerprint::of([$freshMap[$id], $relation, $sent]);
        }
        ksort($fingerprints, SORT_STRING); return [$selected, Fingerprint::of($fingerprints)];
    }

    private function allowed(InternalAiRun $run): array
    {
        $out = [];
        foreach ($run->policy->parameters['rules'] ?? [] as $rule) {
            if (is_string($rule['query_feature'] ?? null) && is_string($rule['operator'] ?? null)) {
                $row = ['feature' => $rule['query_feature'], 'operator' => $rule['operator']]; $out[Fingerprint::of($row)] = $row;
            }
        }
        if ($out === []) { throw new AiRecommendationException('invalid_request'); }
        return array_values($out);
    }
    private function interpretation(InternalAiRun $run, #[\SensitiveParameter] array $value): array
    {
        try {
            $keys = array_keys($value); sort($keys);
            if ($keys !== ['conditions', 'question', 'status'] || !in_array($value['status'], ['ready', 'clarification'], true) || !is_array($value['conditions']) || !array_is_list($value['conditions'])) { throw new \InvalidArgumentException(); }
            if ($value['status'] === 'clarification') {
                $q = $value['question'];
                if ($value['conditions'] !== [] || !is_array($q)) { throw new \InvalidArgumentException(); }
                $qKeys = array_keys($q); sort($qKeys);
                if ($qKeys !== ['options', 'text'] || !is_string($q['text']) || trim($q['text']) === '' || strlen($q['text']) > 512 || preg_match('//u', $q['text']) !== 1
                    || !is_array($q['options']) || !array_is_list($q['options']) || count($q['options']) < 2 || count($q['options']) > 6) { throw new \InvalidArgumentException(); }
                foreach ($q['options'] as $option) { if (!is_string($option) || trim($option) === '' || strlen($option) > 160 || preg_match('//u', $option) !== 1) { throw new \InvalidArgumentException(); } }
            } else {
                if ($value['question'] !== null || $value['conditions'] === [] || count($value['conditions']) > 16) { throw new \InvalidArgumentException(); }
                foreach ($value['conditions'] as $condition) { if (($condition['strength'] ?? null) !== 'soft' || ($condition['origin'] ?? null) !== 'interpreted_draft') { throw new \InvalidArgumentException(); } }
                $intent = new QueryIntent('person', $value['conditions']); $this->assertIntentInput($intent);
                $this->queryValidator->validateQuery($intent, $run->policy);
            }
            return $value;
        } catch (\Throwable) { throw new AiRecommendationException('invalid_model_output'); }
    }
    private function assertIntentInput(#[\SensitiveParameter] QueryIntent $intent): void
    {
        if ($intent->targetType !== 'person' || $intent->selectedSelfAttributeIds !== [] || $intent->currentIdeaId !== null || count($intent->conditions) > 16
            || strlen(json_encode($intent, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)) > 1536) { throw new AiRecommendationException('invalid_request'); }
    }
    private function fail(#[\SensitiveParameter] InternalAiRun $run, #[\SensitiveParameter] \Throwable $error): void
    {
        // Terminal reads and late provider completions cannot rewrite a failed/cancelled run or its version.
        if (in_array($run->interaction, ['failed', 'cancelled'], true)) { return; }
        $reason = $error instanceof AiRecommendationException ? $error->reason : 'provider_unavailable';
        $run->error = $reason; $run->items = []; $run->question = null;
        if ($run->interaction === 'cancelled' || $reason === 'cancelled') { $run->interaction = 'cancelled'; $run->execution = 'cancelled'; $run->applicability = 'revoked'; }
        else { $run->interaction = 'failed'; $run->execution = 'failed'; }
        $run->version++;
    }
    private function view(InternalAiRun $run): array
    {
        return ['run_id' => $run->id, 'version' => $run->version, 'interaction_status' => $run->interaction, 'execution_status' => $run->execution,
            'applicability' => $run->applicability, 'model_calls_used' => $run->calls, 'clarification_round' => $run->rounds,
            'search_calls_used' => $run->searchUsed ? 1 : 0, 'repair_used' => $run->repairUsed, 'question' => $run->question,
            'items' => $run->applicability === 'current' ? $run->items : [], 'error' => $run->error, 'can_use_filters' => $run->interaction === 'failed'];
    }
    public function __serialize(): array { throw new \LogicException('AI orchestration requires an explicit durable run adapter.'); }
    public function __unserialize(#[\SensitiveParameter] array $data): void { throw new \LogicException('AI orchestration cannot be restored.'); }
    public function __debugInfo(): array { return ['internal_run_count' => count($this->runs)]; }
}
