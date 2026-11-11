<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\application;

use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CandidateRequest, ContractShape, CurrentEventContext, QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\{CurrentEventAccess, CandidateRetriever, CandidateProjectionReader, ContactEligibilityReader, RuleEvaluator, RuleQueryValidator, PolicyStore, DiscoveryBatchStore, Clock, RecentExposureReader};
use humhub\modules\matcherRecommendation\domain\{DiscoveryBatch, DiscoveryMatch, DiscoveryOutcome, DiscoveryResult, RuleAssessment};
use humhub\modules\matcherRecommendation\domain\selection\RankedResultSelector;

/** Pure application orchestration for one bounded ordinary rule snapshot; no HTTP, ORM, P1 concrete class or AI. */
final class DiscoverPeople
{
    public function __construct(
        private readonly CurrentEventAccess $events,
        private readonly CandidateRetriever $retriever,
        private readonly CandidateProjectionReader $profiles,
        private readonly ContactEligibilityReader $relationships,
        private readonly RuleEvaluator $rules,
        private readonly PolicyStore $policies,
        private readonly DiscoveryBatchStore $batches,
        private readonly Clock $clock,
        private readonly ?RecentExposureReader $exposures = null,
    ) {}

    public function execute(int $viewerId, QueryIntent $intent, ?int $requestedSpaceId = null): DiscoveryResult
    {
        if ($intent->targetType !== 'person') { throw new \InvalidArgumentException('DiscoverPeople only accepts person queries.'); }
        if ($intent->selectedSelfAttributeIds !== [] || $intent->currentIdeaId !== null) {
            throw new \InvalidArgumentException('Selected self attributes and current idea context require authorized adapters not connected in this stage.');
        }
        $context = $this->events->resolve($viewerId, $requestedSpaceId);
        if ($context->viewerId !== $viewerId || ($requestedSpaceId !== null && $context->spaceId !== $requestedSpaceId)) {
            throw new \UnexpectedValueException('Activity adapter returned a different actor or Space.');
        }
        $this->events->assertCurrent($context);
        $policy = $this->policies->current($context);
        // Formal rule validation must run even when recall later returns an empty pool.
        if ($this->rules instanceof RuleQueryValidator) { $this->rules->validateQuery($intent, $policy); }
        $routeRanks = $this->recallRanks($this->retriever->recall($context, $intent), $viewerId, $policy->parameters);
        $ids = array_map(strval(...), array_keys($routeRanks));
        $this->events->assertCurrent($context);
        $request = new CandidateRequest($context, 'person', $ids);
        $projections = $ids === [] ? [] : $this->projectionMap($this->profiles->read($request), $request);
        $projectionIds = array_map(strval(...), array_keys($projections));
        $relationships = $projectionIds === [] ? [] : $this->relationshipMap($this->relationships->readCurrent(new CandidateRequest($context, 'person', $projectionIds)), $projectionIds);
        $selected = []; $eligibleCount = 0; $hardFailures = 0;
        foreach ($projections as $id => $projection) {
            if ($relationships[$id]['blocked']) { continue; }
            $eligibleCount++;
            $assessment = $this->rules->evaluate($context, $intent, $projection, $policy, $routeRanks[$id]);
            $this->assertEvidence($assessment, $projection);
            if ($assessment->diagnostics !== null && $assessment->diagnostics->hardConflicts !== []) { $hardFailures++; }
            if ($assessment->qualifies) { $selected[(string)$id] = new DiscoveryMatch($projection, $assessment, $relationships[$id]); }
        }
        $this->events->assertCurrent($context);
        $initialSelectedCount = count($selected);
        $exposureCounts = [];
        if ($selected !== [] && $this->exposures !== null) {
            $historyIds = array_map(strval(...), array_keys($selected));
            $exposureCounts = $this->exposures->read(new CandidateRequest($context, 'person', $historyIds));
            if (count($exposureCounts) !== count($historyIds)) { throw new \UnexpectedValueException('Incomplete exposure history.'); }
            foreach ($exposureCounts as $id => $count) {
                if (!in_array((string)$id, $historyIds, true) || !is_int($count) || $count < 0) {
                    throw new \UnexpectedValueException('Invalid exposure history.');
                }
            }
        }
        // Rules may take time. Refetch selected projections/relationships instead of publishing old permissions or evidence.
        $selectedIds = array_map(strval(...), array_keys($selected));
        if ($selectedIds !== []) {
            $freshRequest = new CandidateRequest($context, 'person', $selectedIds);
            $freshProfiles = $this->projectionMap($this->profiles->read($freshRequest), $freshRequest);
            $freshIds = array_map(strval(...), array_keys($freshProfiles));
            $freshRelationships = $freshIds === [] ? [] : $this->relationshipMap($this->relationships->readCurrent(new CandidateRequest($context, 'person', $freshIds)), $freshIds);
            foreach ($selected as $id => $match) {
                if (!isset($freshProfiles[$id]) || $freshRelationships[$id]['blocked'] || self::fingerprint($match->candidate) !== self::fingerprint($freshProfiles[$id])) {
                    unset($selected[$id]);
                    continue;
                }
                $selected[$id] = new DiscoveryMatch($freshProfiles[$id], $match->assessment, $freshRelationships[$id]);
            }
        }
        if (self::fingerprint($policy) !== self::fingerprint($this->policies->current($context))) {
            throw new \RuntimeException('Recommendation policy changed during evaluation.');
        }
        $this->events->assertCurrent($context);
        $items = array_values($selected);
        $categories = [];
        foreach ($items as $item) { $categories[$item->candidate->targetId] = $item->assessment->diagnostics?->diversityKeys ?? []; }
        $selection = (new RankedResultSelector())->select(
            $items,
            $policy->parameters['selection'] ?? ['near_tie_delta' => 0.0, 'exploration_slots' => 0, 'max_results' => CandidateRequest::MAX_CANDIDATES],
            array_intersect_key($exposureCounts, $selected),
            $categories,
        );
        $items = $selection->items;
        $orderedIds = []; $fingerprints = []; $relationshipVersions = [];
        foreach ($items as $item) {
            $id = $item->candidate->targetId;
            $orderedIds[] = $id;
            $fingerprints[$id] = self::fingerprint($item->candidate);
            $relationshipVersions[$id] = $item->relationship['version'];
        }
        $now = $this->clock->now();
        $batch = new DiscoveryBatch($context, self::fingerprint([$intent, $policy]), $policy->version, $orderedIds, $fingerprints, $relationshipVersions, $now, $now->add(new \DateInterval('PT15M')), self::fingerprint($policy));
        $batchId = $this->batches->put($batch);
        $this->events->assertCurrent($context);
        $reason = $items !== [] ? 'matched' : ($initialSelectedCount > 0 ? 'no_current_matches'
            : ($eligibleCount === 0 ? 'no_authorized_candidates' : ($hardFailures === $eligibleCount ? 'hard_conditions_unmet' : 'no_clear_match')));
        return new DiscoveryResult($batchId, $batch, $items, new DiscoveryOutcome($reason), $selection->explorationIds);
    }

    /** @return array<string,array<string,int>> */
    private function recallRanks(array $rows, int $viewerId, array $parameters): array
    {
        $maximum = $parameters['limits']['recall'] ?? CandidateRequest::MAX_CANDIDATES;
        $enabled = $parameters['enabled_routes'] ?? ['structured', 'fulltext', 'semantic'];
        if (!is_int($maximum) || $maximum < 1 || $maximum > CandidateRequest::MAX_CANDIDATES || !is_array($enabled)) {
            throw new \UnexpectedValueException('Invalid recall policy.');
        }
        if (!array_is_list($rows) || count($rows) > $maximum) { throw new \UnexpectedValueException('Recall exceeds its bounded contract.'); }
        $limits = ['structured' => 80, 'fulltext' => 40, 'semantic' => 80];
        $counts = array_fill_keys(array_keys($limits), 0); $seen = []; $ids = [];
        foreach ($rows as $row) {
            if (!is_array($row)) { throw new \UnexpectedValueException('Invalid recall row.'); }
            $keys = array_keys($row); sort($keys);
            if ($keys !== ['id', 'routes', 'target_type'] || $row['target_type'] !== 'person' || !is_string($row['id']) || !preg_match('/^[1-9][0-9]*$/D', $row['id']) || !is_array($row['routes']) || $row['routes'] === []) {
                throw new \UnexpectedValueException('Recall must return canonical person IDs and route ranks only.');
            }
            if (isset($seen[$row['id']])) { throw new \UnexpectedValueException('Recall IDs must be unique.'); }
            $seen[$row['id']] = true;
            foreach ($row['routes'] as $route => $rank) {
                if (!isset($limits[$route]) || !in_array($route, $enabled, true) || !is_int($rank) || $rank < 1 || $rank > $limits[$route] || ++$counts[$route] > $limits[$route]) {
                    throw new \UnexpectedValueException('Recall route limit or rank is invalid.');
                }
            }
            if ($row['id'] !== (string)$viewerId) { $ids[$row['id']] = $row['routes']; }
        }
        return $ids;
    }

    /** @return array<string,CandidateProjection> */
    private function projectionMap(array $rows, CandidateRequest $request): array
    {
        if (!array_is_list($rows) || count($rows) > count($request->targetIds)) { throw new \UnexpectedValueException('Projection output exceeds its request.'); }
        $result = [];
        foreach ($rows as $row) {
            if (!$row instanceof CandidateProjection || $row->targetType !== 'person' || $row->spaceId !== $request->context->spaceId || !in_array($row->targetId, $request->targetIds, true) || isset($result[$row->targetId]) || $row->targetId === (string)$request->context->viewerId) {
                throw new \UnexpectedValueException('Projection output has an unrequested target or scope.');
            }
            $result[$row->targetId] = $row;
        }
        return $result;
    }

    private function relationshipMap(array $rows, array $ids): array
    {
        if (count($rows) !== count($ids)) { throw new \UnexpectedValueException('Current relationship output is incomplete.'); }
        $result = [];
        foreach ($rows as $id => $row) {
            if (!in_array((string)$id, $ids, true) || !is_array($row)) { throw new \UnexpectedValueException('Unexpected relationship subject.'); }
            $keys = array_keys($row); sort($keys);
            if ($keys !== ['blocked', 'friend', 'pending_in', 'pending_out', 'version'] || !is_string($row['version'])) { throw new \UnexpectedValueException('Invalid relationship state.'); }
            ContractShape::token($row['version']);
            foreach (['blocked', 'friend', 'pending_in', 'pending_out'] as $field) {
                if (!is_bool($row[$field])) { throw new \UnexpectedValueException('Relationship state must be explicit.'); }
            }
            $result[(string)$id] = $row;
        }
        return $result;
    }

    private function assertEvidence(RuleAssessment $assessment, CandidateProjection $projection): void
    {
        $allowed = [];
        foreach ($projection->features as $feature) {
            foreach ($feature['evidence'] as $ref) { $allowed[self::fingerprint($ref)] = true; }
        }
        foreach ($assessment->reasons as $reason) {
            foreach ($reason->evidence as $reference) {
                if (!isset($allowed[self::fingerprint($reference)])) { throw new \UnexpectedValueException('Rule reason cites evidence outside the authorized projection.'); }
            }
        }
    }

    private static function fingerprint(mixed $value): string
    {
        // Detect cycles/depth errors before recursively normalizing. No business values are reordered.
        json_encode($value, JSON_THROW_ON_ERROR);
        return hash('sha256', json_encode(self::canonicalValue($value), JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION));
    }

    private static function canonicalValue(mixed $value): mixed
    {
        if (is_array($value) && array_is_list($value)) {
            return array_map(self::canonicalValue(...), $value);
        }
        if (is_array($value) || is_object($value)) {
            $properties = is_array($value) ? $value : get_object_vars($value);
            ksort($properties, SORT_STRING);
            // An associative array must stay an object even if sorting numeric keys makes it look like a list.
            $normalized = new \stdClass();
            foreach ($properties as $key => $property) { $normalized->{(string)$key} = self::canonicalValue($property); }
            return $normalized;
        }
        return $value;
    }
}
