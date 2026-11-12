<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\memory;

use humhub\modules\matcherChat\domain\{AccessGrant, Conversation, Message, SafeInteger, Sender};
use humhub\modules\matcherChat\domain\ports\{AccessReader, ConsistencyBoundary, ReadRepository};

/** Synthetic adapter only. No native connection, durable data or SQL lock claims. */
final class InMemoryChatStore implements AccessReader, ReadRepository, ConsistencyBoundary
{
    private array $conversations = [];
    private array $messages = [];
    private array $messageIds = [];
    private array $grants = [];
    private array $revisions = [];
    private array $senders = [];
    private array $reads = [];
    private array $hooks = [];
    private bool $insideBoundary = false;
    public array $calls = [];

    public function seedConversation(Conversation $conversation): void
    {
        $this->conversations[$conversation->id] = $conversation;
        foreach ($this->grants as $viewerId => $grants) {
            if (isset($grants[$conversation->id])) { $this->touch($viewerId); }
        }
    }

    public function seedMessage(Message $message): void
    {
        if (!isset($this->conversations[$message->conversationId]) || isset($this->messages[$message->conversationId][$message->seq]) || isset($this->messageIds[$message->id])) {
            throw new \LogicException('Synthetic message references and sequence positions must be unique.');
        }
        $this->messages[$message->conversationId][$message->seq] = $message;
        $this->messageIds[$message->id] = true;
    }

    /** false is only for testing a broken native adapter that missed its revision bump. */
    public function seedGrant(AccessGrant $grant, bool $advanceRevision = true): void
    {
        $this->grants[$grant->viewerId][$grant->conversationId] = $grant;
        if ($advanceRevision) { $this->touch($grant->viewerId); }
    }

    public function removeGrant(int $viewerId, int $conversationId, bool $advanceRevision = true): void
    {
        unset($this->grants[$viewerId][$conversationId]);
        if ($advanceRevision) { $this->touch($viewerId); }
    }

    public function seedSender(int $viewerId, int $conversationId, int $senderId, Sender $sender): void
    {
        $dto = $sender->dto();
        if ($dto['status'] === 'available' && $dto['user_id'] !== $senderId) { throw new \LogicException('Sender identity mismatch.'); }
        $this->senders[$viewerId][$conversationId][$senderId] = $sender;
        $this->touch($viewerId);
    }

    /** One-shot synthetic interleavings exercise rechecks; they are not database races. */
    public function onNext(string $operation, callable $hook): void { $this->hooks[$operation] = $hook; }

    public function run(callable $operation): mixed
    {
        if ($this->insideBoundary) { throw new \LogicException('Nested synthetic boundaries are unsupported.'); }
        $reads = $this->reads;
        $this->insideBoundary = true;
        try { return $operation(); }
        catch (\Throwable $error) { $this->reads = $reads; throw $error; }
        finally { $this->insideBoundary = false; }
    }

    public function revision(int $viewerId): int { return $this->revisions[$viewerId] ?? 1; }

    public function visibleIds(int $viewerId, ?int $beforeId, int $limit): array
    {
        $this->bounded($limit);
        $ids = [];
        foreach ($this->grants[$viewerId] ?? [] as $id => $grant) {
            $conversation = $this->conversations[$id] ?? null;
            if ($grant->canRead() && $conversation !== null && $grant->matches($conversation) && ($beforeId === null || $id < $beforeId)) { $ids[] = $id; }
        }
        rsort($ids, SORT_NUMERIC);
        $result = array_slice($ids, 0, $limit);
        $this->fire('visibleIds');
        return $result;
    }

    public function grant(int $viewerId, int $conversationId): ?AccessGrant
    {
        $grant = $this->grants[$viewerId][$conversationId] ?? null;
        $this->fire('grant');
        return $grant;
    }

    public function sender(int $viewerId, int $conversationId, ?int $senderId): Sender
    {
        $result = $senderId === null ? Sender::unavailable() : ($this->senders[$viewerId][$conversationId][$senderId] ?? Sender::unavailable());
        $this->fire('sender');
        return $result;
    }

    public function conversation(int $conversationId): ?Conversation
    {
        $result = $this->conversations[$conversationId] ?? null;
        $this->fire('conversation');
        return $result;
    }

    public function messages(int $conversationId, int $afterSeq, ?int $beforeSeq, int $limit, bool $newestFirst): array
    {
        $this->bounded($limit);
        $messages = array_filter($this->messages[$conversationId] ?? [], static fn (Message $message): bool => $message->seq > $afterSeq && ($beforeSeq === null || $message->seq < $beforeSeq));
        $newestFirst ? krsort($messages, SORT_NUMERIC) : ksort($messages, SORT_NUMERIC);
        $result = array_slice(array_values($messages), 0, $limit);
        $this->fire('messages');
        return $result;
    }

    public function messageAt(int $conversationId, int $seq): ?Message
    {
        $result = $this->messages[$conversationId][$seq] ?? null;
        $this->fire('messageAt');
        return $result;
    }

    public function readSeq(int $viewerId, int $conversationId, int $generation): int
    {
        $result = $this->reads[$viewerId][$conversationId][$generation] ?? 0;
        $this->fire('readSeq');
        return $result;
    }

    public function advanceReadSeq(int $viewerId, int $conversationId, int $generation, int $seq): int
    {
        if (!$this->insideBoundary) { throw new \LogicException('Read-state writes require a consistency boundary.'); }
        SafeInteger::nonNegative($seq, 'read_seq');
        $value = max($seq, $this->reads[$viewerId][$conversationId][$generation] ?? 0);
        $this->reads[$viewerId][$conversationId][$generation] = $value;
        $this->fire('advanceReadSeq');
        return $value;
    }

    public function unreadCount(int $viewerId, int $conversationId, int $afterSeq): int
    {
        $count = 0;
        foreach ($this->messages[$conversationId] ?? [] as $message) {
            if ($message->seq > $afterSeq && $message->kind === 'text' && $message->senderId !== $viewerId) { $count++; }
        }
        $this->fire('unreadCount');
        return $count;
    }

    private function touch(int $viewerId): void
    {
        $this->revisions[$viewerId] = SafeInteger::positive(($this->revisions[$viewerId] ?? 1) + 1, 'authorization_revision');
    }

    private function bounded(int $limit): void
    {
        if ($limit < 1 || $limit > 49) { throw new \LogicException('A synthetic read must be bounded to 49 entries.'); }
    }

    private function fire(string $operation): void
    {
        $this->calls[$operation] = ($this->calls[$operation] ?? 0) + 1;
        if (isset($this->hooks[$operation])) {
            $hook = $this->hooks[$operation];
            unset($this->hooks[$operation]);
            $hook($this);
        }
    }
}
