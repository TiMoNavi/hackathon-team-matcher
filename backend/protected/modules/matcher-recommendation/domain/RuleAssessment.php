<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain;

/** A RuleEvaluator decision, not a success probability. R1's three-argument construction remains valid. */
final class RuleAssessment
{
    /** @param list<MatchReason> $reasons */
    public function __construct(public readonly bool $qualifies, public readonly float $sortScore, public readonly array $reasons = [], public readonly ?RuleDiagnostics $diagnostics = null)
    {
        if (!is_finite($sortScore) || $sortScore < 0 || $sortScore > 1 || !array_is_list($reasons) || ($qualifies && $reasons === [])) {
            throw new \InvalidArgumentException('A qualifying assessment needs a finite score and evidence-backed reasons.');
        }
        foreach ($reasons as $reason) {
            if (!$reason instanceof MatchReason) { throw new \InvalidArgumentException('Invalid match reason.'); }
        }
    }
}
