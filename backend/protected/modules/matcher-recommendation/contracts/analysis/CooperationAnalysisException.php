<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\analysis;

/** Safe internal failures without upstream text, profile values, or a previous exception chain. */
final class CooperationAnalysisException extends \RuntimeException
{
    private const MESSAGES = [
        'invalid_request' => 'The analysis request is invalid.',
        'context_changed' => 'The current activity context changed.',
        'selection_unavailable' => 'The explicit self selection is unavailable or no longer current.',
        'candidate_unavailable' => 'The requested person is unavailable in this context.',
        'projection_changed' => 'The analysis projection changed or exceeded its approved scope.',
        'mapping_changed' => 'The reviewed analysis mapping or field directory changed.',
        'dependency_unavailable' => 'An analysis verification dependency is unavailable.',
    ];
    public function __construct(public readonly string $reason)
    {
        if (!isset(self::MESSAGES[$reason])) { throw new \InvalidArgumentException('Unknown analysis failure.'); }
        parent::__construct(self::MESSAGES[$reason]);
    }
}
