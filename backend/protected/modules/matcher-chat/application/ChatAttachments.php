<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\application;

use humhub\modules\matcherChat\domain\{Attachment, AttachmentUpload, SafeInteger};
use humhub\modules\matcherChat\domain\ports\AttachmentRepository;

/** Stable attachment use-case boundary; no database or native-file dependency. */
final class ChatAttachments
{
    public function __construct(private readonly AttachmentRepository $repository) {}
    public function upload(int $conversationId, AttachmentUpload $upload, string $sourceReference, string $requestId): array
    { SafeInteger::positive($conversationId, 'conversation_id'); return $this->repository->upload($conversationId, $upload, $sourceReference, $requestId); }
    public function cancel(int $conversationId, string $attachmentId, string $requestId): array
    { SafeInteger::positive($conversationId, 'conversation_id'); return $this->repository->cancel($conversationId, Attachment::uuid($attachmentId), $requestId); }
    public function download(int $conversationId, string $attachmentId): array
    { SafeInteger::positive($conversationId, 'conversation_id'); return $this->repository->download($conversationId, Attachment::uuid($attachmentId)); }
    public function cleanup(int $limit = 100): array
    { if ($limit < 1 || $limit > 100) { throw new \InvalidArgumentException('Cleanup limit must be 1 to 100.'); } return $this->repository->cleanup($limit); }
}
