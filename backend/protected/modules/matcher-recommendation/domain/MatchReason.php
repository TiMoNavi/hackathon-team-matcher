<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain;
use humhub\modules\matcherRecommendation\contracts\{ContractShape, EvidenceRef};

final class MatchReason
{
    /** @param list<EvidenceRef> $evidence */
    public function __construct(public readonly string $ruleId, public readonly string $description, public readonly array $evidence)
    {
        ContractShape::token($ruleId);
        if (trim($description) === '' || !array_is_list($evidence) || $evidence === []) {
            throw new \InvalidArgumentException('A match reason requires a description and evidence.');
        }
        foreach ($evidence as $reference) {
            if (!$reference instanceof EvidenceRef) { throw new \InvalidArgumentException('Invalid reason reference.'); }
        }
    }
}
