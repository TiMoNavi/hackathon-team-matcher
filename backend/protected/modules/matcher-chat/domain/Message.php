<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

/** Safe text from the native adapter; no native HTML or attachment URLs. */
final class Message
{
    public function __construct(public readonly int $id, public readonly int $conversationId, public readonly int $seq, public readonly ?int $senderId, public readonly string $kind, public readonly ?string $body, public readonly string $createdAt)
    {
        SafeInteger::positive($id, 'message_id');
        SafeInteger::positive($conversationId, 'conversation_id');
        SafeInteger::positive($seq, 'seq');
        if ($senderId !== null) { SafeInteger::positive($senderId, 'sender_id'); }
        if (!in_array($kind, ['text', 'system', 'deleted'], true) || ($kind === 'deleted' ? $body !== null : ($body === null || trim($body) === '' || !preg_match('//u', $body)))) {
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
        return $this->summary($sender) + ['conversation_id' => $this->conversationId, 'attachments' => []];
    }
}
