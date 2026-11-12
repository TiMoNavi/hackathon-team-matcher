<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

/** Pure staging/key/quota rules, independent of SQL, filesystem, session and HTTP. */
final class AttachmentLifecycle
{
    public const MAX_STAGED = 20;
    public const RATE_COUNT = 20;
    public const RATE_SECONDS = 60;
    public static function replay(array $row, string $payloadHash, int $now): void
    {
        if (!hash_equals($row['payload_hash'], $payloadHash)) { throw new ChatException('IDEMPOTENCY_CONFLICT', 'This upload key was already used for a different file.', 409); }
        if (in_array($row['state'], ['cancelled', 'expired', 'failed'], true) || ($row['state'] !== 'bound' && (int)$row['expires_at'] <= $now)) { throw new ChatException('ATTACHMENT_UNAVAILABLE', 'This upload key is permanently retired.', 410); }
    }
    public static function cancelledState(array $row, int $now): string
    {
        if ($row['state'] === 'bound') { throw new ChatException('ATTACHMENT_ALREADY_BOUND', 'A sent attachment cannot be cancelled.', 409); }
        return in_array($row['state'], ['cancelled', 'expired'], true) ? $row['state'] : ((int)$row['expires_at'] <= $now ? 'expired' : 'cancelled');
    }
    public static function bindable(array $row, int $now): void
    {
        if ($row['state'] === 'bound') { throw new ChatException('ATTACHMENT_ALREADY_BOUND', 'This attachment already belongs to a message.', 409); }
        if ($row['state'] !== 'staged' || (int)$row['expires_at'] <= $now) { throw new ChatException('ATTACHMENT_UNAVAILABLE', 'The attachment is not available for sending.', 410); }
    }
    /** Input timestamps are already selected within the current rolling window. */
    public static function quota(array $successfulUploadTimes, array $stagedExpiryTimes, int $now, bool $reserve): void
    {
        if (count($successfulUploadTimes) >= self::RATE_COUNT) { throw new ChatException('RATE_LIMITED', 'Wait before uploading another attachment.', 429, true, [], max(1, min($successfulUploadTimes) + self::RATE_SECONDS - $now)); }
        if ($reserve && count($stagedExpiryTimes) >= self::MAX_STAGED) { throw new ChatException('RATE_LIMITED', 'Cancel a staged attachment or wait for its expiry.', 429, true, [], max(1, min($stagedExpiryTimes) - $now)); }
    }
}
