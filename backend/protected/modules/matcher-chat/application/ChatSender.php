<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\application;

use humhub\modules\matcherChat\domain\{AccessGrant, ChatException, Conversation, Message, SafeInteger, SendText};
use humhub\modules\matcherChat\domain\ports\{AccessReader, ConsistencyBoundary, ReadRepository, SendRepository};

/** Explicit send command; no notifications, relationship creation or implicit reads. */
final class ChatSender
{
    public function __construct(private readonly AccessReader $access, private readonly ReadRepository $reads,
        private readonly SendRepository $writes, private readonly ConsistencyBoundary $boundary) {}

    public function send(int $viewerId, int $conversationId, SendText $text, string $requestId): array
    {
        SafeInteger::positive($viewerId, 'viewer_id');
        SafeInteger::positive($conversationId, 'conversation_id');
        if (preg_match('/^[A-Za-z0-9_.:-]{1,128}$/D', $requestId) !== 1) { throw new ChatException('INVALID_ARGUMENT', 'Invalid request ID.'); }
        return $this->boundary->run(function () use ($viewerId, $conversationId, $text, $requestId): array {
            [$conversation, $grant, $revision] = $this->authority($viewerId, $conversationId);
            $receipt = $this->writes->receipt($viewerId, $conversationId, $text->clientMessageId);
            if ($receipt !== null) {
                if (!hash_equals($receipt->bodyHash, $text->bodyHash)) { throw new ChatException('IDEMPOTENCY_CONFLICT', 'This message key was already used for different text.', 409); }
                $message = $this->reads->messageAt($conversationId, $receipt->seq);
                if ($message === null || $message->id !== $receipt->entryId) { throw new ChatException('SEND_RECEIPT_UNAVAILABLE', 'The original receipt is unavailable.', 409); }
            } else {
                $this->writes->assertQuota($viewerId);
                $message = $this->writes->append($viewerId, $conversationId, $text);
                if ($message->kind !== ($text->body === '' ? 'attachment' : 'text') || $message->body !== ($text->body === '' ? null : $text->body)
                    || array_map(static fn ($file): string => $file->id, $message->attachments) !== $text->attachmentIds) { throw new ChatException('INVALID_SEND_PROJECTION', 'The persisted message differs from the command.', 503); }
                $this->writes->remember($viewerId, $conversationId, $text, $message);
            }
            if (!$message instanceof Message || $message->conversationId !== $conversationId || ($message->kind !== 'deleted' && $message->senderId !== $viewerId)) {
                throw new ChatException('INVALID_SEND_PROJECTION', 'The message receipt is invalid.', 503);
            }
            $read = SafeInteger::nonNegative($this->reads->readSeq($viewerId, $conversationId, $grant->generation), 'read_seq');
            if ($read !== 0 && $this->reads->messageAt($conversationId, $read) === null) { throw new ChatException('INVALID_SEND_PROJECTION', 'The read position is invalid.', 503); }
            $unread = SafeInteger::nonNegative($this->reads->unreadCount($viewerId, $conversationId, $read), 'unread_count');
            $sender = $this->access->sender($viewerId, $conversationId, $message->senderId);
            if ($this->authority($viewerId, $conversationId) != [$conversation, $grant, $revision]) {
                throw new ChatException('AUTHORIZATION_CHANGED', 'The send authority changed.', 409);
            }
            return ['data' => ['message' => $message->dto($sender), 'client_message_id' => $text->clientMessageId,
                'replayed' => $receipt !== null, 'read_seq' => $read, 'unread_count' => $unread,
                'context' => $grant->context($conversation, $revision)], 'meta' => ['request_id' => $requestId]];
        });
    }

    private function authority(int $viewerId, int $conversationId): array
    {
        $grant = $this->access->grant($viewerId, $conversationId);
        $conversation = $this->reads->conversation($conversationId);
        if (!$grant instanceof AccessGrant || $grant->viewerId !== $viewerId || $grant->conversationId !== $conversationId
            || !$grant->canRead() || !$conversation instanceof Conversation || !$grant->matches($conversation)) { throw ChatException::unavailable(); }
        if ($conversation->type !== 'direct' || !$grant->permissions()['send']) { throw new ChatException('SEND_FORBIDDEN', 'Sending is not currently permitted.', 403); }
        return [$conversation, $grant, SafeInteger::positive($this->access->revision($viewerId), 'authorization_revision')];
    }
}
