<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\application\conversation;

use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CandidateRequest, CurrentEventContext, QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\{AiCandidateSearch, AiPlatformBudget, CandidateProjectionReader, Clock, ContactEligibilityReader, ConversationProvider, ConversationStore, CurrentEventAccess, PolicyStore, RuleQueryValidator};
use humhub\modules\matcherRecommendation\domain\{DiscoveryMatch, RulePolicy};
use humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException;
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;
use humhub\modules\matcherRecommendation\domain\conversation\{ConversationCandidateSummaries, ConversationInput, ConversationLimits};
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;

/** Durable internal use case. HTTP, database, model, and hosting framework remain outside the core. */
final class ConversationService
{
    private const INPUT_BYTES = 16384;
    private const LEASE_SECONDS = 180;
    private const SNAPSHOT_BYTES = 196608;
    public function __construct(
        private readonly CurrentEventAccess $events, private readonly PolicyStore $policies,
        private readonly RuleQueryValidator $queryValidator, private readonly AiCandidateSearch $search,
        private readonly CandidateProjectionReader $profiles, private readonly ContactEligibilityReader $contacts,
        private readonly AiPlatformBudget $platform, private readonly ConversationProvider $provider,
        private readonly ConversationStore $store, private readonly Clock $clock,
        private readonly ConversationLimits $limits, private readonly string $providerIdentity = 'conversation-provider-v1',
        private readonly ?\humhub\modules\matcherRecommendation\contracts\ports\ConversationRuntimeGuard $runtime = null,
    ) {}

    public function create(int $viewerId, ?int $spaceId = null, ?string $creationKey = null): array
    {
        if ($viewerId < 1 || ($spaceId !== null && $spaceId < 1)) { throw new AiRecommendationException('invalid_request'); }
        if ($creationKey !== null && !preg_match('/^[A-Za-z0-9_.:-]{1,128}$/D', $creationKey)) { throw new AiRecommendationException('invalid_request'); }
        $this->runtime?->assertCurrent($this->providerIdentity);
        $this->historyCapability();
        $context = $this->events->resolve($viewerId, $spaceId); $this->events->assertCurrent($context);
        if ($context->viewerId !== $viewerId || ($spaceId !== null && $context->spaceId !== $spaceId)) { throw new AiRecommendationException('context_invalidated'); }
        $policy = $this->policies->current($context);
        $id = $creationKey === null ? $this->id('conversation') : 'conversation-' . hash('sha256', $viewerId . ':' . $context->spaceId . ':create-empty:' . $creationKey);
        if ($creationKey !== null && $this->store->load($id, $viewerId) !== null) { return $this->get($viewerId, $id); }
        $state = ['id' => $id, 'owner_id' => $viewerId, 'event_id' => $context->spaceId, 'version' => 1,
            'context' => get_object_vars($context), 'policy_hash' => Fingerprint::of($policy), 'provider_identity' => $this->providerIdentity,
            'limits_hash' => Fingerprint::of($this->limits), 'created_at' => $this->time(), 'updated_at' => $this->time(),
            'interaction_status' => 'ready', 'execution_status' => 'succeeded', 'applicability' => 'current', 'calls_used' => 0,
            'turns' => [], 'runs' => [], 'current_run_id' => null, 'current_batch' => null, 'seen_ids' => [],
            'requirements' => ['messages' => [], 'conditions' => []], 'requirements_version' => 1, 'confirmed_conditions' => [],
            'pending_confirmation' => null, 'withdrawn_condition_keys' => [], 'requirement_source_batches' => [], 'conditions_source_batch_ids' => [],
            'provenance_version' => 2, 'inflight' => null, 'error' => null];
        try { $this->store->create($id, $viewerId, $context->spaceId, $state); }
        catch (\Throwable $error) {
            if ($creationKey === null || $this->store->load($id, $viewerId) === null) { throw $error; }
        }
        return $this->get($viewerId, $id);
    }

    /** confirmedIntent is a trusted, explicit user replacement of the COMPLETE confirmed hard/soft snapshot.
     * expectedVersion binds it to the currently displayed pending state. Empty conditions explicitly withdraw all.
     * Model output, ordinary chat text and refresh commands never constitute this confirmation. */
    public function submit(int $viewerId, string $conversationId, int $expectedVersion, #[\SensitiveParameter] string $message,
        string $idempotencyKey, string $command = 'chat', ?QueryIntent $confirmedIntent = null, ?int $requirementsVersion = null): array
    {
        if (!ConversationInput::text($message, 3072) || !preg_match('/^[A-Za-z0-9_.:-]{1,128}$/D', $idempotencyKey)
            || !in_array($command, ['chat', 'recommend', 'refresh'], true)) { throw new AiRecommendationException('invalid_request'); }
        $state = $this->load($viewerId, $conversationId);
        $digest = Fingerprint::of([$expectedVersion, $message, $command, $confirmedIntent, $requirementsVersion]);
        foreach ($state['turns'] as $turn) {
            if ($turn['idempotency_key'] !== $idempotencyKey) { continue; }
            if ($turn['input_hash'] !== $digest) { throw new AiRecommendationException('run_conflict'); }
            return $this->get($viewerId, $conversationId);
        }
        if ($state['version'] !== $expectedVersion || $state['inflight'] !== null) { throw new AiRecommendationException('run_conflict'); }
        if (count($state['turns']) >= $this->limits->maxTurns) { throw new AiRecommendationException('budget_exhausted'); }
        $policy = $this->guard($state);
        try { $this->revalidateSources($state); }
        catch (\Throwable $error) { $this->fail($state, $error); return $this->view($state); }
        if ($state['version'] !== $expectedVersion || ($requirementsVersion !== null && $state['requirements_version'] !== $requirementsVersion)) { throw new AiRecommendationException('run_conflict'); }
        $visibleSources = $this->visibleBatchIds($state);
        $runId = $state['current_run_id']; $run = $runId === null ? null : $state['runs'][$runId];
        $discussion = $command === 'chat' && $run !== null && $run['status'] === 'completed';
        if ($confirmedIntent !== null && $discussion) { throw new AiRecommendationException('invalid_request'); }
        if ($confirmedIntent !== null) {
            try {
                if ($confirmedIntent->targetType !== 'person' || $confirmedIntent->selectedSelfAttributeIds !== [] || $confirmedIntent->currentIdeaId !== null || count($confirmedIntent->conditions) > 16) { throw new \InvalidArgumentException(); }
                foreach ($confirmedIntent->conditions as $condition) { if ($condition['origin'] !== 'user_confirmed') { throw new \InvalidArgumentException(); } }
                $this->queryValidator->validateQuery($confirmedIntent, $policy); ConversationInput::assertTypes($confirmedIntent, $policy);
            } catch (\Throwable) { throw new AiRecommendationException('invalid_request'); }
        }
        if ($command === 'refresh' && ($run === null || in_array($run['status'], ['processing', 'awaiting_input'], true))) { throw new AiRecommendationException('run_conflict'); }
        if ($command === 'recommend' && $run !== null && $run['status'] !== 'awaiting_input') { throw new AiRecommendationException('run_conflict'); }
        if ($command === 'chat' && $run !== null && $run['status'] === 'failed') { return $this->get($viewerId, $conversationId); }
        if ($discussion && $state['current_batch'] !== null) { $this->authorizeRefs($state, $state['current_batch']['refs']); }
        if (!$discussion) {
            if ($run === null || $command === 'refresh') {
                $runId = $this->id('run');
                $state['runs'][$runId] = ['id' => $runId, 'status' => 'processing', 'calls_used' => 0, 'clarification_round' => 0,
                    'repair_used' => false, 'search_calls_used' => 0, 'conditions' => [], 'batch' => null];
                $state['current_run_id'] = $runId; $state['current_batch'] = null;
            }
            $state['requirements']['messages'][] = $message;
            if ($confirmedIntent !== null) {
                $newKeys = []; foreach ($confirmedIntent->conditions as $condition) { $newKeys[ConversationInput::conditionKey($condition, $policy)] = true; }
                foreach ($state['confirmed_conditions'] as $condition) {
                    $key = ConversationInput::conditionKey($condition, $policy);
                    if (!isset($newKeys[$key])) { $state['withdrawn_condition_keys'][$key] = true; }
                }
                foreach ($newKeys as $key => $_) { unset($state['withdrawn_condition_keys'][$key]); }
                $state['confirmed_conditions'] = $confirmedIntent->conditions;
                $state['requirements']['conditions'] = $confirmedIntent->conditions;
                $state['conditions_source_batch_ids'] = $visibleSources;
                $state['requirements_version']++;
                $state['pending_confirmation'] = null;
            }
            $state['requirement_source_batches'][] = $visibleSources;
        }
        $turnId = $this->id('turn');
        if ($confirmedIntent === null && $this->mentionsHardRequirement($message)) {
            $state['requirements_version']++;
            $state['pending_confirmation'] = ['version' => $state['requirements_version'], 'source_turn_ids' => array_values(array_unique(array_merge($state['pending_confirmation']['source_turn_ids'] ?? [], [$turnId])))];
        }
        $state['turns'][] = ['turn_id' => $turnId, 'idempotency_key' => $idempotencyKey, 'input_hash' => $digest,
            'user_message' => $message, 'command' => $command, 'run_id' => $runId, 'batch_id' => $discussion ? ($state['current_batch']['batch_id'] ?? null) : null,
            'message' => '', 'items' => [], 'events' => [], 'calls_used' => 0, 'status' => 'processing', 'error' => null,
            'source_batch_ids' => $visibleSources, 'source_valid' => true];
        $state['inflight'] = ['token' => $this->id('claim'), 'expires_at' => $this->time() + self::LEASE_SECONDS];
        $state['interaction_status'] = 'processing'; $state['execution_status'] = 'running'; $state['error'] = null;
        $this->save($state);
        try {
            if ($state['pending_confirmation'] !== null) { $this->awaitConfirmation($state, $discussion); }
            elseif ($discussion) { $this->discuss($state, $policy); }
            else { $this->recommend($state, $policy, $confirmedIntent !== null); }
            $this->guard($state); $this->ownedClaim($state);
            $state['execution_status'] = 'succeeded'; $state['inflight'] = null;
            $state['turns'][array_key_last($state['turns'])]['status'] = 'completed';
            $this->save($state);
        } catch (\Throwable $error) { $this->fail($state, $error); }
        return $this->get($viewerId, $conversationId);
    }

    public function get(int $viewerId, string $id): array
    {
        $state = $this->load($viewerId, $id);
        if ($state['applicability'] !== 'current') { return $this->view($state); }
        try {
            $this->guard($state);
            if ($state['inflight'] !== null && $this->time() >= $state['inflight']['expires_at']) { throw new AiRecommendationException('provider_unavailable'); }
            $this->revalidateSources($state);
        } catch (\Throwable $error) {
            $this->redactCandidateTurns($state); $state['current_batch'] = null;
            $state['applicability'] = 'revoked'; $this->fail($state, $error);
        }
        return $this->view($state);
    }

    private function recommend(array &$state, RulePolicy $policy, bool $confirmed): void
    {
        $runId = $state['current_run_id']; $run = &$state['runs'][$runId];
        $state['turns'][array_key_last($state['turns'])]['source_batch_ids'] = $this->inputDependencies($state);
        $input = ['schema_version' => 'conversation-v1', 'message' => $this->turn($state)['user_message'],
            'history' => $this->history($state), 'requirements' => $state['requirements'], 'field_catalog' => ConversationInput::catalog($policy),
            'allowed_actions' => ['clarify', 'search', 'discuss'], 'request_byte_limit' => $policy->parameters['limits']['request_bytes']];
        $this->bytes($input, $policy);
        $draft = $this->attempt($state, 'plan', false, function (string $permit) use ($input, $policy): array {
            return $this->validatePlan($this->provider->plan($input, $permit), $policy);
        }, 1);
        $unconfirmedHard = $state['pending_confirmation'] !== null;
        if ($draft['action'] !== 'search' || $unconfirmedHard) {
            if ($run['clarification_round'] >= 3) { throw new AiRecommendationException('clarification_limit'); }
            if ($run['calls_used'] + 2 > 5) { throw new AiRecommendationException('budget_exhausted'); }
            $run['clarification_round']++; $run['status'] = 'awaiting_input'; $state['interaction_status'] = 'awaiting_input';
            $this->setMessage($state, $unconfirmedHard && $draft['action'] === 'search'
                ? '你提到了不可放宽的条件，请先确认哪些条件属于硬要求，我会据此筛选，不把它当成普通偏好。' : $draft['message']);
            return;
        }
        $confirmedConditions = $state['confirmed_conditions'];
        $confirmedKeys = []; foreach ($confirmedConditions as $c) { $confirmedKeys[ConversationInput::conditionKey($c, $policy)] = true; }
        $soft = array_values(array_filter($draft['conditions'], static function (array $c) use ($confirmedKeys, $state, $policy): bool {
            $key = ConversationInput::conditionKey($c, $policy);
            return !isset($confirmedKeys[$key]) && !isset($state['withdrawn_condition_keys'][$key]);
        }));
        $intent = new QueryIntent('person', array_merge($confirmedConditions, $soft));
        if (count($intent->conditions) > 16) { throw new AiRecommendationException('invalid_model_output'); }
        $this->queryValidator->validateQuery($intent, $policy); ConversationInput::assertTypes($intent, $policy);
        $state['requirements']['conditions'] = $intent->conditions; $run['conditions'] = $intent->conditions;
        $state['conditions_source_batch_ids'] = $this->turn($state)['source_batch_ids'];
        if ($run['search_calls_used'] !== 0) { throw new AiRecommendationException('run_conflict'); }
        $run['search_calls_used'] = 1; $this->event($state, ['type' => 'tool_started', 'tool' => 'search_candidates', 'message' => '正在查询本次活动中有权推荐的人。']); $this->save($state);
        $matches = $this->search->search($this->context($state), $intent); $this->guard($state); $this->ownedClaim($state);
        $matches = array_values(array_filter($matches, static fn(DiscoveryMatch $m): bool => !in_array($m->candidate->targetId, $state['seen_ids'], true)));
        [$matches, $refs] = $this->authorizeMatches($state, $matches);
        $pack = (new ConversationCandidateSummaries())->build($matches, $intent, $policy);
        if ($pack['candidates'] === []) {
            $this->event($state, ['type' => 'tool_completed', 'tool' => 'search_candidates', 'candidate_count' => count($matches), 'model_candidate_count' => 0, 'message' => '本次活动检索完成，没有足够任务依据的可发送候选。']);
            $run['status'] = 'completed'; $state['interaction_status'] = 'completed';
            $this->setMessage($state, '这次没有找到同时满足已确认条件、又有足够任务依据的候选人。可以明确调整条件后再推荐；我不会跨活动补人。');
            return;
        }
        $input = $this->responseInput($state, 'recommend', $pack['candidates'], $policy);
        while (strlen(ConversationInput::json($input)) > $this->inputBudget($policy) && count($input['candidates']) > 1) { array_pop($input['candidates']); }
        $this->bytes($input, $policy); $sentIds = array_column($input['candidates'], 'id');
        $this->event($state, ['type' => 'tool_completed', 'tool' => 'search_candidates', 'candidate_count' => count($matches), 'model_candidate_count' => count($sentIds), 'message' => '本次活动检索完成，正在核对任务依据与未知项。']);
        $answer = $this->attempt($state, 'respond', false, function (string $permit) use ($input, &$state, $refs): array {
            $this->authorizeRefs($state, $refs);
            $value = $this->provider->respond($input, $permit);
            $this->authorizeRefs($state, $refs);
            return $this->validateResponse($value, $input, true);
        });
        $items = []; $batchId = $this->id('batch');
        foreach ($answer['items'] as $i => $item) {
            $source = array_values(array_filter($input['candidates'], static fn(array $c): bool => $c['id'] === $item['id']))[0];
            $references = [];
            foreach ($item['fact_ids'] as $factId) {
                $atom = $pack['facts'][$item['id']][$factId];
                $references[] = ['fact_id' => $factId, 'atom_hash' => $atom['atom_hash'], 'feature' => $atom['feature'],
                    'evidence_refs' => array_map(static fn(object $ref): array => get_object_vars($ref), $atom['evidence'])];
            }
            $items[] = $item + ['rule_score' => $source['rule_score'], 'ai_rank' => $i + 1,
                'fact_scope_id' => $batchId, 'fact_references' => $references];
        }
        $ids = array_column($items, 'id');
        $batch = ['batch_id' => $batchId, 'display_version' => 1, 'ordered_ids' => $ids, 'items' => $items,
            'refs' => array_intersect_key($refs, array_flip($ids)), 'source_refs' => array_intersect_key($refs, array_flip($sentIds)),
            'source_batch_ids' => $this->turn($state)['source_batch_ids'], 'conditions' => $intent->conditions, 'valid' => true];
        $state['current_batch'] = $batch; $run['batch'] = $batch; $run['status'] = 'completed';
        $state['seen_ids'] = array_values(array_unique(array_merge($state['seen_ids'], $ids)));
        $state['interaction_status'] = 'completed';
        $index = array_key_last($state['turns']); $state['turns'][$index]['batch_id'] = $batchId; $state['turns'][$index]['items'] = $items;
        $this->setMessage($state, $answer['message']);
    }

    private function discuss(array &$state, RulePolicy $policy): void
    {
        $batch = $state['current_batch'];
        if ($batch === null || $batch['ordered_ids'] === []) {
            $state['interaction_status'] = 'completed'; $this->setMessage($state, '当前没有可讨论的合格名单。若想改变条件重新找人，请明确发起一轮推荐。'); return;
        }
        $state['turns'][array_key_last($state['turns'])]['source_batch_ids'] = $this->inputDependencies($state);
        $this->authorizeRefs($state, $batch['source_refs']);
        $fresh = $this->authorizeRefs($state, $batch['refs']); $intent = new QueryIntent('person', $batch['conditions']);
        $matches = []; $evaluator = new DeterministicRuleEvaluator();
        foreach ($batch['ordered_ids'] as $id) {
            $row = $fresh[$id]; $assessment = $evaluator->evaluate($this->context($state), $intent, $row['projection'], $policy, ['structured' => 1]);
            if (!$assessment->qualifies) { throw new AiRecommendationException('context_invalidated'); }
            $matches[] = new DiscoveryMatch($row['projection'], $assessment, $row['relation']);
        }
        $pack = (new ConversationCandidateSummaries())->build($matches, $intent, $policy);
        if (array_column($pack['candidates'], 'id') !== $batch['ordered_ids']) { throw new AiRecommendationException('context_invalidated'); }
        $input = $this->responseInput($state, 'discuss', $pack['candidates'], $policy); $this->bytes($input, $policy);
        $answer = $this->attempt($state, 'discussion', true, function (string $permit) use ($input, &$state, $batch): array {
            $this->authorizeRefs($state, $batch['source_refs']);
            $value = $this->provider->respond($input, $permit);
            $this->authorizeRefs($state, $batch['source_refs']);
            return $this->validateResponse($value, $input, false);
        });
        $this->setMessage($state, $answer['message']);
        $state['turns'][array_key_last($state['turns'])]['items'] = $answer['items'];
        $state['interaction_status'] = 'completed';
    }

    private function attempt(array &$state, string $stage, bool $discussion, callable $operation, int $requiredAfter = 0): array
    {
        try { return $this->call($state, $stage, $discussion, $operation, $requiredAfter); }
        catch (AiRecommendationException $error) {
            $run = &$state['runs'][$state['current_run_id']]; $turn = $this->turn($state);
            if ($error->reason !== 'invalid_model_output' || (!$discussion && $run['repair_used']) || ($discussion && $turn['calls_used'] >= $this->limits->discussionCalls)) { throw $error; }
            if (!$discussion) { $run['repair_used'] = true; }
            $this->save($state);
            return $this->call($state, $stage . '_repair', $discussion, $operation, $requiredAfter);
        }
    }
    private function call(array &$state, string $stage, bool $discussion, callable $operation, int $requiredAfter): array
    {
        $this->guard($state); $this->ownedClaim($state);
        $this->assertDependencies($state, $this->turn($state)['source_batch_ids']);
        $run = &$state['runs'][$state['current_run_id']]; $index = array_key_last($state['turns']);
        $limit = $run['clarification_round'] > 0 ? 5 : 3;
        if ($state['calls_used'] + 1 > $this->limits->maxCalls
            || ($discussion ? $state['turns'][$index]['calls_used'] + 1 > $this->limits->discussionCalls : $run['calls_used'] + 1 + $requiredAfter > $limit)) {
            throw new AiRecommendationException('budget_exhausted');
        }
        $permit = $this->id('attempt');
        // The persisted claim prevents retry after crash; an external budget denial never triggers a free fallback.
        $this->event($state, ['type' => 'model_attempt_reserved', 'stage' => $stage, 'permit_id' => $permit]); $this->save($state);
        try { $this->platform->reserveAttempt($discussion ? $state['turns'][$index]['turn_id'] : $run['id'], $stage, $permit); }
        catch (\Throwable) { throw new AiRecommendationException('budget_exhausted'); }
        $this->guard($state); $this->ownedClaim($state);
        $this->assertDependencies($state, $this->turn($state)['source_batch_ids']);
        $state['calls_used']++; $state['turns'][$index]['calls_used']++; if (!$discussion) { $run['calls_used']++; }
        $this->save($state);
        $value = $operation($permit); $this->guard($state); $this->ownedClaim($state);
        $this->assertDependencies($state, $this->turn($state)['source_batch_ids']); return $value;
    }

    private function validatePlan(array $draft, RulePolicy $policy): array
    {
        try {
            $keys = array_keys($draft); sort($keys);
            if ($keys !== ['action', 'conditions', 'message'] || !in_array($draft['action'], ['clarify', 'search', 'discuss'], true)
                || !ConversationInput::text($draft['message'], 1536) || !is_array($draft['conditions']) || !array_is_list($draft['conditions']) || count($draft['conditions']) > 16) { throw new \InvalidArgumentException(); }
            if ($draft['action'] !== 'search') { if ($draft['conditions'] !== []) { throw new \InvalidArgumentException(); } }
            else {
                if ($draft['conditions'] === []) { throw new \InvalidArgumentException(); }
                foreach ($draft['conditions'] as $condition) {
                    if (($condition['strength'] ?? null) !== 'soft' || ($condition['origin'] ?? null) !== 'interpreted_draft') { throw new \InvalidArgumentException(); }
                }
                $intent = new QueryIntent('person', $draft['conditions']);
                $this->queryValidator->validateQuery($intent, $policy); ConversationInput::assertTypes($intent, $policy);
            }
            return $draft;
        } catch (\Throwable) { throw new AiRecommendationException('invalid_model_output'); }
    }

    private function validateResponse(array $answer, array $input, bool $recommend): array
    {
        try {
            $keys = array_keys($answer); sort($keys);
            if ($keys !== ['items', 'message'] || !ConversationInput::text($answer['message'], 4096) || !is_array($answer['items'])
                || !array_is_list($answer['items']) || count($answer['items']) > $input['result_limit']) { throw new \InvalidArgumentException(); }
            $candidates = []; foreach ($input['candidates'] as $candidate) { $candidates[$candidate['id']] = $candidate; }
            $seen = [];
            foreach ($answer['items'] as $item) {
                $keys = array_keys($item); sort($keys);
                if ($keys !== ['fact_ids', 'gaps', 'id', 'reason'] || !is_string($item['id']) || !isset($candidates[$item['id']]) || isset($seen[$item['id']])
                    || !ConversationInput::text($item['reason'], 1536) || !is_array($item['fact_ids']) || !array_is_list($item['fact_ids']) || $item['fact_ids'] === []
                    || count($item['fact_ids']) > 12 || count(array_unique($item['fact_ids'])) !== count($item['fact_ids'])
                    || !is_array($item['gaps']) || !array_is_list($item['gaps']) || count($item['gaps']) > 6) { throw new \InvalidArgumentException(); }
                $facts = []; foreach ($candidates[$item['id']]['facts'] as $fact) { $facts[$fact['id']] = $fact; }
                $positive = false;
                foreach ($item['fact_ids'] as $factId) {
                    if (!is_string($factId) || !isset($facts[$factId])) { throw new \InvalidArgumentException(); }
                    $positive = $positive || $facts[$factId]['positive'];
                }
                if ($recommend && !$positive) { throw new \InvalidArgumentException(); }
                foreach ($item['gaps'] as $gap) { if (!ConversationInput::text($gap, 768)) { throw new \InvalidArgumentException(); } }
                $seen[$item['id']] = true;
            }
            return $answer;
        } catch (\Throwable) { throw new AiRecommendationException('invalid_model_output'); }
    }

    /** Fresh reads verify every sent candidate, including current relation/history versions. */
    private function authorizeRefs(array $state, array $refs): array
    {
        $this->guard($state); if ($refs === []) { return []; }
        $ids = array_map('strval', array_keys($refs)); $request = new CandidateRequest($this->context($state), 'person', $ids);
        $rows = $this->profiles->read($request); $relations = $this->contacts->readCurrent($request);
        try { $history = $this->contacts->readSentHistory($request); }
        catch (\Throwable) { throw new AiRecommendationException('history_unavailable'); }
        if (!array_is_list($rows) || count($rows) !== count($ids) || count($relations) !== count($ids) || count($history) !== count($ids)) { throw new AiRecommendationException('context_invalidated'); }
        $map = [];
        foreach ($rows as $row) {
            if (!$row instanceof CandidateProjection || $row->targetType !== 'person' || $row->spaceId !== $state['event_id']
                || !in_array($row->targetId, $ids, true) || isset($map[$row->targetId])) { throw new AiRecommendationException('context_invalidated'); }
            $id = $row->targetId; $relation = $relations[$id] ?? null; $sent = $history[$id] ?? null;
            $this->relationship($relation, $sent);
            if ($relation['blocked'] || $relation['friend'] || $relation['pending_in'] || $relation['pending_out'] || $sent['ever_sent']) { throw new AiRecommendationException('context_invalidated'); }
            if (Fingerprint::of([$row, $relation, $sent]) !== $refs[$id]) { throw new AiRecommendationException('context_invalidated'); }
            $map[$id] = ['projection' => $row, 'relation' => $relation];
        }
        $this->guard($state); return $map;
    }
    private function authorizeMatches(array $state, array $matches): array
    {
        if (!array_is_list($matches) || count($matches) > 200) { throw new AiRecommendationException('provider_unavailable'); }
        $ids = []; $map = [];
        foreach ($matches as $match) {
            if (!$match instanceof DiscoveryMatch || !$match->assessment->qualifies || $match->candidate->targetType !== 'person'
                || $match->candidate->spaceId !== $state['event_id'] || $match->candidate->targetId === (string)$state['owner_id']
                || isset($map[$match->candidate->targetId])) { throw new AiRecommendationException('provider_unavailable'); }
            $ids[] = $match->candidate->targetId; $map[$match->candidate->targetId] = $match;
        }
        if ($ids === []) { return [[], []]; }
        $request = new CandidateRequest($this->context($state), 'person', $ids);
        $rows = $this->profiles->read($request); $relations = $this->contacts->readCurrent($request);
        try { $history = $this->contacts->readSentHistory($request); } catch (\Throwable) { throw new AiRecommendationException('history_unavailable'); }
        if (!array_is_list($rows) || count($rows) !== count($ids) || count($relations) !== count($ids) || count($history) !== count($ids)) { throw new AiRecommendationException('context_invalidated'); }
        $refs = []; $fresh = [];
        foreach ($rows as $row) {
            if (!$row instanceof CandidateProjection || !isset($map[$row->targetId]) || isset($fresh[$row->targetId])
                || Fingerprint::of($row) !== Fingerprint::of($map[$row->targetId]->candidate)) { throw new AiRecommendationException('context_invalidated'); }
            $id = $row->targetId; $relation = $relations[$id] ?? null; $sent = $history[$id] ?? null; $this->relationship($relation, $sent);
            if ($relation['blocked'] || $relation['friend'] || $relation['pending_in'] || $relation['pending_out'] || $sent['ever_sent']) { continue; }
            $fresh[$id] = new DiscoveryMatch($row, $map[$id]->assessment, $relation); $refs[$id] = Fingerprint::of([$row, $relation, $sent]);
        }
        $ordered = []; foreach ($ids as $id) { if (isset($fresh[$id])) { $ordered[] = $fresh[$id]; } }
        return [$ordered, $refs];
    }
    private function relationship(mixed $relation, mixed $history): void
    {
        if (!is_array($relation) || !is_array($history)) { throw new AiRecommendationException('provider_unavailable'); }
        $keys = array_keys($relation); sort($keys); $hkeys = array_keys($history); sort($hkeys);
        if ($keys !== ['blocked', 'friend', 'pending_in', 'pending_out', 'version'] || $hkeys !== ['ever_sent', 'version']
            || !is_string($relation['version']) || $relation['version'] === '' || !is_string($history['version']) || $history['version'] === '' || !is_bool($history['ever_sent'])) { throw new AiRecommendationException('provider_unavailable'); }
        foreach (['blocked', 'friend', 'pending_in', 'pending_out'] as $flag) { if (!is_bool($relation[$flag])) { throw new AiRecommendationException('provider_unavailable'); } }
    }

    private function responseInput(array $state, string $mode, array $candidates, RulePolicy $policy): array
    {
        return ['schema_version' => 'conversation-v1', 'mode' => $mode, 'message' => $this->turn($state)['user_message'],
            'history' => $this->history($state), 'requirements' => $state['requirements'], 'candidates' => $candidates,
            'request_byte_limit' => $policy->parameters['limits']['request_bytes'], 'result_limit' => $policy->parameters['limits']['final_results'],
            'display' => $mode === 'discuss' ? ['batch_id' => $state['current_batch']['batch_id'], 'ordered_ids' => $state['current_batch']['ordered_ids']]
                : ['batch_id' => null, 'ordered_ids' => []]];
    }
    private function history(array $state): array
    {
        $rows = [];
        foreach (array_slice(array_slice($state['turns'], 0, -1), -6) as $turn) {
            if ($turn['status'] !== 'completed' || !($turn['source_valid'] ?? false)) { continue; }
            if ($turn['batch_id'] !== null && $turn['batch_id'] !== ($state['current_batch']['batch_id'] ?? null)) { continue; }
            // Only the current, freshly authorized display can carry candidate prose into discussion.
            $rows[] = ['role' => 'user', 'message' => $turn['user_message']];
            if ($turn['message'] !== '') {
                $message = $turn['message'];
                foreach ($turn['items'] as $item) {
                    $extra = "\n候选 " . $item['id'] . '：' . $item['reason'] . ' 待核实：' . implode('；', $item['gaps']);
                    if (strlen($message . $extra) <= 4096) { $message .= $extra; }
                }
                $rows[] = ['role' => 'assistant', 'message' => $message];
            }
        }
        $rows = array_slice($rows, -12);
        while ($rows !== [] && strlen(ConversationInput::json($rows)) > 8192) { array_shift($rows); }
        return $rows;
    }
    private function guard(array $state): RulePolicy
    {
        if ($state['applicability'] !== 'current') { throw new AiRecommendationException('context_invalidated'); }
        $this->runtime?->assertCurrent($this->providerIdentity);
        $this->historyCapability();
        try { $this->events->assertCurrent($this->context($state)); }
        catch (\Throwable) { throw new AiRecommendationException('context_invalidated'); }
        $policy = $this->policies->current($this->context($state));
        if (Fingerprint::of($policy) !== $state['policy_hash'] || $state['provider_identity'] !== $this->providerIdentity
            || $state['limits_hash'] !== Fingerprint::of($this->limits) || $this->time() < $state['created_at']) { throw new AiRecommendationException('context_invalidated'); }
        return $policy;
    }
    private function historyCapability(): void
    {
        try { if (!$this->contacts->supportsSentHistory()) { throw new \RuntimeException(); } }
        catch (\Throwable) { throw new AiRecommendationException('history_unavailable'); }
    }
    private function context(array $state): CurrentEventContext
    {
        $c = $state['context']; return new CurrentEventContext($c['viewerId'], $c['spaceId'], $c['accessVersion'], $c['policyVersion']);
    }
    private function load(int $owner, string $id): array
    {
        $state = $this->store->load($id, $owner);
        if ($state === null) { throw new AiRecommendationException('invalid_request'); }
        $state['requirements_version'] ??= 1;
        $state['confirmed_conditions'] ??= array_values(array_filter($state['requirements']['conditions'], static fn(array $c): bool => $c['origin'] === 'user_confirmed'));
        $state['withdrawn_condition_keys'] ??= [];
        $legacySources = ($state['provenance_version'] ?? null) === 2 ? [] : array_keys($this->batchMap($state));
        $state['conditions_source_batch_ids'] ??= $legacySources;
        $state['requirement_source_batches'] ??= array_fill(0, count($state['requirements']['messages']), $legacySources);
        if (!array_key_exists('pending_confirmation', $state)) {
            $state['pending_confirmation'] = null;
            foreach ($state['turns'] as $turn) {
                if ($this->mentionsHardRequirement($turn['user_message'])) {
                    $state['pending_confirmation'] = ['version' => $state['requirements_version'], 'source_turn_ids' => [$turn['turn_id']]];
                }
            }
        }
        foreach ($state['turns'] as &$turn) { $turn['source_batch_ids'] ??= $legacySources; $turn['source_valid'] ??= true; } unset($turn);
        return $state;
    }
    private function save(array &$state): void
    {
        $version = $state['version']; $next = $state; $next['version']++; $next['updated_at'] = $this->time();
        $maximum = $next['interaction_status'] === 'failed' ? self::SNAPSHOT_BYTES : self::SNAPSHOT_BYTES - 2048;
        if (strlen(ConversationInput::json($next)) > $maximum) { throw new AiRecommendationException('request_budget_exceeded'); }
        if (!$this->store->compareAndSwap($state['id'], $state['owner_id'], $version, $next)) { throw new AiRecommendationException('run_conflict'); }
        $state = $next;
    }
    private function ownedClaim(array $state): void
    {
        $current = $this->load($state['owner_id'], $state['id']);
        if ($current['version'] !== $state['version'] || $current['inflight'] !== $state['inflight'] || $state['inflight'] === null
            || $this->time() >= $state['inflight']['expires_at']) { throw new AiRecommendationException('run_conflict'); }
    }
    private function fail(array &$state, \Throwable $error): void
    {
        $current = $this->load($state['owner_id'], $state['id']);
        if ($current['version'] !== $state['version']) { throw new AiRecommendationException('run_conflict'); }
        $revoked = $state['applicability'] !== 'current';
        $state = $current; // Discard unpersisted oversized or partially built model output before recording failure.
        $reason = $error instanceof AiRecommendationException ? $error->reason : 'provider_unavailable';
        $state['interaction_status'] = 'failed'; $state['execution_status'] = 'failed'; $state['error'] = $reason; $state['inflight'] = null;
        if ($revoked || in_array($reason, ['context_invalidated', 'history_unavailable'], true)) {
            $state['applicability'] = 'revoked'; $state['current_batch'] = null;
            $this->redactCandidateTurns($state);
        }
        $index = array_key_last($state['turns']);
        if ($index !== null) { $state['turns'][$index]['error'] = $reason; $state['turns'][$index]['status'] = 'failed'; $state['turns'][$index]['message'] = '本轮处理未完成（' . $reason . '），没有产生新的推荐。'; }
        $id = $state['current_run_id'];
        if ($id !== null && $state['runs'][$id]['status'] !== 'completed') { $state['runs'][$id]['status'] = 'failed'; }
        $this->save($state);
    }
    private function redactCandidateTurns(array &$state): void
    {
        foreach ($state['turns'] as &$turn) {
            if ($turn['batch_id'] !== null || ($turn['source_batch_ids'] ?? []) !== []) { $this->redactTurn($turn); }
        } unset($turn);
        foreach ($state['runs'] as &$run) {
            if ($run['batch'] !== null) { $run['batch']['valid'] = false; $run['batch']['items'] = []; $run['batch']['ordered_ids'] = []; }
        } unset($run);
        foreach ($state['requirement_source_batches'] as $index => $ids) {
            if ($ids !== []) { $state['requirements']['messages'][$index] = '[该需求原文涉及的候选资料已失效，请重新说明需求]'; }
        }
    }
    private function view(array $state): array
    {
        $batch = $state['applicability'] === 'current' ? $state['current_batch'] : null;
        if ($batch !== null) { unset($batch['refs'], $batch['source_refs'], $batch['source_batch_ids'], $batch['conditions'], $batch['valid']); }
        $turns = [];
        foreach ($state['turns'] as $turn) { unset($turn['idempotency_key'], $turn['input_hash'], $turn['source_batch_ids'], $turn['source_valid']); $turns[] = $turn; }
        $last = $turns === [] ? null : $turns[array_key_last($turns)];
        return ['conversation_id' => $state['id'], 'version' => $state['version'], 'event_id' => $state['event_id'],
            'requirements_version' => $state['requirements_version'], 'pending_confirmation' => $state['pending_confirmation'],
            'confirmed_conditions' => $state['applicability'] === 'current' ? $state['confirmed_conditions'] : [],
            'interaction_status' => $state['interaction_status'], 'execution_status' => $state['execution_status'], 'applicability' => $state['applicability'],
            'model_calls_used' => $state['calls_used'], 'current_run_id' => $state['current_run_id'], 'current_batch' => $batch,
            'items' => $batch['items'] ?? [], 'message' => $last['message'] ?? '', 'events' => $last['events'] ?? [], 'turns' => $turns, 'error' => $state['error']];
    }
    private function mentionsHardRequirement(string $message): bool
    {
        return preg_match('/必须|不可妥协|硬要求|硬条件|一定要/u', $message) === 1;
    }
    private function awaitConfirmation(array &$state, bool $discussion): void
    {
        $run = &$state['runs'][$state['current_run_id']];
        if ($run['clarification_round'] >= 3) { throw new AiRecommendationException('clarification_limit'); }
        if (!$discussion && $run['calls_used'] + 2 > 5) { throw new AiRecommendationException('budget_exhausted'); }
        $run['clarification_round']++;
        if (!$discussion) { $run['status'] = 'awaiting_input'; }
        $state['interaction_status'] = 'awaiting_input';
        $this->setMessage($state, '还有待确认的不可放宽条件。请明确确认完整条件，或明确撤回这些要求后继续；普通续聊不会把它们改成软偏好。');
    }
    private function batchMap(array $state): array
    {
        $map = [];
        foreach ($state['runs'] as $run) { if ($run['batch'] !== null) { $map[$run['batch']['batch_id']] = $run['batch']; } }
        return $map;
    }
    private function visibleBatchIds(array $state): array
    {
        return array_keys(array_filter($this->batchMap($state), static fn(array $batch): bool => $batch['valid'] ?? false));
    }
    private function inputDependencies(array $state): array
    {
        $ids = $this->turn($state)['source_batch_ids'];
        foreach ($state['requirement_source_batches'] as $sources) { array_push($ids, ...$sources); }
        foreach (array_slice(array_slice($state['turns'], 0, -1), -6) as $turn) {
            if ($turn['status'] !== 'completed' || !($turn['source_valid'] ?? false)) { continue; }
            if ($turn['batch_id'] !== null && $turn['batch_id'] !== ($state['current_batch']['batch_id'] ?? null)) { continue; }
            array_push($ids, ...$turn['source_batch_ids']);
            if ($turn['batch_id'] !== null) { $ids[] = $turn['batch_id']; }
        }
        return array_values(array_unique($ids));
    }
    private function assertDependencies(array $state, array $ids, array $path = [], ?array &$verified = null): void
    {
        $verified ??= []; $map = $this->batchMap($state);
        foreach ($ids as $id) {
            if (array_key_exists($id, $verified)) {
                if (!$verified[$id]) { throw new AiRecommendationException('context_invalidated'); }
                continue;
            }
            $batch = $map[$id] ?? null;
            try {
                if ($batch === null || !($batch['valid'] ?? false) || !isset($batch['source_refs']) || $batch['source_refs'] === [] || isset($path[$id])) {
                    throw new AiRecommendationException('context_invalidated');
                }
                $next = $path; $next[$id] = true;
                $this->assertDependencies($state, $batch['source_batch_ids'] ?? [], $next, $verified);
                $this->authorizeRefs($state, $batch['source_refs']);
                $verified[$id] = true;
            } catch (\Throwable $error) { $verified[$id] = false; throw $error; }
        }
    }
    /** All actually sent facts remain a source of free prose even when no candidate card was selected. */
    private function revalidateSources(array &$state): void
    {
        $invalid = []; $changed = ($state['provenance_version'] ?? null) !== 2;
        $state['provenance_version'] = 2; $verified = [];
        foreach ($state['runs'] as $run) {
            $batch = $run['batch']; if ($batch === null) { continue; }
            $id = $batch['batch_id'];
            if (!($batch['valid'] ?? true)) { $invalid[$id] = true; continue; }
            try { $this->assertDependencies($state, [$id], [], $verified); }
            catch (\Throwable) { $invalid[$id] = true; }
        }
        if ($invalid !== []) {
            foreach ($state['runs'] as &$run) {
                if ($run['batch'] !== null && isset($invalid[$run['batch']['batch_id']])) {
                    $run['batch']['valid'] = false; $run['batch']['items'] = []; $run['batch']['ordered_ids'] = [];
                }
            } unset($run);
            foreach ($state['turns'] as &$turn) {
                if (isset($invalid[$turn['batch_id'] ?? '']) || array_intersect($turn['source_batch_ids'], array_keys($invalid)) !== []) { $this->redactTurn($turn); }
            } unset($turn);
            foreach ($state['requirement_source_batches'] as $index => $ids) {
                if (array_intersect($ids, array_keys($invalid)) !== []) {
                    $state['requirements']['messages'][$index] = '[该需求原文涉及的候选资料已失效，请重新说明需求]';
                    $state['requirement_source_batches'][$index] = [];
                }
            }
            $currentInvalid = $state['current_batch'] !== null && isset($invalid[$state['current_batch']['batch_id']]);
            // A refresh clarification may have no display yet; its derived query still depends on old facts.
            $currentInvalid = $currentInvalid || array_intersect($state['conditions_source_batch_ids'], array_keys($invalid)) !== []
                || ($state['turns'] !== [] && array_intersect($this->turn($state)['source_batch_ids'], array_keys($invalid)) !== []);
            if ($currentInvalid) { $state['requirements']['conditions'] = []; $state['conditions_source_batch_ids'] = []; }
            if ($currentInvalid) { $state['current_batch'] = null; $state['applicability'] = 'revoked'; }
            $this->save($state);
            if ($currentInvalid) { throw new AiRecommendationException('context_invalidated'); }
        } elseif ($changed) { $this->save($state); }
    }
    private function redactTurn(array &$turn): void
    {
        $turn['message'] = ''; $turn['items'] = []; $turn['user_message'] = '[该轮涉及的候选已失效]'; $turn['source_valid'] = false;
    }

    private function turn(array $state): array { return $state['turns'][array_key_last($state['turns'])]; }
    private function setMessage(array &$state, string $message): void { $state['turns'][array_key_last($state['turns'])]['message'] = $message; }
    private function event(array &$state, array $event): void { $state['turns'][array_key_last($state['turns'])]['events'][] = $event; }
    private function inputBudget(RulePolicy $policy): int { return max(0, min(self::INPUT_BYTES, $policy->parameters['limits']['request_bytes'] - 8192)); }
    private function bytes(array $input, RulePolicy $policy): void { if (strlen(ConversationInput::json($input)) > $this->inputBudget($policy)) { throw new AiRecommendationException('request_budget_exceeded'); } }
    private function time(): int { return $this->clock->now()->getTimestamp(); }
    private function id(string $prefix): string { return $prefix . '-' . bin2hex(random_bytes(16)); }
}
