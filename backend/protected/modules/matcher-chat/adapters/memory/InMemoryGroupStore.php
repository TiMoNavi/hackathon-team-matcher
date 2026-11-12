<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\memory;

use humhub\modules\matcherChat\domain\{ChatException, GroupInvitation, GroupMembership, GroupReceipt, GroupState, SafeInteger};
use humhub\modules\matcherChat\domain\ports\{Clock, GroupAuthority, GroupRepository};

/** Synthetic only. Native facts are test doubles; no database, messages or HTTP. */
final class InMemoryGroupStore implements GroupRepository, GroupAuthority, Clock
{
    private array $groups = [];
    private array $memberships = [];
    private array $nativeMembers = [];
    private array $invitations = [];
    private array $receipts = [];
    private int $nextGroup = 1;
    private int $nextInvitation = 1;
    private bool $inside = false;
    private array $hooks = [];
    private array $accounts = [];
    private array $friendships = [];
    private array $blocks = [];
    private array $disabledGroups = [];
    private array $nativeOverrides = [];
    private array $ownerOverrides = [];
    public array $calls = [];
    public int $time = 1794528000;

    public function now(): int { return $this->time; }
    public function setAccount(int $userId, bool $enabled): void { SafeInteger::positive($userId, 'user_id'); $this->accounts[$userId] = $enabled; }
    /** Each direction is explicit so tests cannot mistake a one-sided friendship for a pair. */
    public function setFriendship(int $from, int $to, bool $active): void { $this->friendships[$from][$to] = $active; }
    public function setBlock(int $from, int $to, bool $blocked): void { $this->blocks[$from][$to] = $blocked; }
    public function setGroupEnabled(int $conversationId, bool $enabled): void { $this->disabledGroups[$conversationId] = !$enabled; }
    /** External revocation survives rollback of this command's own native-member writes. */
    public function overrideNativeMember(int $conversationId, int $userId, bool $active): void { $this->nativeOverrides[$conversationId][$userId] = $active; }
    public function overrideOwner(int $conversationId, int $ownerId): void { $this->ownerOverrides[$conversationId] = $ownerId; }
    public function setLastSeq(int $conversationId, int $seq): void
    {
        $group = $this->groups[$conversationId] ?? throw new \LogicException('Missing synthetic group.');
        $this->groups[$conversationId] = new GroupState($conversationId, $group->ownerId, $group->title, $group->version, $seq, $group->activeMemberCount);
    }
    public function onNext(string $stage, callable $hook): void { $this->hooks[$stage] = $hook; }
    public function snapshot(): array { return [$this->groups, $this->memberships, $this->nativeMembers, $this->invitations, $this->receipts, $this->nextGroup, $this->nextInvitation]; }

    public function run(callable $operation): mixed
    {
        if ($this->inside) { throw new \LogicException('Nested synthetic group transactions are unsupported.'); }
        $snapshot = $this->snapshot(); $this->inside = true;
        try { return $operation(); }
        catch (\Throwable $error) { [$this->groups, $this->memberships, $this->nativeMembers, $this->invitations, $this->receipts, $this->nextGroup, $this->nextInvitation] = $snapshot; throw $error; }
        finally { $this->inside = false; }
    }

    public function activeAccount(int $userId): bool { $result = $this->accounts[$userId] ?? false; $this->fire('activeAccount'); return $result; }
    public function activeGroup(int $conversationId): bool { $result = isset($this->groups[$conversationId]) && !($this->disabledGroups[$conversationId] ?? false); $this->fire('activeGroup'); return $result; }
    public function nativeMember(int $conversationId, int $userId): bool { $result = $this->nativeOverrides[$conversationId][$userId] ?? $this->nativeMembers[$conversationId][$userId] ?? false; $this->fire('nativeMember'); return $result; }
    public function nativeOwner(int $conversationId, int $userId): bool { $result = ($this->ownerOverrides[$conversationId] ?? ($this->groups[$conversationId] ?? null)?->ownerId) === $userId; $this->fire('nativeOwner'); return $result; }
    public function friendsUnblocked(int $firstUserId, int $secondUserId): bool
    {
        $result = ($this->accounts[$firstUserId] ?? false) && ($this->accounts[$secondUserId] ?? false)
            && ($this->friendships[$firstUserId][$secondUserId] ?? false) && ($this->friendships[$secondUserId][$firstUserId] ?? false)
            && !($this->blocks[$firstUserId][$secondUserId] ?? false) && !($this->blocks[$secondUserId][$firstUserId] ?? false);
        $this->fire('friendsUnblocked'); return $result;
    }

    public function create(int $ownerId, string $title): GroupState
    {
        $this->writing(); $id = $this->nextGroup++;
        $group = new GroupState($id, $ownerId, $title, 1, 0, 1);
        $this->groups[$id] = $group;
        $this->memberships[$id][$ownerId][1] = new GroupMembership($id, $ownerId, 1, 0, 'active', 1);
        $this->nativeMembers[$id][$ownerId] = true;
        $this->fire('create'); return $group;
    }
    public function group(int $conversationId): ?GroupState { $result = $this->groups[$conversationId] ?? null; $this->fire('group'); return $result; }
    public function latestMembership(int $conversationId, int $userId): ?GroupMembership
    {
        $history = $this->memberships[$conversationId][$userId] ?? [];
        $result = $history === [] ? null : $history[max(array_keys($history))];
        $this->fire('latestMembership'); return $result;
    }
    public function activeMembership(int $conversationId, int $userId): ?GroupMembership
    {
        $member = $this->latestMembership($conversationId, $userId); return $member?->status === 'active' ? $member : null;
    }
    public function join(GroupState $group, GroupMembership $membership): void
    {
        $this->writing(); $previous = $this->groups[$group->conversationId] ?? null;
        $prior = $this->latestMembership($group->conversationId, $membership->userId);
        if ($previous === null || $membership->conversationId !== $group->conversationId || $membership->status !== 'active' || $prior?->status === 'active'
            || $membership->generation !== ($prior?->generation ?? 0) + 1 || $membership->version !== ($prior?->version ?? 0) + 1
            || $membership->joinSeq !== $previous->lastSeq || $group != $previous->withMembershipCount($previous->activeMemberCount + 1)) { throw new \LogicException('Invalid synthetic join.'); }
        $this->groups[$group->conversationId] = $group;
        $this->memberships[$group->conversationId][$membership->userId][$membership->generation] = $membership;
        $this->nativeMembers[$group->conversationId][$membership->userId] = true;
        $this->fire('join');
    }
    public function leave(GroupState $group, GroupMembership $membership): void
    {
        $this->writing(); $previous = $this->groups[$group->conversationId] ?? null;
        $prior = $this->latestMembership($group->conversationId, $membership->userId);
        if ($previous === null || $prior?->status !== 'active' || $membership != $prior->left()
            || $previous->ownerId === $membership->userId || $group != $previous->withMembershipCount($previous->activeMemberCount - 1)) { throw new \LogicException('Invalid synthetic leave.'); }
        $this->groups[$group->conversationId] = $group;
        $this->memberships[$group->conversationId][$membership->userId][$membership->generation] = $membership;
        $this->nativeMembers[$group->conversationId][$membership->userId] = false;
        $this->fire('leave');
    }
    public function invitation(int $invitationId): ?GroupInvitation { $result = $this->invitations[$invitationId] ?? null; $this->fire('invitation'); return $result; }
    public function pendingInvitations(int $conversationId): array
    {
        $result = array_values(array_filter($this->invitations, static fn (GroupInvitation $i): bool => $i->conversationId === $conversationId && $i->status === 'pending'));
        $this->fire('pendingInvitations'); return $result;
    }
    public function insertInvitation(int $conversationId, int $inviterId, int $inviteeId, string $createdAt, string $expiresAt): GroupInvitation
    {
        $this->writing();
        foreach ($this->invitations as $prior) {
            if ($prior->conversationId === $conversationId && $prior->inviteeId === $inviteeId && $prior->status === 'pending') { throw new \LogicException('Duplicate synthetic pending invitation.'); }
        }
        $invitation = new GroupInvitation($this->nextInvitation++, $conversationId, $inviterId, $inviteeId, 'pending', 1, $createdAt, $expiresAt, null);
        $this->invitations[$invitation->id] = $invitation; $this->fire('insertInvitation'); return $invitation;
    }
    public function saveInvitation(GroupInvitation $invitation): void
    {
        $this->writing(); $prior = $this->invitations[$invitation->id] ?? null;
        if ($prior === null || $prior->status !== 'pending' || $invitation != $prior->transition($invitation->status, $invitation->resolvedAt ?? '')) { throw new \LogicException('Invalid synthetic invitation transition.'); }
        $this->invitations[$invitation->id] = $invitation; $this->fire('saveInvitation');
    }
    public function receipt(int $actorId, string $operation, string $clientCommandId): ?GroupReceipt
    {
        $result = $this->receipts[$actorId][$operation][$clientCommandId] ?? null; $this->fire('receipt'); return $result;
    }
    public function remember(GroupReceipt $receipt): void
    {
        $this->writing();
        if (isset($this->receipts[$receipt->actorId][$receipt->operation][$receipt->clientCommandId])) { throw new \LogicException('Duplicate synthetic command receipt.'); }
        $this->receipts[$receipt->actorId][$receipt->operation][$receipt->clientCommandId] = $receipt; $this->fire('remember');
    }
    private function writing(): void { if (!$this->inside) { throw new \LogicException('Group mutation requires a consistency boundary.'); } }
    private function fire(string $stage): void
    {
        $this->calls[$stage] = ($this->calls[$stage] ?? 0) + 1;
        if (isset($this->hooks[$stage])) { $hook = $this->hooks[$stage]; unset($this->hooks[$stage]); $hook($this); }
    }
}
