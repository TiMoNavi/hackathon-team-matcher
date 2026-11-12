<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

final class GroupState
{
    public function __construct(public readonly int $conversationId, public readonly int $ownerId, public readonly string $title, public readonly int $version, public readonly int $lastSeq, public readonly int $activeMemberCount, public readonly string $status = 'active')
    {
        SafeInteger::positive($conversationId, 'conversation_id'); SafeInteger::positive($ownerId, 'owner_id');
        SafeInteger::positive($version, 'version'); SafeInteger::nonNegative($lastSeq, 'last_seq'); SafeInteger::positive($activeMemberCount, 'active_member_count');
        GroupCommand::title($title);
        if ($status !== 'active') { throw new ChatException('INVALID_GROUP', 'The group projection is invalid.', 503); }
    }

    public function withMembershipCount(int $count): self
    {
        return new self($this->conversationId, $this->ownerId, $this->title, SafeInteger::positive($this->version + 1, 'version'), $this->lastSeq, $count, $this->status);
    }

    public function dto(): array
    {
        return ['conversation_id' => $this->conversationId, 'type' => 'group', 'title' => $this->title, 'owner_id' => $this->ownerId, 'version' => $this->version, 'active_member_count' => $this->activeMemberCount];
    }
}
