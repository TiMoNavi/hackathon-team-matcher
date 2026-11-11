<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain;

/** Bounded internal failure. No query, profile, credential or upstream exception chain is retained. */
final class BatchReplayException extends \RuntimeException
{
    private const MESSAGES = [
        'invalid_request' => 'A valid batch ID, limit and continuation cursor are required.',
        'batch_not_found' => 'The requested discovery batch is unavailable.',
        'batch_expired' => 'The discovery batch has expired.',
        'batch_invalidated' => 'The discovery batch is no longer current.',
        'cursor_invalid' => 'The discovery continuation cursor is invalid.',
        'dependency_unavailable' => 'Discovery batch verification is unavailable.',
    ];

    public function __construct(public readonly string $reason)
    {
        if (!isset(self::MESSAGES[$reason])) { throw new \InvalidArgumentException('Unknown replay failure.'); }
        parent::__construct(self::MESSAGES[$reason]);
    }
}
