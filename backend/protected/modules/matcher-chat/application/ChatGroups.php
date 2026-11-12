<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\application;

use humhub\modules\matcherChat\domain\{ChatException, GroupCommand, GroupInvitation, GroupMembership, GroupPolicy, GroupReceipt, GroupState, SafeInteger};
use humhub\modules\matcherChat\domain\ports\{Clock, GroupAuthority, GroupRepository};

/** Offline kernel. A production repository must lock native authority and writes together. */
final class ChatGroups
{
    public function __construct(private readonly GroupRepository $store, private readonly GroupAuthority $authority,
        private readonly Clock $clock, private readonly GroupPolicy $policy) {}

    public function create(int $actor, GroupCommand $command, string $requestId): array
    {
        return $this->command($actor, null, $command, 'create', $requestId, function () use ($actor, $command): array {
            $group = $this->store->create($actor, $command->title);
            if ($group->ownerId !== $actor || $group->title !== $command->title || $group->version !== 1 || $group->lastSeq !== 0 || $group->activeMemberCount !== 1) { $this->invalid(); }
            $member = new GroupMembership($group->conversationId, $actor, 1, 0, 'active', 1);
            $guard = function () use ($actor, $group, $member): void {
                if ($this->owner($actor, $group->conversationId) != $group || $this->member($group->conversationId, $actor) != $member) { $this->changed(); }
            };
            return [$group->conversationId, null, $guard];
        });
    }

    public function invite(int $actor, int $conversationId, GroupCommand $command, string $requestId): array
    {
        return $this->command($actor, $conversationId, $command, 'invite', $requestId, function () use ($actor, $conversationId, $command): array {
            $group = $this->owner($actor, $conversationId);
            $target = $command->targetUserId;
            $this->eligible($group, $target);
            $priorMember = $this->member($conversationId, $target);
            if ($priorMember?->status === 'active') { throw new ChatException('GROUP_ALREADY_MEMBER', 'The target is already a member.', 409); }
            $count = 0; $now = $this->now();
            foreach ($this->store->pendingInvitations($conversationId) as $pending) {
                if (!$pending instanceof GroupInvitation || $pending->conversationId !== $conversationId || $pending->status !== 'pending') { $this->invalid(); }
                $effective = $pending->effectiveAt($now);
                if ($effective->status === 'expired') { $this->store->saveInvitation($effective); continue; }
                ++$count;
                if ($pending->inviteeId === $target) { throw new ChatException('GROUP_INVITATION_PENDING', 'An invitation is already pending.', 409); }
            }
            if ($count >= $this->policy->maxPendingInvitations) { throw new ChatException('GROUP_PENDING_LIMIT', 'The pending invitation limit is reached.', 409); }
            if ($group->activeMemberCount >= $this->policy->maxActiveMembers) { throw new ChatException('GROUP_MEMBER_LIMIT', 'The member limit is reached.', 409); }
            $expires = gmdate('Y-m-d\TH:i:s\Z', strtotime($now) + $this->policy->invitationTtlSeconds);
            $invitation = $this->store->insertInvitation($conversationId, $actor, $target, $now, $expires);
            if ($invitation->conversationId !== $conversationId || $invitation->inviterId !== $actor || $invitation->inviteeId !== $target
                || $invitation->status !== 'pending' || $invitation->version !== 1 || $invitation->createdAt !== $now || $invitation->expiresAt !== $expires) { $this->invalid(); }
            $guard = function () use ($actor, $group, $target, $priorMember, $invitation): void {
                if ($this->owner($actor, $group->conversationId) != $group || $this->member($group->conversationId, $target) != $priorMember
                    || $this->store->invitation($invitation->id) != $invitation) { $this->changed(); }
                $this->eligible($group, $target);
                if ($this->now() >= $invitation->expiresAt) { throw new ChatException('INVITATION_EXPIRED', 'The invitation has expired.', 409); }
            };
            return [$conversationId, $invitation->id, $guard];
        });
    }

    public function accept(int $actor, int $invitationId, GroupCommand $command, string $requestId): array { return $this->decide($actor, $invitationId, $command, 'accept', $requestId); }
    public function decline(int $actor, int $invitationId, GroupCommand $command, string $requestId): array { return $this->decide($actor, $invitationId, $command, 'decline', $requestId); }
    public function withdraw(int $actor, int $invitationId, GroupCommand $command, string $requestId): array { return $this->decide($actor, $invitationId, $command, 'withdraw', $requestId); }

    private function decide(int $actor, int $id, GroupCommand $command, string $operation, string $requestId): array
    {
        return $this->command($actor, $id, $command, $operation, $requestId, function () use ($actor, $id, $command, $operation): array {
            $invitation = $this->visibleInvitation($actor, $id);
            if (($operation === 'withdraw' ? $invitation->inviterId : $invitation->inviteeId) !== $actor) { throw ChatException::unavailable(); }
            $group = $this->available($invitation->conversationId);
            if ($invitation->inviterId !== $group->ownerId) { $this->invalid(); }
            if ($operation === 'withdraw') { $this->owner($actor, $group->conversationId); }
            $now = $this->now();
            if ($invitation->effectiveAt($now)->status === 'expired') { throw new ChatException('INVITATION_EXPIRED', 'The invitation has expired.', 409); }
            if ($invitation->version !== $command->expectedVersion) { throw new ChatException('VERSION_CONFLICT', 'Reload the current invitation version.', 409); }
            if ($invitation->status !== 'pending') { throw new ChatException('INVITATION_NOT_PENDING', 'The invitation is no longer pending.', 409); }
            $member = $this->member($group->conversationId, $invitation->inviteeId);
            if ($member?->status === 'active') { throw new ChatException('GROUP_ALREADY_MEMBER', 'The invitee is already a member.', 409); }
            if ($operation === 'accept') {
                $this->eligible($group, $actor);
                if ($group->activeMemberCount >= $this->policy->maxActiveMembers) { throw new ChatException('GROUP_MEMBER_LIMIT', 'The member limit is reached.', 409); }
                $member = new GroupMembership($group->conversationId, $actor, SafeInteger::positive(($member?->generation ?? 0) + 1, 'generation'),
                    $group->lastSeq, 'active', SafeInteger::positive(($member?->version ?? 0) + 1, 'membership_version'));
                $group = $group->withMembershipCount($group->activeMemberCount + 1);
                $this->store->join($group, $member);
            }
            $resolved = $invitation->transition(['accept' => 'accepted', 'decline' => 'declined', 'withdraw' => 'withdrawn'][$operation], $now);
            $this->store->saveInvitation($resolved);
            $guard = function () use ($actor, $operation, $group, $member, $resolved): void {
                if ($this->available($group->conversationId) != $group || $this->store->invitation($resolved->id) != $resolved
                    || $this->member($group->conversationId, $resolved->inviteeId) != $member) { $this->changed(); }
                if ($operation === 'accept') { $this->eligible($group, $actor); }
                if ($operation === 'withdraw') { $this->owner($actor, $group->conversationId); }
                if ($this->now() >= $resolved->expiresAt) { throw new ChatException('INVITATION_EXPIRED', 'The invitation has expired.', 409); }
            };
            return [$group->conversationId, $id, $guard];
        });
    }

    public function leave(int $actor, int $conversationId, GroupCommand $command, string $requestId): array
    {
        return $this->command($actor, $conversationId, $command, 'leave', $requestId, function () use ($actor, $conversationId, $command): array {
            $group = $this->available($conversationId);
            $member = $this->member($conversationId, $actor);
            if ($member?->status !== 'active') { throw ChatException::unavailable(); }
            if ($group->ownerId === $actor) { throw new ChatException('GROUP_OWNER_CANNOT_LEAVE', 'Ownership transfer or dissolution is required before leaving.', 409); }
            if ($member->version !== $command->expectedVersion) { throw new ChatException('VERSION_CONFLICT', 'Reload the current membership version.', 409); }
            $left = $member->left(); $group = $group->withMembershipCount($group->activeMemberCount - 1);
            $this->store->leave($group, $left);
            $guard = function () use ($actor, $group, $left): void {
                if ($this->available($group->conversationId) != $group || $this->member($group->conversationId, $actor) != $left) { $this->changed(); }
            };
            return [$conversationId, null, $guard];
        });
    }

    /** Only either party. Expired pending is projected at expires_at, without a write. */
    public function invitation(int $actor, int $invitationId, string $requestId): array
    {
        $this->arguments($actor, $invitationId, $requestId);
        return $this->store->run(function () use ($actor, $invitationId, $requestId): array {
            $this->account($actor);
            $invitation = $this->visibleInvitation($actor, $invitationId);
            return $this->project($actor, $invitation->conversationId, $invitationId, false, $requestId);
        });
    }

    private function command(int $actor, ?int $targetId, GroupCommand $command, string $operation, string $requestId, callable $mutate): array
    {
        $this->arguments($actor, $targetId, $requestId);
        if ($command->operation !== $operation) { throw new ChatException('INVALID_GROUP_COMMAND', 'The command does not match the operation.'); }
        return $this->store->run(function () use ($actor, $targetId, $command, $operation, $requestId, $mutate): array {
            $this->account($actor);
            $receipt = $this->store->receipt($actor, $operation, $command->clientCommandId);
            if ($receipt !== null) {
                if ($receipt->actorId !== $actor || $receipt->operation !== $operation || $receipt->clientCommandId !== $command->clientCommandId) { $this->invalid(); }
                if (!hash_equals($receipt->payloadHash, $command->hash($targetId))) { throw new ChatException('IDEMPOTENCY_CONFLICT', 'This command key is bound to another payload.', 409); }
                if (in_array($operation, ['invite', 'leave'], true) && $receipt->conversationId !== $targetId
                    || in_array($operation, ['accept', 'decline', 'withdraw'], true) && $receipt->invitationId !== $targetId
                    || $operation === 'create' && $this->available($receipt->conversationId)->ownerId !== $actor) { $this->invalid(); }
                $result = $this->project($actor, $receipt->conversationId, $receipt->invitationId, true, $requestId);
                $invitation = $result['data']['invitation'];
                // The hash binds the original request, but an adapter can still
                // return a receipt pointing at a different object in that group.
                if ($operation === 'invite' && ($invitation === null || $invitation['inviter_id'] !== $actor
                    || $invitation['invitee_id'] !== $command->targetUserId)) { $this->invalid(); }
                if (in_array($operation, ['accept', 'decline', 'withdraw'], true)) {
                    $status = ['accept' => 'accepted', 'decline' => 'declined', 'withdraw' => 'withdrawn'][$operation];
                    if ($invitation === null || $invitation['id'] !== $targetId || $invitation['status'] !== $status
                        || $invitation['version'] !== $command->expectedVersion + 1
                        || $invitation[$operation === 'withdraw' ? 'inviter_id' : 'invitee_id'] !== $actor) { $this->invalid(); }
                }
                // Current membership may be left, or a later active generation.
                // Neither create nor leave replays reapply the historical action.
                return $result;
            }
            [$conversationId, $invitationId, $guard] = $mutate();
            $this->store->remember(new GroupReceipt($actor, $operation, $command->clientCommandId, $command->hash($targetId), $conversationId, $invitationId));
            $guard();
            $result = $this->project($actor, $conversationId, $invitationId, false, $requestId);
            $guard(); $this->account($actor);
            return $result;
        });
    }

    private function project(int $actor, int $conversationId, ?int $invitationId, bool $replayed, string $requestId): array
    {
        $before = $this->projectionState($actor, $conversationId, $invitationId);
        $after = $this->projectionState($actor, $conversationId, $invitationId);
        if ($before != $after) { $this->changed(); }
        [$group, $member, $invitation] = $after;
        if ($member === null && $invitation === null) { throw ChatException::unavailable(); }
        return ['data' => ['group' => $member?->status === 'active' ? $group->dto() : null, 'invitation' => $invitation?->dto(),
            'membership' => $member?->dto(), 'replayed' => $replayed], 'meta' => ['request_id' => $requestId]];
    }

    private function projectionState(int $actor, int $conversationId, ?int $invitationId): array
    {
        $this->account($actor);
        $group = $this->available($conversationId); $member = $this->member($conversationId, $actor);
        $invitation = $invitationId === null ? null : $this->visibleInvitation($actor, $invitationId)->effectiveAt($this->now());
        if ($invitation !== null && ($invitation->conversationId !== $conversationId || $invitation->inviterId !== $group->ownerId
            || $invitation->status === 'pending' && $invitation->inviteeId === $actor && $member?->status === 'active')) { $this->invalid(); }
        $this->account($actor);
        return [$group, $member, $invitation];
    }

    private function available(int $conversationId): GroupState
    {
        $group = $this->store->group($conversationId);
        if ($group === null || $group->conversationId !== $conversationId || !$this->authority->activeGroup($conversationId)
            || !$this->authority->nativeOwner($conversationId, $group->ownerId) || $this->member($conversationId, $group->ownerId)?->status !== 'active') { throw ChatException::unavailable(); }
        return $group;
    }

    private function member(int $conversationId, int $userId): ?GroupMembership
    {
        $member = $this->store->latestMembership($conversationId, $userId);
        if ($member !== null && ($member->conversationId !== $conversationId || $member->userId !== $userId)) { $this->invalid(); }
        if (($member?->status === 'active') !== $this->authority->nativeMember($conversationId, $userId)) { throw ChatException::unavailable(); }
        return $member;
    }

    private function owner(int $actor, int $conversationId): GroupState
    {
        $this->account($actor); $group = $this->available($conversationId);
        if ($group->ownerId !== $actor) { throw ChatException::unavailable(); }
        return $group;
    }

    private function eligible(GroupState $group, int $target): void
    {
        if ($group->ownerId === $target || !$this->authority->activeAccount($group->ownerId) || !$this->authority->activeAccount($target)
            || !$this->authority->friendsUnblocked($group->ownerId, $target)) { throw new ChatException('GROUP_TARGET_UNAVAILABLE', 'This invitation is currently unavailable.', 403); }
    }

    private function visibleInvitation(int $actor, int $id): GroupInvitation
    {
        $invitation = $this->store->invitation($id);
        if ($invitation === null || $invitation->id !== $id || !in_array($actor, [$invitation->inviterId, $invitation->inviteeId], true)) { throw ChatException::unavailable(); }
        return $invitation;
    }
    private function account(int $actor): void { if (!$this->authority->activeAccount($actor)) { throw new ChatException('ACCOUNT_UNAVAILABLE', 'The current account is unavailable.', 401); } }
    private function arguments(int $actor, ?int $targetId, string $requestId): void
    {
        SafeInteger::positive($actor, 'actor_id'); if ($targetId !== null) { SafeInteger::positive($targetId, 'target_id'); }
        if (preg_match('/^[A-Za-z0-9_.:-]{1,128}$/D', $requestId) !== 1) { throw new ChatException('INVALID_ARGUMENT', 'Invalid request ID.'); }
    }
    private function now(): string
    {
        $now = $this->clock->now();
        if ($now < 0 || $now > 253370764799 - $this->policy->invitationTtlSeconds) { throw new ChatException('INVALID_CLOCK', 'The group clock is unavailable.', 503); }
        return gmdate('Y-m-d\TH:i:s\Z', $now);
    }
    private function changed(): never { throw new ChatException('AUTHORIZATION_CHANGED', 'Group authority or state changed.', 409); }
    private function invalid(): never { throw new ChatException('INVALID_GROUP_PROJECTION', 'The group adapter returned an invalid projection.', 503); }
}
