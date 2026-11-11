<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\ai;

/** Stable internal failure reasons; no upstream body, input text, credential or exception chain. */
final class AiRecommendationException extends \RuntimeException
{
    private const REASONS = ['invalid_model_output', 'provider_unavailable', 'provider_unconfigured', 'history_unavailable',
        'budget_exhausted', 'request_budget_exceeded', 'context_invalidated', 'invalid_request', 'run_conflict', 'cancelled', 'clarification_limit'];
    public function __construct(public readonly string $reason)
    {
        if (!in_array($reason, self::REASONS, true)) { throw new \InvalidArgumentException('Unknown AI recommendation failure.'); }
        parent::__construct('AI recommendation: ' . $reason . '.');
    }
}
