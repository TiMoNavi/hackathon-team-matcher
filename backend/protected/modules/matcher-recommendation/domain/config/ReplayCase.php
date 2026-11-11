<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\config;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, ContractShape, CurrentEventContext, QueryIntent};

/** A synthetic assertion, not a callback or a proposed test result. */
final class ReplayCase
{
    public function __construct(
        public readonly string $id,
        public readonly CurrentEventContext $context,
        public readonly QueryIntent $intent,
        public readonly CandidateProjection $candidate,
        public readonly array $routeRanks,
        public readonly bool $expectedQualifies,
        public readonly float $minimumScore,
        public readonly float $maximumScore,
        public readonly int $minimumReasons = 0,
    ) {
        ContractShape::token($id); ContractShape::jsonValue($routeRanks);
        if (!is_finite($minimumScore) || !is_finite($maximumScore) || $minimumScore < 0 || $maximumScore > 1 || $minimumScore > $maximumScore || $minimumReasons < 0 || $minimumReasons > 64) { throw new \InvalidArgumentException('Invalid replay assertion.'); }
    }
}
