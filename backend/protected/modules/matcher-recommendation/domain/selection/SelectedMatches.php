<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\selection;
use humhub\modules\matcherRecommendation\domain\DiscoveryMatch;

/** Internal selection metadata. Stored batch ordering remains the source for later pagination. */
final class SelectedMatches
{
    /** @param list<DiscoveryMatch> $items @param list<string> $explorationIds */
    public function __construct(public readonly array $items, public readonly array $explorationIds = [])
    {
        if (!array_is_list($items) || !array_is_list($explorationIds) || count($explorationIds) > 1) {
            throw new \InvalidArgumentException('Invalid bounded selection.');
        }
        $ids = [];
        foreach ($items as $item) {
            if (!$item instanceof DiscoveryMatch || !$item->assessment->qualifies || isset($ids[$item->candidate->targetId])) {
                throw new \InvalidArgumentException('Selection requires unique qualified matches.');
            }
            $ids[$item->candidate->targetId] = true;
        }
        foreach ($explorationIds as $id) {
            if (!is_string($id) || !isset($ids[$id])) { throw new \InvalidArgumentException('Exploration must stay inside the qualified selection.'); }
        }
    }
}
