<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\conversation;

/** Safe storage reasons; never chains SQL, credentials, or conversation text. */
final class ConversationStorageException extends \RuntimeException
{
    private const MESSAGES = [
        'invalid_data' => 'The conversation snapshot does not satisfy the storage contract.',
        'snapshot_too_large' => 'The conversation snapshot exceeds the configured storage limit.',
        'duplicate_conversation' => 'The conversation identifier already exists.',
        'corrupt_storage' => 'Stored conversation data is malformed or inconsistent.',
        'dependency_unavailable' => 'The conversation storage dependency is unavailable.',
        'transaction_unsupported' => 'An externally owned transaction cannot be used by this store.',
        'driver_unsupported' => 'This conversation store requires SQLite or MySQL.',
    ];

    public function __construct(public readonly string $reason)
    {
        if (!isset(self::MESSAGES[$reason])) { throw new \InvalidArgumentException('Unknown conversation storage reason.'); }
        parent::__construct(self::MESSAGES[$reason]);
    }
}
