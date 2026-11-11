<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\index;

/** Bounded failures deliberately omit SQL, source values and exception chains. */
final class CandidateIndexException extends \RuntimeException
{
    private const MESSAGES = [
        'capacity_exceeded' => 'The activity exceeds the configured complete index build capacity.',
        'snapshot_invalid' => 'The index snapshot is not owned by this request or is no longer active.',
        'lease_expired' => 'The request index generation has expired.',
        'source_changed' => 'Authorized source facts changed during recommendation recall.',
        'policy_changed' => 'The recommendation policy changed during index use.',
        'index_changed' => 'The published index is no longer complete.',
        'invalid_projection' => 'The authorized batch returned an invalid candidate projection.',
        'invalid_policy' => 'The policy cannot be represented by this index.',
        'transaction_unsupported' => 'Current index authorization cannot use an existing transaction.',
        'dependency_unavailable' => 'An authorized index dependency is unavailable.',
    ];
    public function __construct(public readonly string $reason)
    {
        if (!isset(self::MESSAGES[$reason])) { throw new \InvalidArgumentException('Unknown index failure.'); }
        parent::__construct(self::MESSAGES[$reason]);
    }
}
