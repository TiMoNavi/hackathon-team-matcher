<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\native;

/** Adapter failure with a bounded reason; an HTTP mapper is intentionally outside this adapter. */
final class NativeAccessException extends \RuntimeException
{
    private const MESSAGES = [
        'authentication_required' => 'An authenticated server actor is required.',
        'current_event_required' => 'A server-selected current Space is required.',
        'current_event_mismatch' => 'The request does not match the server-selected actor and Space.',
        'access_denied' => 'Current active account and formal Space membership are required.',
        'context_changed' => 'The current activity context has changed.',
        'candidate_access_revoked' => 'A requested candidate is no longer eligible in this Space.',
        'dependency_unavailable' => 'The native authorization or relationship source is unavailable.',
        'authorization_transaction_unsupported' => 'Fresh native authorization cannot use an existing transaction snapshot.',
        'unsupported_history' => 'Complete sent-request history is not available from native Friendship.',
        'invalid_request' => 'A bounded canonical person request is required.',
    ];

    public function __construct(public readonly string $reason, ?\Throwable $previous = null)
    {
        if (!isset(self::MESSAGES[$reason])) { throw new \InvalidArgumentException('Unknown native access failure.'); }
        parent::__construct(self::MESSAGES[$reason], 0, $previous);
    }
}
