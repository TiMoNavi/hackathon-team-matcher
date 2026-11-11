<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\rules;

use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CurrentEventContext, EvidenceRef, QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\{RuleEvaluator, RuleQueryValidator};
use humhub\modules\matcherRecommendation\domain\{MatchReason, RuleAssessment, RuleDiagnostics, RulePolicy};
use humhub\modules\matcherRecommendation\domain\config\PolicyValidator;

/**
 * Pure deterministic v1 rules over authorized logical features. No profile, database, clock or model access.
 * The application/ports still own current membership and visibility authorization.
 */
final class DeterministicRuleEvaluator implements RuleEvaluator, RuleQueryValidator
{
    public const VERSION = 'deterministic-rules-v1';
    private const DIMENSIONS = ['topic', 'contribution', 'availability', 'collaboration_style'];
    private const ROUTE_LIMITS = ['structured' => 80, 'fulltext' => 40, 'semantic' => 80];

    public function validateQuery(QueryIntent $intent, RulePolicy $policy): void
    {
        $this->units($intent, $policy);
    }

    public function evaluate(CurrentEventContext $context, QueryIntent $intent, CandidateProjection $candidate, RulePolicy $policy, array $routeRanks): RuleAssessment
    {
        $units = $this->units($intent, $policy);
        if ($candidate->targetType !== 'person' || $candidate->spaceId !== $context->spaceId || $candidate->targetId === (string)$context->viewerId) {
            throw new \InvalidArgumentException('Rule evaluation requires a different person in the current Space.');
        }
        $parameters = $policy->parameters;
        $rrf = $this->rrf($routeRanks, $parameters);
        $active = []; $dimensionValues = []; $knownCounts = []; $totalCounts = [];
        $unknowns = []; $hardConflicts = []; $reasons = []; $diversityKeys = []; $outcomes = [];
        foreach ($units as $key => $unit) {
            $dimension = $unit['dimension'];
            $active[$dimension] = true;
            $evaluated = $this->evaluateUnit($unit, $candidate, $parameters);
            $dimensionValues[$dimension][] = $evaluated['score'];
            $totalCounts[$dimension] = ($totalCounts[$dimension] ?? 0) + 1;
            $knownCounts[$dimension] = ($knownCounts[$dimension] ?? 0) + (int)$evaluated['known'];
            $ruleIds = array_keys($unit['rules']); sort($ruleIds, SORT_STRING);
            $queryFeatures = array_keys($unit['query_features']); sort($queryFeatures, SORT_STRING);
            if (!$evaluated['known']) { foreach ($queryFeatures as $feature) { $unknowns[$feature] = true; } }
            // A hard condition must pass on its own declared sources, even when scoring deduplicates equivalent facts.
            foreach (array_keys($unit['hard_rules']) as $id) {
                $hardResult = $evaluated['rules'][$id];
                if (!$hardResult['known'] || $hardResult['score'] < 1.0) {
                    $hardConflicts[$id . ($hardResult['known'] ? ':not_satisfied' : ':unknown')] = true;
                }
            }
            if ($evaluated['known'] && $evaluated['score'] > 0.0 && $evaluated['reasons'] !== []) {
                array_push($reasons, ...$evaluated['reasons']);
                if (in_array($dimension, ['topic', 'contribution'], true)) {
                    foreach ($evaluated['matched'] as $token) { $diversityKeys[$dimension . ':' . $token] = true; }
                }
            }
            $outcomes[$key] = [
                'rule_ids' => $ruleIds, 'query_features' => $queryFeatures,
                'dimension' => $dimension, 'operator' => $unit['operator'],
                'score' => $evaluated['score'], 'known' => $evaluated['known'], 'hard' => $unit['hard'],
                'matched_values' => $evaluated['matched'],
            ];
        }
        $normalized = []; $dimensionScores = []; $match = 0.0; $coverage = 0.0;
        $weightSum = 0.0;
        foreach (array_keys($active) as $dimension) { $weightSum += $parameters['dimension_weights'][$dimension]; }
        if ($active !== [] && $weightSum <= 0.0) { throw new \InvalidArgumentException('The active query dimensions have no configured weight.'); }
        foreach (self::DIMENSIONS as $dimension) {
            if (!isset($active[$dimension])) { continue; }
            $normalized[$dimension] = $parameters['dimension_weights'][$dimension] / $weightSum;
            // A dimension is complete only when every distinct requirement is complete.
            // Mixing full, partial, conflicting or unknown requirements yields .5, never duplicate-weighted sums.
            $values = $dimensionValues[$dimension];
            $dimensionScores[$dimension] = min($values) === 1.0 ? 1.0 : (max($values) === 0.0 ? 0.0 : 0.5);
            $match += $normalized[$dimension] * $dimensionScores[$dimension];
            $coverage += $normalized[$dimension] * ($knownCounts[$dimension] / $totalCounts[$dimension]);
        }
        $match = self::bounded($match); $coverage = self::bounded($coverage);
        $unknowns = array_keys($unknowns); sort($unknowns, SORT_STRING);
        $hardConflicts = array_keys($hardConflicts); sort($hardConflicts, SORT_STRING);
        $diversityKeys = array_keys($diversityKeys); sort($diversityKeys, SORT_STRING);
        $insufficiency = $active === [] ? 'no_query_dimensions'
            : ($hardConflicts !== [] ? 'hard_conditions'
            : ($diversityKeys === [] ? 'no_positive_evidence'
            : ($match < $parameters['minimum_match_score'] ? 'below_threshold' : null)));
        $diagnostics = new RuleDiagnostics(self::VERSION, $match, $rrf, $coverage, $dimensionScores, $normalized, $unknowns, $hardConflicts, $insufficiency, $diversityKeys, $outcomes);
        return new RuleAssessment($insufficiency === null, self::bounded(0.8 * $match + 0.2 * $rrf), $reasons, $diagnostics);
    }

    /** Deduplicate equivalent requirements only when sources and alias semantics also agree. */
    private function units(QueryIntent $intent, RulePolicy $policy): array
    {
        PolicyValidator::assertParameters($policy->parameters);
        if ($intent->targetType !== 'person' || $intent->selectedSelfAttributeIds !== [] || $intent->currentIdeaId !== null) {
            throw new \InvalidArgumentException('This evaluator accepts person queries with explicit structured inputs only.');
        }
        $index = [];
        foreach ($policy->parameters['rules'] as $rule) { $index[$rule['query_feature'] . "\0" . $rule['operator']] = $rule; }
        $units = [];
        foreach ($intent->conditions as $condition) {
            $rule = $index[$condition['feature'] . "\0" . $condition['operator']] ?? null;
            if ($rule === null) { throw new \InvalidArgumentException('No configured rule accepts the query feature and operator.'); }
            $wanted = $rule['operator'] === 'interval_overlap'
                ? self::intervals($condition['value'])
                : self::tokens($condition['value'], $rule['aliases']);
            if ($wanted === []) { throw new \InvalidArgumentException('An active query condition requires a nonempty value.'); }
            // Asking for the same declared contribution as both a need and a gap is one requirement, not two votes.
            $family = in_array($rule['operator'], ['supply_demand', 'coverage_gain'], true) ? 'declared_contribution_set' : $rule['operator'];
            $sources = $rule['candidate_features']; sort($sources, SORT_STRING);
            $aliases = self::aliases($rule['aliases']); ksort($aliases, SORT_STRING);
            $key = hash('sha256', json_encode([$rule['dimension'], $family, $wanted, $sources, $aliases], JSON_THROW_ON_ERROR));
            if (!isset($units[$key])) {
                $units[$key] = ['dimension' => $rule['dimension'], 'operator' => $rule['operator'], 'wanted' => $wanted, 'hard' => false, 'hard_rules' => [], 'rules' => [], 'query_features' => []];
            }
            $units[$key]['hard'] = $units[$key]['hard'] || $condition['strength'] === 'hard';
            if ($condition['strength'] === 'hard') { $units[$key]['hard_rules'][$rule['id']] = true; }
            if (strcmp($rule['operator'], $units[$key]['operator']) < 0) { $units[$key]['operator'] = $rule['operator']; }
            $units[$key]['rules'][$rule['id']] = $rule;
            $units[$key]['query_features'][$condition['feature']] = true;
        }
        ksort($units, SORT_STRING);
        return $units;
    }

    private function evaluateUnit(array $unit, CandidateProjection $candidate, array $parameters): array
    {
        $known = false; $values = []; $matched = []; $reasons = []; $ruleOutcomes = [];
        $rules = $unit['rules']; ksort($rules, SORT_STRING);
        foreach ($rules as $rule) {
            $ruleKnown = false; $ruleValues = []; $ruleMatched = []; $ruleEvidence = [];
            foreach ($rule['candidate_features'] as $featureKey) {
                if (!isset($candidate->features[$featureKey])) { continue; }
                $feature = $candidate->features[$featureKey];
                $binding = $parameters['bindings'][$featureKey];
                $scope = $binding['scope'] === 'event' ? 'space:' . $candidate->spaceId : 'global';
                foreach ($feature['evidence'] as $reference) {
                    if ($reference->scope !== $scope) { throw new \UnexpectedValueException('Feature evidence does not match its configured scope.'); }
                }
                try {
                    $tokens = $unit['operator'] === 'interval_overlap' ? self::intervals($feature['value']) : self::tokens($feature['value'], $rule['aliases']);
                } catch (\InvalidArgumentException $error) {
                    throw new \UnexpectedValueException('Candidate feature value does not satisfy the configured rule type.', 0, $error);
                }
                $known = true;
                $ruleKnown = true;
                if ($unit['operator'] === 'interval_overlap') {
                    array_push($values, ...$tokens);
                    array_push($ruleValues, ...$tokens);
                    $hits = self::intervalScore($unit['wanted'], $tokens) > 0.0;
                } else {
                    $hits = false;
                    foreach (array_intersect($unit['wanted'], $tokens) as $token) { $matched['t:' . $token] = $token; $ruleMatched['t:' . $token] = $token; $hits = true; }
                }
                if ($hits) { foreach ($feature['evidence'] as $reference) { $ruleEvidence[self::referenceKey($reference)] = $reference; } }
            }
            $ruleMatched = array_values($ruleMatched); sort($ruleMatched, SORT_STRING); ksort($ruleEvidence, SORT_STRING);
            $localScore = $unit['operator'] === 'interval_overlap'
                ? self::intervalScore($unit['wanted'], $ruleValues)
                : ($ruleMatched === [] ? 0.0 : ($unit['operator'] === 'explicit_preference' || count($ruleMatched) === count($unit['wanted']) ? 1.0 : 0.5));
            $ruleOutcomes[$rule['id']] = ['known' => $ruleKnown, 'score' => $ruleKnown ? $localScore : 0.5];
            if ($localScore > 0.0 && $ruleEvidence !== []) {
                $family = in_array($rule['operator'], ['supply_demand', 'coverage_gain'], true) ? 'declared_contribution_set' : $rule['operator'];
                $reasonKey = hash('sha256', json_encode([$family, $ruleMatched, array_keys($ruleEvidence)], JSON_THROW_ON_ERROR));
                $reasons[$reasonKey] ??= new MatchReason($rule['id'], $this->description($rule['operator'], $localScore, $ruleMatched), array_values($ruleEvidence));
            }
        }
        if (!$known) { return ['score' => 0.5, 'known' => false, 'matched' => [], 'reasons' => [], 'rules' => $ruleOutcomes]; }
        if ($unit['operator'] === 'interval_overlap') {
            $score = self::intervalScore($unit['wanted'], self::mergeIntervals($values));
            // Time is never a topic/contribution diversity key.
            $matched = [];
        } else {
            $matched = array_values($matched); sort($matched, SORT_STRING);
            $score = $matched === [] ? 0.0 : ($unit['operator'] === 'explicit_preference' || count($matched) === count($unit['wanted']) ? 1.0 : 0.5);
        }
        ksort($reasons, SORT_STRING);
        return ['score' => $score, 'known' => true, 'matched' => $matched, 'reasons' => array_values($reasons), 'rules' => $ruleOutcomes];
    }

    /** Tokens are explicit scalar/list entries. Never split prose or infer synonyms/personality. */
    private static function tokens(mixed $value, array $aliases): array
    {
        $aliases = self::aliases($aliases);
        if (is_string($value)) { $value = [$value]; }
        if (!is_array($value) || !array_is_list($value)) { throw new \InvalidArgumentException('Expected explicit string tokens.'); }
        $tokens = [];
        foreach ($value as $token) {
            if (!is_string($token) || trim($token) === '') { throw new \InvalidArgumentException('Expected nonempty string tokens.'); }
            $token = self::normalize($token);
            $token = $aliases[$token] ?? $token;
            $tokens['t:' . $token] = $token;
        }
        $tokens = array_values($tokens); sort($tokens, SORT_STRING);
        return $tokens;
    }

    private static function aliases(array $input): array
    {
        $aliases = [];
        foreach ($input as $alias => $canonical) {
            if (!is_string($alias) || !is_string($canonical) || trim($alias) === '' || trim($canonical) === '') { throw new \InvalidArgumentException('Invalid alias declaration.'); }
            $alias = self::normalize($alias); $canonical = self::normalize($canonical);
            if (isset($aliases[$alias]) && $aliases[$alias] !== $canonical) { throw new \InvalidArgumentException('Ambiguous normalized alias.'); }
            $aliases[$alias] = $canonical;
        }
        foreach ($aliases as $alias => $canonical) {
            if (isset($aliases[$canonical]) && $aliases[$canonical] !== $canonical) { throw new \InvalidArgumentException('Alias chains and cycles are not supported.'); }
        }
        return $aliases;
    }

    private static function normalize(string $value): string { return strtolower(trim($value)); }

    /** Explicit timezone-bearing ISO intervals; duplicates and overlap are merged without counting capacity twice. */
    private static function intervals(mixed $value): array
    {
        if (!is_array($value) || !array_is_list($value)) { throw new \InvalidArgumentException('Expected a list of explicit intervals.'); }
        $intervals = [];
        foreach ($value as $interval) {
            if (!is_array($interval)) { throw new \InvalidArgumentException('Invalid interval.'); }
            $keys = array_keys($interval); sort($keys);
            if ($keys !== ['ends_at', 'starts_at']) { throw new \InvalidArgumentException('Intervals contain only starts_at and ends_at.'); }
            $ends = [];
            foreach (['starts_at', 'ends_at'] as $key) {
                $text = $interval[$key];
                if (!is_string($text) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/D', $text)) {
                    throw new \InvalidArgumentException('An interval endpoint requires an explicit ISO timezone offset.');
                }
                try { $date = new \DateTimeImmutable($text); }
                catch (\Exception $error) { throw new \InvalidArgumentException('Invalid interval endpoint.', 0, $error); }
                $errors = \DateTimeImmutable::getLastErrors();
                if ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) { throw new \InvalidArgumentException('Invalid calendar date.'); }
                $ends[] = (float)$date->format('U.u');
            }
            if ($ends[0] >= $ends[1]) { throw new \InvalidArgumentException('An interval must end after it starts.'); }
            $intervals[] = $ends;
        }
        return self::mergeIntervals($intervals);
    }

    private static function mergeIntervals(array $intervals): array
    {
        usort($intervals, static fn(array $a, array $b): int => ($a[0] <=> $b[0]) ?: ($a[1] <=> $b[1]));
        $merged = [];
        foreach ($intervals as $interval) {
            $last = count($merged) - 1;
            if ($last >= 0 && $interval[0] <= $merged[$last][1]) { $merged[$last][1] = max($merged[$last][1], $interval[1]); }
            else { $merged[] = $interval; }
        }
        return $merged;
    }

    private static function intervalScore(array $wanted, array $available): float
    {
        $available = self::mergeIntervals($available);
        $any = false; $all = true;
        foreach ($wanted as [$start, $end]) {
            $covered = false;
            foreach ($available as [$candidateStart, $candidateEnd]) {
                if ($candidateStart < $end && $candidateEnd > $start) { $any = true; }
                if ($candidateStart <= $start && $candidateEnd >= $end) { $covered = true; }
            }
            $all = $all && $covered;
        }
        return $all && $wanted !== [] ? 1.0 : ($any ? 0.5 : 0.0);
    }

    private function rrf(array $ranks, array $parameters): float
    {
        foreach ($ranks as $route => $rank) {
            if (!in_array($route, $parameters['enabled_routes'], true) || !isset(self::ROUTE_LIMITS[$route]) || !is_int($rank) || $rank < 1 || $rank > self::ROUTE_LIMITS[$route]) {
                throw new \InvalidArgumentException('Unexpected recall route or invalid rank.');
            }
        }
        $total = 0.0;
        foreach ($parameters['enabled_routes'] as $route) { $total += $parameters['route_weights'][$route]; }
        if ($total <= 0.0) { throw new \InvalidArgumentException('Enabled routes have no configured weight.'); }
        $score = 0.0;
        foreach ($parameters['enabled_routes'] as $route) {
            if (isset($ranks[$route])) { $score += ($parameters['route_weights'][$route] / $total) * 61 / (60 + $ranks[$route]); }
        }
        return self::bounded($score);
    }

    private function description(string $operator, float $score, array $matched): string
    {
        $labels = [];
        foreach (array_slice($matched, 0, 3) as $token) { preg_match('/^.{0,32}/us', $token, $label); $labels[] = $label[0] ?? ''; }
        $suffix = implode('、', $labels);
        return match ($operator) {
            'similarity' => ($score < 1 ? '部分共同主题或明确能力标签：' : '共同主题或明确能力标签：') . $suffix,
            'supply_demand' => ($score < 1 ? '本次声明愿意提供的贡献部分覆盖需求：' : '本次声明愿意提供的贡献覆盖需求：') . $suffix,
            'coverage_gain' => ($score < 1 ? '本次声明贡献可补充部分明确缺口：' : '本次声明贡献可补充这些明确缺口：') . $suffix,
            'explicit_preference' => '候选的本人自述符合你明确选择的可接受偏好：' . $suffix,
            'interval_overlap' => $score === 1.0 ? '已确认可用时段覆盖本次明确要求的时段。' : '已确认可用时段与本次要求部分重叠，不能视为全部满足。',
        };
    }

    private static function referenceKey(EvidenceRef $reference): string { return hash('sha256', json_encode($reference, JSON_THROW_ON_ERROR)); }
    private static function bounded(float $value): float { return min(1.0, max(0.0, $value)); }
}
