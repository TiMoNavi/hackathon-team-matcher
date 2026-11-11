<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain;
use humhub\modules\matcherRecommendation\contracts\ContractShape;

/** One bounded rule-discovery snapshot, not the complete paginated membership of an activity. */
final class DiscoveryResult
{
    /** @param list<DiscoveryMatch> $items */
    public function __construct(
        public readonly string $batchId,
        public readonly DiscoveryBatch $batch,
        public readonly array $items,
        public readonly ?DiscoveryOutcome $outcome = null,
        public readonly array $explorationIds = [],
    )
    {
        ContractShape::token($batchId);
        if (!array_is_list($items) || count($items) !== count($batch->targetIds)) {
            throw new \InvalidArgumentException('Result does not match its batch.');
        }
        foreach ($items as $i => $item) {
            if (!$item instanceof DiscoveryMatch || $item->candidate->targetId !== $batch->targetIds[$i]) {
                throw new \InvalidArgumentException('Result ordering does not match its batch.');
            }
        }
        if ($outcome !== null && (($items !== []) !== ($outcome->reason === 'matched'))) {
            throw new \InvalidArgumentException('Outcome does not match the visible result.');
        }
        if (!array_is_list($explorationIds) || count($explorationIds) > 1) { throw new \InvalidArgumentException('At most one exploration result is allowed.'); }
        foreach ($explorationIds as $id) {
            if (!is_string($id) || !in_array($id, $batch->targetIds, true)) { throw new \InvalidArgumentException('Exploration result is outside the fixed batch.'); }
        }
    }
}
