<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

/** Safe text from the native adapter; no native HTML or attachment URLs. */
final class Message
{
    public function __construct(public readonly int $id, public readonly int $conversationId, public readonly int $seq, public readonly ?int $senderId, public readonly string $kind, public readonly ?string $body, public readonly string $createdAt, public readonly array $attachments = [])
    {
        SafeInteger::positive($id, 'message_id');
        SafeInteger::positive($conversationId, 'conversation_id');
        SafeInteger::positive($seq, 'seq');
        if ($senderId !== null) { SafeInteger::positive($senderId, 'sender_id'); }
        if (!array_is_list($attachments) || count($attachments) > Attachment::MAX_FILES) { throw new ChatException('INVALID_PROJECTION', 'The attachment projection is invalid.', 503); }
        $ids = [];
        foreach ($attachments as $attachment) { if (!$attachment instanceof Attachment || $attachment->conversationId !== $conversationId || in_array($attachment->id, $ids, true)) { throw new ChatException('INVALID_PROJECTION', 'The attachment projection is invalid.', 503); } $ids[] = $attachment->id; }
        if (!in_array($kind, ['text', 'attachment', 'system', 'deleted'], true) || (in_array($kind, ['deleted', 'attachment'], true) ? $body !== null : ($body === null || trim($body) === '' || !preg_match('//u', $body)))
            || ($kind === 'attachment' && $attachments === []) || (in_array($kind, ['system', 'deleted'], true) && $attachments !== [])) {
            throw new ChatException('INVALID_PROJECTION', 'The message projection is invalid.', 503);
        }
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:s\Z', $createdAt, new \DateTimeZone('UTC'));
        if (!$date || $date->format('Y-m-d\TH:i:s\Z') !== $createdAt) {
            throw new ChatException('INVALID_PROJECTION', 'The message timestamp is invalid.', 503);
        }
    }

    public function summary(Sender $sender): array
    {
        $projection = $sender->dto();
        if ($this->kind !== 'deleted' && $projection['status'] === 'available' && $projection['user_id'] !== $this->senderId) {
            throw new ChatException('INVALID_PROJECTION', 'The sender projection does not match the message author.', 503);
        }
        // A tombstone must not resurrect a deleted author projection.
        return ['id' => $this->id, 'seq' => $this->seq, 'kind' => $this->kind, 'sender' => ($this->kind === 'deleted' ? Sender::unavailable() : $sender)->dto(), 'body' => $this->body, 'created_at' => $this->createdAt];
    }

    public function dto(Sender $sender): array
    {
        return $this->summary($sender) + ['conversation_id' => $this->conversationId, 'attachments' => array_map(static fn (Attachment $file): array => $file->dto(), $this->attachments)];
    }
}
