<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\persistence;

/** Safe internal storage reasons; no database exceptions, SQL or payloads in the public chain. */
final class StorageException extends \RuntimeException
{
    private const MESSAGES = [
        'invalid_data' => 'The value does not satisfy the recommendation storage contract.',
        'corrupt_storage' => 'Stored recommendation data is malformed or inconsistent.',
        'cas_conflict' => 'The expected recommendation storage version is no longer current.',
        'policy_unavailable' => 'No recommendation policy has been explicitly published.',
        'dependency_unavailable' => 'The recommendation storage dependency is unavailable.',
        'transaction_unsupported' => 'An externally owned transaction cannot be used by this store.',
        'transaction_failed' => 'The recommendation storage transaction did not complete.',
    ];
    public function __construct(public readonly string $reason)
    {
        if (!isset(self::MESSAGES[$reason])) { throw new \InvalidArgumentException('Unknown storage reason.'); }
        parent::__construct(self::MESSAGES[$reason]);
    }
}
