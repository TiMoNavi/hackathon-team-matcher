<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\conversation;

use humhub\modules\matcherRecommendation\contracts\QueryIntent;
use humhub\modules\matcherRecommendation\domain\{DiscoveryMatch, RulePolicy};
use humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException;
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;

/** Request-local atomic facts. The complete projection and evidence stay in the core. */
final class ConversationCandidateSummaries
{
    /** @return array{candidates:array,facts:array} */
    public function build(array $matches, QueryIntent $intent, RulePolicy $policy): array
    {
        $requested = []; $rules = [];
        foreach ($policy->parameters['rules'] as $rule) { $rules[$rule['query_feature'] . ':' . $rule['operator']] = $rule; }
        foreach ($intent->conditions as $condition) {
            $rule = $rules[$condition['feature'] . ':' . $condition['operator']];
            foreach ($rule['candidate_features'] as $feature) { $requested[$feature][] = ['rule' => $rule, 'value' => $condition['value'], 'hard' => $condition['strength'] === 'hard']; }
        }
        $candidates = []; $factMap = []; $counter = 0;
        foreach ($matches as $match) {
            if (!$match instanceof DiscoveryMatch || !$match->assessment->qualifies) { throw new AiRecommendationException('provider_unavailable'); }
            $atoms = []; $unknown = [];
            foreach ($policy->parameters['bindings'] as $feature => $binding) {
                // Supplement task-relevant capabilities and willingness, never arbitrary profile fields.
                if (!isset($requested[$feature]) && !in_array($binding['semantic'], ['capability', 'declared_contribution', 'availability', 'collaboration_preference'], true)) { continue; }
                $entry = $match->candidate->features[$feature] ?? null;
                if ($entry === null) { $unknown[] = $feature; continue; }
                $values = is_array($entry['value']) && array_is_list($entry['value']) ? $entry['value'] : [$entry['value']];
                foreach ($values as $value) {
                    $positive = $this->positive($value, $requested[$feature] ?? []);
                    $required = $this->required($value, $requested[$feature] ?? []);
                    $atoms[] = ['feature' => $feature, 'text' => $feature . '=' . ConversationInput::json($value), 'positive' => $positive,
                        'required' => $required, 'priority' => $required ? -1 : ($positive ? 0 : ($binding['semantic'] === 'capability' ? 1 : ($binding['semantic'] === 'availability' ? 2 : 3))),
                        'evidence' => $entry['evidence'], 'atom_hash' => Fingerprint::of([$feature, $value])];
                }
            }
            usort($atoms, static fn(array $a, array $b): int => ($a['priority'] <=> $b['priority']) ?: strcmp($a['feature'], $b['feature']) ?: strcmp($a['text'], $b['text']));
            // Round-robin each priority across features, so a long skill list cannot hide experience.
            $ordered = []; $groups = [];
            foreach ($atoms as $atom) { $groups[$atom['priority']][$atom['feature']][] = $atom; }
            foreach ($groups as $features) {
                do { $added = false; foreach ($features as &$entries) { if ($entries !== []) { $ordered[] = array_shift($entries); $added = true; } } unset($entries); } while ($added);
            }
            $summary = ['id' => $match->candidate->targetId, 'rule_score' => $match->assessment->sortScore,
                'facts' => [], 'unknown_features' => $unknown, 'omitted_fact_count' => count($ordered)];
            $candidateFacts = []; $requiredFits = true;
            foreach ($ordered as $atom) {
                $fact = ['id' => 'f' . ($counter + 1), 'feature' => $atom['feature'], 'text' => $atom['text'], 'positive' => $atom['positive']];
                $trial = $summary; $trial['facts'][] = $fact; $trial['omitted_fact_count']--;
                if (strlen(ConversationInput::json($trial)) > min(768, $policy->parameters['limits']['candidate_bytes'])) {
                    if ($atom['required']) { $requiredFits = false; break; }
                    continue;
                }
                $counter++; $summary = $trial;
                $candidateFacts[$fact['id']] = $atom;
            }
            if (!$requiredFits) { continue; }
            if (!array_filter($summary['facts'], static fn(array $fact): bool => $fact['positive'])) { continue; }
            $candidates[] = $summary; $factMap[$summary['id']] = $candidateFacts;
            if (count($candidates) >= min(24, $policy->parameters['limits']['model_candidates'])) { break; }
        }
        return ['candidates' => $candidates, 'facts' => $factMap];
    }

    /** Keep all atomic evidence that supports a confirmed hard condition before optional facts. */
    private function required(mixed $value, array $requirements): bool
    {
        foreach ($requirements as $requirement) {
            if (!$requirement['hard']) { continue; }
            if ($requirement['rule']['operator'] === 'interval_overlap') {
                if (!is_array($value) || !isset($value['starts_at'], $value['ends_at'])) { continue; }
                $start = strtotime($value['starts_at']); $end = strtotime($value['ends_at']);
                foreach ($requirement['value'] as $interval) {
                    if ($start < strtotime($interval['ends_at']) && $end > strtotime($interval['starts_at'])) { return true; }
                }
                continue;
            }
            if (!is_string($value)) { continue; }
            $aliases = [];
            foreach ($requirement['rule']['aliases'] as $from => $to) { $aliases[strtolower(trim($from))] = strtolower(trim($to)); }
            $normal = static fn(string $text): string => $aliases[strtolower(trim($text))] ?? strtolower(trim($text));
            foreach (is_string($requirement['value']) ? [$requirement['value']] : $requirement['value'] as $wanted) {
                if (is_string($wanted) && $normal($value) === $normal($wanted)) { return true; }
            }
        }
        return false;
    }

    private function positive(mixed $value, array $requirements): bool
    {
        if (!is_string($value)) { return false; }
        foreach ($requirements as $requirement) {
            $rule = $requirement['rule'];
            if (!in_array($rule['dimension'], ['topic', 'contribution'], true) || !in_array($rule['operator'], ['similarity', 'supply_demand', 'coverage_gain'], true)) { continue; }
            $aliases = [];
            foreach ($rule['aliases'] as $from => $to) { $aliases[strtolower(trim($from))] = strtolower(trim($to)); }
            $normal = static fn(string $text): string => $aliases[strtolower(trim($text))] ?? strtolower(trim($text));
            foreach (is_string($requirement['value']) ? [$requirement['value']] : $requirement['value'] as $wanted) {
                if (is_string($wanted) && $normal($value) === $normal($wanted)) { return true; }
            }
        }
        return false;
    }
}
