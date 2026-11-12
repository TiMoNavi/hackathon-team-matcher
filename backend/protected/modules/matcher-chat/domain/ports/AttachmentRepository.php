<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain\ports;

use humhub\modules\matcherChat\domain\AttachmentUpload;

/** Actor-owned adapter; implementations own locks and byte-store compensation. */
interface AttachmentRepository
{
    public function upload(int $conversationId, AttachmentUpload $upload, string $sourceReference, string $requestId): array;
    public function cancel(int $conversationId, string $attachmentId, string $requestId): array;
    public function download(int $conversationId, string $attachmentId): array;
    public function cleanup(int $limit = 100): array;
}
