<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

final class SendText
{
    public readonly string $clientMessageId;
    public readonly string $body;
    public readonly string $bodyHash;
    public readonly array $attachmentIds;

    public function __construct(mixed $clientMessageId, mixed $body, mixed $attachmentIds = [])
    {
        if (!is_string($clientMessageId) || preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $clientMessageId) !== 1) {
            throw new ChatException('INVALID_CLIENT_MESSAGE_ID', 'Use a lowercase UUID version 4.');
        }
        if (!is_array($attachmentIds) || !array_is_list($attachmentIds) || count($attachmentIds) > Attachment::MAX_FILES) { throw new ChatException('INVALID_ATTACHMENT_IDS', 'Provide at most three distinct attachment UUIDs.'); }
        try { foreach ($attachmentIds as $id) { Attachment::uuid($id); } } catch (ChatException) { throw new ChatException('INVALID_ATTACHMENT_IDS', 'Provide at most three distinct attachment UUIDs.'); }
        if (count(array_unique($attachmentIds)) !== count($attachmentIds)) { throw new ChatException('INVALID_ATTACHMENT_IDS', 'Attachment UUIDs must be distinct.'); }
        if (!is_string($body) || ($body === '' && $attachmentIds === []) || strlen($body) > 16000 || preg_match('//u', $body) !== 1
            || ($body !== '' && preg_match('/[^\p{Z}\s]/u', $body) !== 1)
            || preg_match('/[\x{0000}-\x{0008}\x{000B}\x{000C}\x{000E}-\x{001F}\x{007F}-\x{009F}]/u', $body) === 1
            || preg_match_all('/./us', $body) > 4000) {
            throw new ChatException('INVALID_MESSAGE_BODY', 'Use 1 to 4000 Unicode characters of nonempty plain text.');
        }
        $this->clientMessageId = $clientMessageId;
        $this->body = $body;
        $this->attachmentIds = $attachmentIds;
        // Preserve every pre-C05-B text receipt hash. Order is part of attachment identity.
        $this->bodyHash = $attachmentIds === [] ? hash('sha256', $body) : hash('sha256', "chat-attachments-v1\0" . json_encode([$body, $attachmentIds], JSON_THROW_ON_ERROR));
    }
}
