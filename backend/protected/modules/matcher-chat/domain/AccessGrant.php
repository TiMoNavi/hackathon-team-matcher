<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

/** A projection of current authority, never a client-supplied permission token. */
final class AccessGrant
{
    public function __construct(
        public readonly int $viewerId,
        public readonly int $conversationId,
        public readonly string $type,
        public readonly int $authorizationVersion,
        public readonly int $generation,
        public readonly int $joinSeq,
        public readonly bool $nativeMember,
        public readonly string $membershipState,
        public readonly bool $businessReadable,
        public readonly bool $sendAllowed = false,
        public readonly bool $inviteAllowed = false,
        public readonly bool $leaveAllowed = false,
        public readonly ?int $spaceId = null,
        public readonly ?int $ideaActivityId = null,
        public readonly ?array $attachments = null,
    ) {
        SafeInteger::positive($viewerId, 'viewer_id');
        SafeInteger::positive($conversationId, 'conversation_id');
        SafeInteger::positive($authorizationVersion, 'authorization_version');
        SafeInteger::positive($generation, 'membership_generation');
        SafeInteger::nonNegative($joinSeq, 'join_seq');
        Conversation::assertType($type);
        if (!in_array($membershipState, ['active', 'invited', 'left'], true) || ($type === 'direct' && $joinSeq !== 0)) {
            throw new ChatException('INVALID_AUTHORITY', 'The membership authority is invalid.', 503);
        }
        if ($type === 'discussion') {
            SafeInteger::positive($spaceId, 'space_id');
            SafeInteger::positive($ideaActivityId, 'idea_activity_id');
        } elseif ($spaceId !== null || $ideaActivityId !== null) {
            throw new ChatException('INVALID_AUTHORITY', 'The membership context is invalid.', 503);
        }
    }

    public function canRead(): bool
    {
        return $this->nativeMember && $this->membershipState === 'active' && $this->businessReadable;
    }

    public function permissions(): array
    {
        $read = $this->canRead();
        return ['read' => $read, 'send' => $read && $this->sendAllowed, 'invite' => $read && $this->inviteAllowed, 'leave' => $read && $this->leaveAllowed];
    }

    public function matches(Conversation $conversation): bool
    {
        return $conversation->id === $this->conversationId && $conversation->type === $this->type && $conversation->spaceId === $this->spaceId && $conversation->ideaActivityId === $this->ideaActivityId;
    }

    public function context(Conversation $conversation, int $authorizationRevision): array
    {
        SafeInteger::positive($authorizationRevision, 'authorization_revision');
        return ['conversation_id' => $conversation->id, 'type' => $conversation->type, 'version' => $conversation->version, 'authorization_version' => $this->authorizationVersion, 'authorization_revision' => $authorizationRevision, 'membership_generation' => $this->generation, 'history_after_seq' => $this->joinSeq, 'permissions' => $this->permissions()] + $conversation->activityFields() + ($this->attachments === null ? [] : ['attachments' => $this->attachments]);
    }
}
