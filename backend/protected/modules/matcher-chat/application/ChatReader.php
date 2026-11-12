<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\application;

use humhub\modules\matcherChat\domain\{AccessGrant, ChatException, Conversation, Message, PageRequest, SafeInteger};
use humhub\modules\matcherChat\domain\ports\{AccessReader, ConsistencyBoundary, CursorCodec, ReadRepository};

/** C04-P application kernel. No session, database, routes or sending capabilities. */
final class ChatReader
{
    public function __construct(private readonly AccessReader $access, private readonly ReadRepository $repository, private readonly CursorCodec $cursors, private readonly ConsistencyBoundary $boundary) {}

    public function conversations(int $viewerId, PageRequest $page, string $requestId): array
    {
        $this->validateRequest($viewerId, $requestId);
        if ($page->afterSeq !== null) { throw new ChatException('INVALID_ARGUMENT', 'Conversation lists do not accept after_seq.'); }
        return $this->boundary->run(function () use ($viewerId, $page, $requestId): array {
            $revision = $this->revision($viewerId);
            $scope = ['resource' => 'conversations', 'viewer_id' => $viewerId, 'authorization_revision' => $revision, 'limit' => $page->limit, 'order' => 'id_desc'];
            $before = $page->cursor === null ? null : $this->cursors->read($page->cursor, $scope);
            $ids = $this->access->visibleIds($viewerId, $before, $page->limit + 1);
            if (!array_is_list($ids) || count($ids) > $page->limit + 1) { $this->invalidRepository(); }
            $previous = $before;
            foreach ($ids as $id) {
                SafeInteger::positive($id, 'conversation_id');
                if ($previous !== null && $id >= $previous) { $this->invalidRepository(); }
                $previous = $id;
            }
            $hasMore = count($ids) > $page->limit;
            $items = [];
            $authorities = [];
            foreach (array_slice($ids, 0, $page->limit) as $id) {
                [$conversation, $grant] = $this->authorized($viewerId, $id);
                $last = $this->messagesInRange($id, $grant->joinSeq, null, 1, true);
                $read = $this->currentReadSeq($viewerId, $id, $grant);
                $items[] = ['id' => $id, 'type' => $conversation->type, 'title' => $conversation->title, 'version' => $conversation->version, 'last_message' => $last === [] ? null : $last[0]->summary($this->access->sender($viewerId, $id, $last[0]->senderId)), 'unread_count' => $this->unread($viewerId, $id, $read), 'permissions' => $grant->permissions()] + $conversation->activityFields();
                $authorities[] = [$conversation, $grant];
            }
            // Native membership is checked even if an adapter forgot to bump a version.
            foreach ($authorities as [$conversation, $grant]) { $this->assertCurrent($viewerId, $conversation, $grant, $revision); }
            $this->assertRevision($viewerId, $revision);
            $cursor = $hasMore ? $this->cursors->issue($scope, $items[count($items) - 1]['id']) : null;
            return $this->envelope(['items' => $items, 'next_cursor' => $cursor, 'has_more' => $hasMore, 'authorization_revision' => $revision], $requestId);
        });
    }

    public function messages(int $viewerId, int $conversationId, PageRequest $page, string $requestId): array
    {
        $this->validateRequest($viewerId, $requestId);
        SafeInteger::positive($conversationId, 'conversation_id');
        return $this->boundary->run(function () use ($viewerId, $conversationId, $page, $requestId): array {
            $revision = $this->revision($viewerId);
            [$conversation, $grant] = $this->authorized($viewerId, $conversationId);
            $scope = $this->messageScope($viewerId, $conversation, $grant, $revision, $page->limit);
            $before = $page->cursor === null ? null : $this->cursors->read($page->cursor, $scope);
            $increment = $page->afterSeq !== null;
            $after = max($grant->joinSeq, $page->afterSeq ?? 0);
            $messages = $this->messagesInRange($conversationId, $after, $before, $page->limit + 1, !$increment);
            $hasMore = count($messages) > $page->limit;
            $messages = array_slice($messages, 0, $page->limit);
            if (!$increment) { $messages = array_reverse($messages); }
            $items = [];
            foreach ($messages as $message) {
                $items[] = $message->dto($this->access->sender($viewerId, $conversationId, $message->senderId));
            }
            $read = $this->currentReadSeq($viewerId, $conversationId, $grant);
            $unread = $this->unread($viewerId, $conversationId, $read);
            $this->assertCurrent($viewerId, $conversation, $grant, $revision);
            // Forward polling keeps using after_seq; this cursor is exclusively older history.
            $next = !$increment && $hasMore ? $this->cursors->issue($scope, $messages[0]->seq) : null;
            return $this->envelope(['items' => $items, 'next_cursor' => $next, 'has_more' => $hasMore, 'read_seq' => $read, 'unread_count' => $unread, 'context' => $grant->context($conversation, $revision)], $requestId);
        });
    }

    public function markRead(int $viewerId, int $conversationId, mixed $requestedSeq, string $requestId): array
    {
        $this->validateRequest($viewerId, $requestId);
        SafeInteger::positive($conversationId, 'conversation_id');
        $requestedSeq = SafeInteger::nonNegative($requestedSeq, 'read_seq');
        return $this->boundary->run(function () use ($viewerId, $conversationId, $requestedSeq, $requestId): array {
            $revision = $this->revision($viewerId);
            [$conversation, $grant] = $this->authorized($viewerId, $conversationId);
            // Zero and the generation's join boundary are no-op baselines, not messages.
            if ($requestedSeq !== 0 && $requestedSeq !== $grant->joinSeq) {
                $message = $this->repository->messageAt($conversationId, $requestedSeq);
                if ($requestedSeq <= $grant->joinSeq || $message === null || $message->conversationId !== $conversationId || $message->seq !== $requestedSeq) {
                    throw new ChatException('INVALID_READ_POSITION', 'The read position is not an authorized existing message.');
                }
            }
            $current = $this->currentReadSeq($viewerId, $conversationId, $grant);
            $target = max($current, $requestedSeq);
            $this->assertCurrent($viewerId, $conversation, $grant, $revision);
            $read = SafeInteger::nonNegative($this->repository->advanceReadSeq($viewerId, $conversationId, $grant->generation, $target), 'read_seq');
            if ($read < $target) { $this->invalidRepository(); }
            $this->assertStoredReadPosition($conversationId, $grant, $read);
            $unread = $this->unread($viewerId, $conversationId, $read);
            $this->assertCurrent($viewerId, $conversation, $grant, $revision);
            return $this->envelope(['conversation_id' => $conversationId, 'read_seq' => $read, 'unread_count' => $unread, 'context' => $grant->context($conversation, $revision)], $requestId);
        });
    }

    private function authorized(int $viewerId, int $conversationId): array
    {
        $grant = $this->access->grant($viewerId, $conversationId);
        if ($grant === null || $grant->viewerId !== $viewerId || $grant->conversationId !== $conversationId || !$grant->canRead()) { throw ChatException::unavailable(); }
        $conversation = $this->repository->conversation($conversationId);
        if ($conversation === null || !$grant->matches($conversation)) { throw ChatException::unavailable(); }
        return [$conversation, $grant];
    }

    private function assertCurrent(int $viewerId, Conversation $conversation, AccessGrant $grant, int $revision): void
    {
        [$currentConversation, $currentGrant] = $this->authorized($viewerId, $conversation->id);
        if ($currentConversation != $conversation || $currentGrant != $grant) {
            throw new ChatException('AUTHORIZATION_CHANGED', 'The conversation authority changed.', 409);
        }
        $this->assertRevision($viewerId, $revision);
    }

    private function revision(int $viewerId): int { return SafeInteger::positive($this->access->revision($viewerId), 'authorization_revision'); }

    private function assertRevision(int $viewerId, int $revision): void
    {
        if ($this->revision($viewerId) !== $revision) { throw new ChatException('AUTHORIZATION_CHANGED', 'The read authority changed.', 409); }
    }

    private function currentReadSeq(int $viewerId, int $conversationId, AccessGrant $grant): int
    {
        $read = max($grant->joinSeq, SafeInteger::nonNegative($this->repository->readSeq($viewerId, $conversationId, $grant->generation), 'read_seq'));
        $this->assertStoredReadPosition($conversationId, $grant, $read);
        return $read;
    }

    private function assertStoredReadPosition(int $conversationId, AccessGrant $grant, int $read): void
    {
        if ($read === 0 || $read === $grant->joinSeq) { return; }
        $message = $this->repository->messageAt($conversationId, $read);
        if ($read < $grant->joinSeq || $message === null || $message->conversationId !== $conversationId || $message->seq !== $read) { $this->invalidRepository(); }
    }

    private function unread(int $viewerId, int $conversationId, int $read): int
    {
        return SafeInteger::nonNegative($this->repository->unreadCount($viewerId, $conversationId, $read), 'unread_count');
    }

    private function messagesInRange(int $conversationId, int $after, ?int $before, int $limit, bool $newestFirst): array
    {
        $messages = $this->repository->messages($conversationId, $after, $before, $limit, $newestFirst);
        if (!array_is_list($messages) || count($messages) > $limit) { $this->invalidRepository(); }
        $previous = null;
        $ids = [];
        foreach ($messages as $message) {
            if (!$message instanceof Message || $message->conversationId !== $conversationId || $message->seq <= $after || ($before !== null && $message->seq >= $before) || isset($ids[$message->id]) || ($previous !== null && ($newestFirst ? $message->seq >= $previous : $message->seq <= $previous))) { $this->invalidRepository(); }
            $previous = $message->seq;
            $ids[$message->id] = true;
        }
        return $messages;
    }

    private function messageScope(int $viewerId, Conversation $conversation, AccessGrant $grant, int $revision, int $limit): array
    {
        return ['resource' => 'messages', 'viewer_id' => $viewerId, 'authorization_revision' => $revision, 'conversation_id' => $conversation->id, 'authorization_version' => $grant->authorizationVersion, 'membership_generation' => $grant->generation, 'history_after_seq' => $grant->joinSeq, 'type' => $conversation->type, 'space_id' => $conversation->spaceId, 'idea_activity_id' => $conversation->ideaActivityId, 'limit' => $limit, 'order' => 'seq_asc_older'];
    }

    private function validateRequest(int $viewerId, string $requestId): void
    {
        SafeInteger::positive($viewerId, 'viewer_id');
        if ($requestId === '' || strlen($requestId) > 128 || !preg_match('/^[A-Za-z0-9_.:-]+$/D', $requestId)) { throw new ChatException('INVALID_ARGUMENT', 'The request id is invalid.'); }
    }

    private function envelope(array $data, string $requestId): array { return ['data' => $data, 'meta' => ['request_id' => $requestId]]; }
    private function invalidRepository(): never { throw new ChatException('INVALID_READ_PROJECTION', 'The read adapter returned an invalid projection.', 503); }
}
