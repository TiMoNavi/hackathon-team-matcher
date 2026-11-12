<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

/** Explicit policy input for the offline group-invitation kernel. */
final class GroupPolicy
{
    public function __construct(public readonly int $invitationTtlSeconds, public readonly int $maxActiveMembers, public readonly int $maxPendingInvitations)
    {
        if ($invitationTtlSeconds < 1 || $invitationTtlSeconds > 31536000 || $maxActiveMembers < 2 || $maxActiveMembers > 1000 || $maxPendingInvitations < 1 || $maxPendingInvitations > 1000) {
            throw new ChatException('INVALID_GROUP_POLICY', 'The group policy is invalid.');
        }
    }
}
