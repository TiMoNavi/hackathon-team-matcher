<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\{CurrentEventContext, QueryIntent, CandidateProjection};
use humhub\modules\matcherRecommendation\domain\{RulePolicy, RuleAssessment};

interface RuleEvaluator
{
    /**
     * Deterministic, no I/O or AI. Must evaluate all explicit hard conditions and the active policy.
     * Unknown does not satisfy a hard condition. Qualifying reasons must reference the supplied projection.
     * R1 requires explicit injection; no default/fake production evaluator is provided.
     */
    /** @param array<string,int> $routeRanks Validated 1-based ranks from structured/fulltext/semantic recall. */
    public function evaluate(CurrentEventContext $context, QueryIntent $intent, CandidateProjection $candidate, RulePolicy $policy, array $routeRanks): RuleAssessment;
}
