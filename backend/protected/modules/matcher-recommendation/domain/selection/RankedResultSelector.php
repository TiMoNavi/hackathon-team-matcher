<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\selection;
use humhub\modules\matcherRecommendation\contracts\CandidateRequest;
use humhub\modules\matcherRecommendation\domain\DiscoveryMatch;

/** Deterministic selection within fixed score bands; neither this class nor history changes a match score. */
final class RankedResultSelector
{
    /**
     * @param list<DiscoveryMatch> $items Only qualified, currently authorized matches.
     * @param array{near_tie_delta:float,exploration_slots:int,max_results:int} $options
     * @param array<string,int> $exposures Empty means no optional history provider was configured.
     * @param array<string,list<string>> $diversityKeys Positive, query-relevant topic/contribution evidence categories.
     */
    public function select(array $items, array $options, array $exposures = [], array $diversityKeys = []): SelectedMatches
    {
        $keys = array_keys($options); sort($keys);
        if ($keys !== ['exploration_slots', 'max_results', 'near_tie_delta']
            || !is_numeric($options['near_tie_delta']) || !is_finite((float)$options['near_tie_delta'])
            || !in_array($options['near_tie_delta'], [0.0, 0.05], true)
            || !is_int($options['exploration_slots']) || !in_array($options['exploration_slots'], [0, 1], true)
            || !is_int($options['max_results']) || $options['max_results'] < 1 || $options['max_results'] > CandidateRequest::MAX_CANDIDATES
            || !array_is_list($items) || count($items) > CandidateRequest::MAX_CANDIDATES) {
            throw new \InvalidArgumentException('Invalid selection policy or candidate bound.');
        }
        $ids = [];
        foreach ($items as $item) {
            if (!$item instanceof DiscoveryMatch || !$item->assessment->qualifies || isset($ids[$item->candidate->targetId])) {
                throw new \InvalidArgumentException('Selector only accepts unique qualified matches.');
            }
            $ids[$item->candidate->targetId] = true;
        }
        if ($exposures !== [] && count($exposures) !== count($ids)) { throw new \UnexpectedValueException('Incomplete exposure history.'); }
        foreach ($exposures as $id => $count) {
            if (!isset($ids[$id]) || !is_int($count) || $count < 0) { throw new \UnexpectedValueException('Invalid exposure history.'); }
        }
        foreach ($diversityKeys as $id => $categories) {
            if (!isset($ids[$id]) || !is_array($categories) || !array_is_list($categories)) { throw new \UnexpectedValueException('Invalid diversity evidence.'); }
            foreach ($categories as $category) {
                if (!is_string($category) || trim($category) === '') { throw new \UnexpectedValueException('Invalid diversity category.'); }
            }
        }
        usort($items, self::byScore(...));
        // Each group's upper anchor stays fixed. A~B and B~C cannot drag C above A when A-C exceeds the band.
        $bands = []; $anchor = null;
        foreach ($items as $item) {
            if ($anchor === null || $anchor - $item->assessment->sortScore > $options['near_tie_delta'] + 1.0e-12) {
                $bands[] = []; $anchor = $item->assessment->sortScore;
            }
            $bands[count($bands) - 1][] = $item;
        }
        $chosen = []; $seen = []; $explored = [];
        foreach ($bands as $band) {
            while ($band !== [] && count($chosen) < $options['max_results']) {
                // A boolean novelty criterion avoids rewarding longer profiles or counting duplicate tags.
                $novel = static function (DiscoveryMatch $match) use ($diversityKeys, $seen): int {
                    foreach ($diversityKeys[$match->candidate->targetId] ?? [] as $key) { if (!isset($seen[$key])) { return 1; } }
                    return 0;
                };
                usort($band, static fn(DiscoveryMatch $a, DiscoveryMatch $b): int => ($novel($b) <=> $novel($a)) ?: self::byScore($a, $b));
                $next = $band[0];
                if ($options['exploration_slots'] === 1 && $explored === [] && $exposures !== []) {
                    $byExposure = $band;
                    usort($byExposure, static fn(DiscoveryMatch $a, DiscoveryMatch $b): int => ($exposures[$a->candidate->targetId] <=> $exposures[$b->candidate->targetId]) ?: ($novel($b) <=> $novel($a)) ?: self::byScore($a, $b));
                    $alternative = $byExposure[0];
                    if ($exposures[$alternative->candidate->targetId] < $exposures[$next->candidate->targetId]) {
                        $next = $alternative; $explored[] = $next->candidate->targetId;
                    }
                }
                $chosen[] = $next;
                foreach ($diversityKeys[$next->candidate->targetId] ?? [] as $key) { $seen[$key] = true; }
                $band = array_values(array_filter($band, static fn(DiscoveryMatch $item): bool => $item->candidate->targetId !== $next->candidate->targetId));
            }
            if (count($chosen) >= $options['max_results']) { break; }
        }
        return new SelectedMatches($chosen, $explored);
    }

    private static function byScore(DiscoveryMatch $a, DiscoveryMatch $b): int
    {
        return ($b->assessment->sortScore <=> $a->assessment->sortScore) ?: strcmp($a->candidate->targetId, $b->candidate->targetId);
    }
}
