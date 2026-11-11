<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\ai;
use humhub\modules\matcherRecommendation\domain\MatchReason;

/** Rule evidence score and ordinal AI rank are distinct; neither is a collaboration probability. */
final class AiRankedCandidate
{
    /** @param list<string> $evidenceIds @param list<MatchReason> $reasons */
    public function __construct(
        public readonly string $targetType,
        public readonly string $id,
        public readonly float $ruleScore,
        public readonly int $aiRank,
        public readonly array $evidenceIds,
        public readonly array $reasons,
    ) {
        if ($targetType !== 'person' || !preg_match('/^[1-9][0-9]*$/D', $id) || !is_finite($ruleScore) || $ruleScore < 0 || $ruleScore > 1 || $aiRank < 1 || $aiRank > 5
            || !array_is_list($evidenceIds) || $evidenceIds === [] || count(array_unique($evidenceIds)) !== count($evidenceIds) || !array_is_list($reasons) || $reasons === []) {
            throw new \InvalidArgumentException('Invalid AI ranking result.');
        }
        foreach ($reasons as $reason) { if (!$reason instanceof MatchReason) { throw new \InvalidArgumentException('Invalid core evidence reason.'); } }
    }
}
