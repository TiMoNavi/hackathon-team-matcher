<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain;

/** Internal generic outcome. No excluded-person counts, blocked IDs or field-privacy reasons. Not a public API enum. */
final class DiscoveryOutcome
{
    public function __construct(public readonly string $reason)
    {
        if (!in_array($reason, ['matched', 'no_authorized_candidates', 'hard_conditions_unmet', 'no_clear_match', 'no_current_matches'], true)) {
            throw new \InvalidArgumentException('Unknown discovery outcome.');
        }
    }

    /** Guidance only: these do not trigger a query or relax conditions without a user's action. */
    public function suggestedActions(): array
    {
        return $this->reason === 'matched' ? [] : ['adjust_conditions', 'browse_current_event'];
    }
}
