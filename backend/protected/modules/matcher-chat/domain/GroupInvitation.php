<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

final class GroupInvitation
{
    public function __construct(public readonly int $id, public readonly int $conversationId, public readonly int $inviterId, public readonly int $inviteeId, public readonly string $status, public readonly int $version, public readonly string $createdAt, public readonly string $expiresAt, public readonly ?string $resolvedAt)
    {
        SafeInteger::positive($id, 'invitation_id'); SafeInteger::positive($conversationId, 'conversation_id'); SafeInteger::positive($inviterId, 'inviter_id'); SafeInteger::positive($inviteeId, 'invitee_id'); SafeInteger::positive($version, 'invitation_version');
        if ($inviterId === $inviteeId || !in_array($status, ['pending', 'accepted', 'declined', 'withdrawn', 'expired'], true)
            || !self::utc($createdAt) || !self::utc($expiresAt) || ($resolvedAt !== null && !self::utc($resolvedAt))
            || $expiresAt <= $createdAt || (($status === 'pending') !== ($resolvedAt === null))
            || ($resolvedAt !== null && ($resolvedAt < $createdAt || ($status === 'expired' ? $resolvedAt < $expiresAt : $resolvedAt >= $expiresAt)))) {
            throw new ChatException('INVALID_GROUP_INVITATION', 'The group invitation projection is invalid.', 503);
        }
    }

    public function transition(string $status, string $at): self
    {
        if ($this->status !== 'pending' || !in_array($status, ['accepted', 'declined', 'withdrawn', 'expired'], true) || !self::utc($at)) {
            throw new ChatException('INVITATION_NOT_PENDING', 'The invitation is no longer pending.', 409);
        }
        return new self($this->id, $this->conversationId, $this->inviterId, $this->inviteeId, $status, SafeInteger::positive($this->version + 1, 'invitation_version'), $this->createdAt, $this->expiresAt, $at);
    }

    public function dto(): array
    {
        return ['id' => $this->id, 'conversation_id' => $this->conversationId, 'inviter_id' => $this->inviterId, 'invitee_id' => $this->inviteeId, 'status' => $this->status, 'version' => $this->version, 'created_at' => $this->createdAt, 'expires_at' => $this->expiresAt, 'resolved_at' => $this->resolvedAt];
    }

    /** Expiry is effective immediately; displaying it does not mutate storage. */
    public function effectiveAt(string $now): self
    {
        return $this->status === 'pending' && $now >= $this->expiresAt ? $this->transition('expired', $this->expiresAt) : $this;
    }

    private static function utc(string $value): bool
    {
        return preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/D', $value) === 1 && strtotime($value) !== false && gmdate('Y-m-d\TH:i:s\Z', strtotime($value)) === $value;
    }
}
