<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;
final class AttachmentReceipt
{
    public static function uploaded(Attachment $attachment, string $clientUploadId, bool $replayed, int $expiresAt, string $requestId): array
    {
        Attachment::uuid($clientUploadId); SafeInteger::positive($expiresAt, 'expires_at');
        return ['data' => ['attachment' => $attachment->dto(), 'client_upload_id' => $clientUploadId, 'replayed' => $replayed, 'expires_at' => gmdate('Y-m-d\TH:i:s\Z', $expiresAt)], 'meta' => ['request_id' => $requestId]];
    }
    public static function cancelled(string $attachmentId, string $state, string $requestId): array
    {
        Attachment::uuid($attachmentId);
        if (!in_array($state, ['cancelled', 'expired'], true)) { throw new \LogicException('Cancellation must return a terminal unbound state.'); }
        return ['data' => ['attachment_id' => $attachmentId, 'state' => $state], 'meta' => ['request_id' => $requestId]];
    }
}
