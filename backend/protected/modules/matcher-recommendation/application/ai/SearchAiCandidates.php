<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\application\ai;

use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CandidateRequest, ContractShape, CurrentEventContext, QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\{AiCandidateSearch, CandidateProjectionReader, CandidateRetriever, ContactEligibilityReader, CurrentEventAccess, PolicyStore, RuleEvaluator, RuleQueryValidator};
use humhub\modules\matcherRecommendation\domain\{DiscoveryMatch, RuleAssessment, RulePolicy};
use humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException;
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;

/**
 * One backend-only AI search tool invocation. Every dependency is an explicit core port.
 * No model invocation, batch persistence, native table access or fallback to unsupported history.
 * The run coordinator must revalidate projected people and request history before/after model use.
 */
final class SearchAiCandidates implements AiCandidateSearch
{
    private readonly RuleQueryValidator $validator;
    public function __construct(
        private readonly CurrentEventAccess $events,
        private readonly CandidateRetriever $retriever,
        private readonly CandidateProjectionReader $profiles,
        private readonly ContactEligibilityReader $contacts,
        private readonly RuleEvaluator $evaluator,
        private readonly PolicyStore $policies,
    ) {
        // Use the injected evaluator's validation capability; otherwise validate deterministic rule/config inputs.
        $this->validator = $evaluator instanceof RuleQueryValidator ? $evaluator : new DeterministicRuleEvaluator();
    }

    /** @return list<DiscoveryMatch> */
    public function search(CurrentEventContext $context, #[\SensitiveParameter] QueryIntent $intent): array
    {
        try {
            if ($intent->targetType !== 'person' || $intent->selectedSelfAttributeIds !== [] || $intent->currentIdeaId !== null) { throw new AiRecommendationException('invalid_request'); }
            $this->assertContext($context);
            $this->assertHistoryCapability(); // Deliberately before recall, including an otherwise empty activity.
            $policy = $this->policies->current($context);
            try { $this->validator->validateQuery($intent, $policy); }
            catch (\Throwable) { throw new AiRecommendationException('invalid_request'); }
            $ranks = $this->ranks($this->retriever->recall($context, $intent), $context, $policy);
            $this->assertContext($context);
            $ids = array_map('strval', array_keys($ranks));
            $projections = $ids === [] ? [] : $this->projectionMap($this->profiles->read(new CandidateRequest($context, 'person', $ids)), $ids, $context, $policy);
            $projectedIds = array_map('strval', array_keys($projections));
            $current = []; $history = [];
            if ($projectedIds !== []) {
                $request = new CandidateRequest($context, 'person', $projectedIds);
                $current = $this->relationships($this->contacts->readCurrent($request), $projectedIds);
                // Do not turn either a missing capability or an unavailable authoritative source into false.
                try { $history = $this->history($this->contacts->readSentHistory($request), $projectedIds); }
                catch (\Throwable) { throw new AiRecommendationException('history_unavailable'); }
            }
            $matches = [];
            foreach ($projections as $id => $projection) {
                $relation = $current[$id];
                if ($relation['blocked'] || $relation['friend'] || $relation['pending_in'] || $relation['pending_out'] || $history[$id]['ever_sent']) { continue; }
                $assessment = $this->evaluator->evaluate($context, $intent, $projection, $policy, $ranks[$id]);
                $this->evidence($assessment, $projection, $intent, $policy);
                if ($assessment->qualifies) { $matches[] = new DiscoveryMatch($projection, $assessment, $relation); }
            }
            if (Fingerprint::of($policy) !== Fingerprint::of($this->policies->current($context))) { throw new AiRecommendationException('context_invalidated'); }
            $this->assertHistoryCapability();
            $this->assertContext($context);
            usort($matches, static fn(DiscoveryMatch $a, DiscoveryMatch $b): int => ($b->assessment->sortScore <=> $a->assessment->sortScore) ?: strcmp($a->candidate->targetId, $b->candidate->targetId));
            // Recall was bounded before profile/history reads; this never takes the first activity members.
            return $matches;
        } catch (AiRecommendationException $error) { throw new AiRecommendationException($error->reason); }
        catch (\Throwable) { throw new AiRecommendationException('provider_unavailable'); }
    }

    private function assertContext(CurrentEventContext $context): void
    {
        try { $this->events->assertCurrent($context); }
        catch (\Throwable) { throw new AiRecommendationException('context_invalidated'); }
    }
    private function assertHistoryCapability(): void
    {
        try { if (!$this->contacts->supportsSentHistory()) { throw new AiRecommendationException('history_unavailable'); } }
        catch (\Throwable) { throw new AiRecommendationException('history_unavailable'); }
    }
    private function ranks(array $rows, CurrentEventContext $context, RulePolicy $policy): array
    {
        $maximum = $policy->parameters['limits']['recall']; $enabled = $policy->parameters['enabled_routes'];
        if (!is_int($maximum) || $maximum < 1 || $maximum > 200 || !array_is_list($rows) || count($rows) > $maximum) { self::invalidDependency(); }
        $limits = ['structured' => 80, 'fulltext' => 40, 'semantic' => 80]; $counts = array_fill_keys(array_keys($limits), 0); $seenRanks = []; $ranks = [];
        foreach ($rows as $row) {
            self::keys($row, ['target_type', 'id', 'routes']);
            $id = $row['id'];
            if ($row['target_type'] !== 'person' || !is_string($id) || !preg_match('/^[1-9][0-9]*$/D', $id)
                || filter_var($id, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) === false || $id === (string)$context->viewerId
                || isset($ranks[$id]) || !is_array($row['routes']) || $row['routes'] === []) { self::invalidDependency(); }
            foreach ($row['routes'] as $route => $rank) {
                if (!isset($limits[$route]) || !in_array($route, $enabled, true) || !is_int($rank) || $rank < 1 || $rank > $limits[$route]
                    || ++$counts[$route] > $limits[$route] || isset($seenRanks[$route][$rank])) { self::invalidDependency(); }
                $seenRanks[$route][$rank] = true;
            }
            $ranks[$id] = $row['routes'];
        }
        return $ranks;
    }
    private function projectionMap(array $rows, array $ids, CurrentEventContext $context, RulePolicy $policy): array
    {
        if (!array_is_list($rows) || count($rows) > count($ids)) { self::invalidDependency(); }
        $result = []; $bindings = $policy->parameters['bindings'];
        foreach ($rows as $projection) {
            if (!$projection instanceof CandidateProjection || $projection->targetType !== 'person' || $projection->spaceId !== $context->spaceId
                || !in_array($projection->targetId, $ids, true) || isset($result[$projection->targetId])
                || array_diff(array_keys($projection->features), array_keys($bindings)) !== []
                || array_diff($projection->unknownFeatures, array_keys($bindings)) !== []) { self::invalidDependency(); }
            foreach ($projection->features as $feature => $value) {
                $scope = $bindings[$feature]['scope'] === 'event' ? 'space:' . $context->spaceId : 'global';
                foreach ($value['evidence'] as $reference) { if ($reference->scope !== $scope) { self::invalidDependency(); } }
            }
            $result[$projection->targetId] = $projection;
        }
        return $result;
    }
    private function relationships(array $rows, array $ids): array
    {
        if (count($rows) !== count($ids)) { self::invalidDependency(); }
        foreach ($rows as $id => $row) {
            if (!in_array((string)$id, $ids, true)) { self::invalidDependency(); }
            self::keys($row, ['blocked', 'friend', 'pending_in', 'pending_out', 'version']);
            foreach (['blocked', 'friend', 'pending_in', 'pending_out'] as $flag) { if (!is_bool($row[$flag])) { self::invalidDependency(); } }
            if (!is_string($row['version'])) { self::invalidDependency(); } ContractShape::token($row['version']);
        }
        return $rows;
    }
    private function history(array $rows, array $ids): array
    {
        if (count($rows) !== count($ids)) { self::invalidDependency(); }
        foreach ($rows as $id => $row) {
            if (!in_array((string)$id, $ids, true)) { self::invalidDependency(); }
            self::keys($row, ['ever_sent', 'version']);
            if (!is_bool($row['ever_sent']) || !is_string($row['version'])) { self::invalidDependency(); }
            ContractShape::token($row['version']);
        }
        return $rows;
    }
    private function evidence(RuleAssessment $assessment, CandidateProjection $projection, QueryIntent $intent, RulePolicy $policy): void
    {
        $active = [];
        foreach ($intent->conditions as $condition) { $active[$condition['feature'] . ':' . $condition['operator']] = true; }
        $rules = [];
        foreach ($policy->parameters['rules'] as $rule) {
            if (isset($active[$rule['query_feature'] . ':' . $rule['operator']])) { $rules[$rule['id']] = $rule; }
        }
        foreach ($assessment->reasons as $reason) {
            if (!isset($rules[$reason->ruleId])) { self::invalidDependency(); }
            $allowed = [];
            foreach ($rules[$reason->ruleId]['candidate_features'] as $feature) {
                foreach ($projection->features[$feature]['evidence'] ?? [] as $reference) { $allowed[Fingerprint::of($reference)] = true; }
            }
            foreach ($reason->evidence as $reference) { if (!isset($allowed[Fingerprint::of($reference)])) { self::invalidDependency(); } }
        }
        if ($assessment->qualifies && ($assessment->diagnostics === null || $assessment->diagnostics->hardConflicts !== []
            || $assessment->diagnostics->matchScore < $policy->parameters['minimum_match_score'])) { self::invalidDependency(); }
    }
    private static function keys(mixed $row, array $expected): void
    {
        if (!is_array($row)) { self::invalidDependency(); }
        $keys = array_keys($row); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
        if ($keys !== $expected) { self::invalidDependency(); }
    }
    private static function invalidDependency(): never { throw new AiRecommendationException('provider_unavailable'); }
}
