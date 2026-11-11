<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\ai;
use humhub\modules\matcherRecommendation\contracts\{CurrentEventContext, EvidenceRef, QueryIntent};
use humhub\modules\matcherRecommendation\domain\{DiscoveryMatch, RulePolicy};
use humhub\modules\matcherRecommendation\domain\config\{Fingerprint, PolicyValidator};
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;

/**
 * Pure minimal packaging of current, already rule-qualified AI-eligible people.
 * Complete sent-history, current authorization and all-pool revalidation remain required application ports.
 * This builder alone cannot convert an ordinary discovery result into an AI-contact eligibility grant.
 */
final class MinimalCandidatePoolBuilder
{
    /** @param list<DiscoveryMatch> $matches Preserve the core's fixed rule order; skip summaries that cannot fit honestly. */
    public function build(CurrentEventContext $context, #[\SensitiveParameter] QueryIntent $intent, RulePolicy $policy, #[\SensitiveParameter] array $matches): AiCandidatePool
    {
        try {
            PolicyValidator::assertParameters($policy->parameters);
            (new DeterministicRuleEvaluator())->validateQuery($intent, $policy);
            if (!array_is_list($matches) || count($matches) > $policy->parameters['limits']['recall']) { throw new \InvalidArgumentException('Invalid candidate input budget.'); }
            $requested = $this->requestedFeatures($intent, $policy);
            $summaries = []; $entries = []; $seen = [];
            foreach ($matches as $match) {
                if (!$match instanceof DiscoveryMatch || $match->candidate->targetType !== 'person' || $match->candidate->spaceId !== $context->spaceId
                    || $match->candidate->targetId === (string)$context->viewerId || !preg_match('/^[1-9][0-9]*$/D', $match->candidate->targetId)
                    || filter_var($match->candidate->targetId, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) === false
                    || isset($seen[$match->candidate->targetId])) { throw new \InvalidArgumentException('Invalid candidate identity or scope.'); }
                $seen[$match->candidate->targetId] = true;
                $this->assertRelationships($match->relationship);
                $d = $match->assessment->diagnostics;
                if (!$match->assessment->qualifies || $d === null || $d->evaluatorVersion !== DeterministicRuleEvaluator::VERSION
                    || $d->hardConflicts !== [] || $d->insufficiency !== null || $d->matchScore < $policy->parameters['minimum_match_score'] || $d->diversityKeys === []
                    || $match->relationship['blocked'] || $match->relationship['friend'] || $match->relationship['pending_in'] || $match->relationship['pending_out']) { continue; }
                $this->assertReasonEvidence($match);
                $packaged = $this->candidate($match, $requested, $policy->parameters['limits']['candidate_bytes']);
                if ($packaged === null || count($summaries) >= $policy->parameters['limits']['model_candidates']) { continue; }
                $summaries[] = $packaged['summary'];
                $entries[$match->candidate->targetId] = ['match' => $match, 'facts' => $packaged['facts'], 'evidence' => $packaged['evidence']];
            }
            return new AiCandidatePool(Fingerprint::of($context), Fingerprint::of($intent), Fingerprint::of($policy), $policy->parameters['limits']['final_results'], $summaries, $entries);
        } catch (\Throwable) { throw new AiRecommendationException('invalid_request'); }
    }

    private function requestedFeatures(QueryIntent $intent, RulePolicy $policy): array
    {
        $rules = [];
        foreach ($policy->parameters['rules'] as $rule) { $rules[$rule['query_feature'] . ':' . $rule['operator']] = $rule; }
        $features = [];
        foreach ($intent->conditions as $condition) {
            $rule = $rules[$condition['feature'] . ':' . $condition['operator']];
            foreach ($rule['candidate_features'] as $feature) {
                $features[$feature][] = ['rule' => $rule, 'wanted' => $condition['value'], 'scope' => $policy->parameters['bindings'][$feature]['scope']];
            }
        }
        ksort($features, SORT_STRING);
        return $features;
    }

    private function candidate(DiscoveryMatch $match, array $requested, int $budget): ?array
    {
        $unknown = []; $facts = []; $evidence = [];
        foreach ($requested as $feature => $requirements) {
            if (!isset($match->candidate->features[$feature])) { $unknown[] = $feature; continue; }
            $value = $match->candidate->features[$feature]; $references = [];
            $scope = $requirements[0]['scope'] === 'event' ? 'space:' . $match->candidate->spaceId : 'global';
            foreach ($value['evidence'] as $reference) {
                if ($reference->scope !== $scope) { throw new \InvalidArgumentException('Evidence scope does not match its requested feature.'); }
                $references[Fingerprint::of($reference)] = $reference;
            }
            ksort($references, SORT_STRING);
            // A projection aggregates feature values and evidence without per-token provenance. Keep the complete
            // evidence bundle, instead of pretending that an arbitrary single attribute proves a particular token.
            $alias = 'e-' . Fingerprint::of(['feature' => $feature, 'references' => array_values($references)]);
            $evidence[$alias] = array_values($references);
            $atoms = is_array($value['value']) && array_is_list($value['value']) && $value['value'] !== [] ? $value['value'] : [$value['value']];
            foreach ($atoms as $atom) {
                $text = $feature . '=' . AiCandidatePool::json($this->canonical($atom));
                $positive = $this->positive($atom, $requirements);
                $facts[Fingerprint::of([$feature, $atom])] = ['feature' => $feature, 'text' => $text, 'evidence_ids' => [$alias], 'positive' => $positive];
            }
        }
        $facts = array_values($facts);
        usort($facts, static fn(array $a, array $b): int => ($b['positive'] <=> $a['positive']) ?: strcmp($a['feature'], $b['feature']) ?: strcmp($a['text'], $b['text']));
        sort($unknown, SORT_STRING); $unknownCount = count($unknown); $total = count($facts);
        $base = ['target_type' => 'person', 'id' => $match->candidate->targetId, 'rule_score' => $match->assessment->sortScore, 'facts' => [], 'unknown_features' => $unknown, 'unknown_count' => $unknownCount, 'omitted_fact_count' => $total];
        $chosen = []; $anchorIndex = null;
        // An unknown label may be shortened only by omitting whole names; its true total is always retained.
        do {
            foreach ($facts as $index => $fact) {
                if (!$fact['positive']) { continue; }
                $trial = $base; $trial['facts'] = [$this->wireFact($fact)]; $trial['omitted_fact_count'] = $total - 1;
                if (strlen(AiCandidatePool::json($trial)) <= $budget) { $base = $trial; $chosen[] = $fact; $anchorIndex = $index; break 2; }
            }
            if ($base['unknown_features'] === []) { break; }
            array_pop($base['unknown_features']);
        } while (true);
        if ($anchorIndex === null) { return null; }
        foreach ($facts as $index => $fact) {
            if ($index === $anchorIndex) { continue; }
            $trial = $base; $trial['facts'][] = $this->wireFact($fact); $trial['omitted_fact_count'] = $total - count($trial['facts']);
            if (strlen(AiCandidatePool::json($trial)) <= $budget) { $base = $trial; $chosen[] = $fact; }
        }
        $sentAliases = [];
        foreach ($chosen as $fact) { foreach ($fact['evidence_ids'] as $alias) { $sentAliases[$alias] = true; } }
        return ['summary' => $base, 'facts' => $chosen, 'evidence' => array_intersect_key($evidence, $sentAliases)];
    }

    private function positive(mixed $atom, array $requirements): bool
    {
        if (!is_string($atom)) { return false; }
        foreach ($requirements as $requirement) {
            $rule = $requirement['rule'];
            if (!in_array($rule['dimension'], ['topic', 'contribution'], true) || !in_array($rule['operator'], ['similarity', 'supply_demand', 'coverage_gain'], true)) { continue; }
            $aliases = [];
            foreach ($rule['aliases'] as $from => $to) { $aliases[strtolower(trim($from))] = strtolower(trim($to)); }
            $normal = static fn(string $text): string => $aliases[strtolower(trim($text))] ?? strtolower(trim($text));
            foreach (is_string($requirement['wanted']) ? [$requirement['wanted']] : $requirement['wanted'] as $wanted) {
                if ($normal($atom) === $normal($wanted)) { return true; }
            }
        }
        return false;
    }

    private function assertRelationships(array $state): void
    {
        $keys = array_keys($state); sort($keys, SORT_STRING);
        if ($keys !== ['blocked', 'friend', 'pending_in', 'pending_out', 'version'] || !is_string($state['version']) || trim($state['version']) === '') { throw new \InvalidArgumentException('Invalid current relationship.'); }
        foreach (['blocked', 'friend', 'pending_in', 'pending_out'] as $key) { if (!is_bool($state[$key])) { throw new \InvalidArgumentException('Invalid relationship flag.'); } }
    }
    private function assertReasonEvidence(DiscoveryMatch $match): void
    {
        $known = [];
        foreach ($match->candidate->features as $feature) { foreach ($feature['evidence'] as $reference) { $known[Fingerprint::of($reference)] = true; } }
        foreach ($match->assessment->reasons as $reason) { foreach ($reason->evidence as $reference) { if (!isset($known[Fingerprint::of($reference)])) { throw new \InvalidArgumentException('Rule reason has foreign evidence.'); } } }
    }
    private function wireFact(array $fact): array { return ['text' => $fact['text'], 'evidence_ids' => $fact['evidence_ids']]; }
    private function canonical(mixed $value): mixed
    {
        if (!is_array($value)) { return $value; }
        if (!array_is_list($value)) { ksort($value, SORT_STRING); }
        foreach ($value as $key => $item) { $value[$key] = $this->canonical($item); }
        return $value;
    }
}
