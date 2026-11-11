<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\conversation;

/** Safe, bounded deployment diagnostics. Never includes a dependency exception or input. */
final class ConversationReadinessException extends \RuntimeException
{
    public function __construct(public readonly string $reason)
    {
        if (!in_array($reason, ['disabled', 'history_unavailable', 'platform_budget_unavailable', 'provider_unconfigured',
            'policy_unavailable', 'storage_unavailable', 'profile_unavailable', 'lifecycle_changed'], true)) {
            throw new \InvalidArgumentException('Unknown conversation readiness failure.');
        }
        parent::__construct('Recommendation conversation unavailable: ' . $reason . '.');
    }
}
