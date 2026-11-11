<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CandidateRequest, ContractShape};

/** Internal authorized replay item. Saved batches contain no assessment, so replay invents none. */
final class DiscoveryBatchItem
{
    public function __construct(public readonly int $position, public readonly CandidateProjection $candidate, public readonly array $relationship)
    {
        if ($position < 0 || $position >= CandidateRequest::MAX_CANDIDATES) { throw new \InvalidArgumentException('Invalid batch item position.'); }
        $keys = array_keys($relationship); sort($keys, SORT_STRING);
        if ($keys !== ['blocked', 'friend', 'pending_in', 'pending_out', 'version'] || !is_string($relationship['version'])) { throw new \InvalidArgumentException('Invalid replay relationship.'); }
        ContractShape::token($relationship['version']);
        foreach (['blocked', 'friend', 'pending_in', 'pending_out'] as $key) { if (!is_bool($relationship[$key])) { throw new \InvalidArgumentException('Invalid replay relationship.'); } }
        if ($relationship['blocked']) { throw new \InvalidArgumentException('A blocked replay item cannot be returned.'); }
    }
}
