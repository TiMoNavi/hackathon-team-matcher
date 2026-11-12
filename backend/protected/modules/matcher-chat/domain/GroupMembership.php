<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

final class GroupMembership
{
    public function __construct(public readonly int $conversationId, public readonly int $userId, public readonly int $generation, public readonly int $joinSeq, public readonly string $status, public readonly int $version)
    {
        SafeInteger::positive($conversationId, 'conversation_id'); SafeInteger::positive($userId, 'user_id'); SafeInteger::positive($generation, 'membership_generation');
        SafeInteger::nonNegative($joinSeq, 'join_seq'); SafeInteger::positive($version, 'membership_version');
        if (!in_array($status, ['active', 'left'], true)) { throw new ChatException('INVALID_GROUP_MEMBERSHIP', 'The group membership projection is invalid.', 503); }
    }

    public function left(): self
    {
        if ($this->status !== 'active') { throw new ChatException('GROUP_MEMBERSHIP_UNAVAILABLE', 'The group membership is unavailable.', 404); }
        return new self($this->conversationId, $this->userId, $this->generation, $this->joinSeq, 'left', SafeInteger::positive($this->version + 1, 'membership_version'));
    }

    public function dto(): array
    {
        return ['conversation_id' => $this->conversationId, 'user_id' => $this->userId, 'generation' => $this->generation, 'join_seq' => $this->joinSeq, 'status' => $this->status, 'version' => $this->version];
    }
}
