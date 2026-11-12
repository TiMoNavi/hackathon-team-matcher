<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\persistence;

use humhub\modules\matcherChat\adapters\native\{NativeGroupAuthority, NativeProjection};
use humhub\modules\matcherChat\domain\{ChatException, GroupCommand, GroupInvitation, GroupMembership, GroupReceipt, GroupState, SafeInteger};
use humhub\modules\matcherChat\domain\ports\{Clock, GroupAuthority, GroupRepository};

/** A1 owns empty group lifecycle only. No message entry, file or notification writer. */
final class SqlGroupStore implements GroupRepository, GroupAuthority, Clock
{
    private bool $active = false;
    private array $touched = [];
    private array $invalidate = [];
    private readonly NativeGroupAuthority $native;
    public function __construct(private readonly SqlState $sql, private readonly int $actorId, private readonly bool $configured)
    {
        SafeInteger::positive($actorId, 'actor_id'); $this->native = new NativeGroupAuthority($sql, $configured);
    }
    public function ready(): bool { return $this->sql->groupsReady() && $this->native->ready(); }
    public function run(callable $operation): mixed
    {
        if ($this->active) { throw new \LogicException('Nested group boundary.'); }
        if (!$this->configured || !$this->ready()) { throw new ChatException('CHAT_GROUPS_UNAVAILABLE', 'Group lifecycle is unavailable.', 503); }
        $this->touched = []; $this->invalidate = [];
        try {
            $result = $this->sql->transaction(function () use ($operation): mixed {
                $this->active = true;
                try {
                    $this->gate();
                    $result = $operation();
                    // Rows and absent keys are locked; rechecks also detect writes by
                    // an incorrectly nested adapter before the owned commit.
                    foreach (array_keys($this->touched) as $id) { if ($this->group($id) === null) { throw ChatException::unavailable(); } }
                    $this->gate(); return $result;
                } finally { $this->active = false; }
            });
        } catch (\Throwable $error) { $this->invalidate = []; throw $error; }
        finally { $this->touched = []; }
        foreach (array_keys($this->invalidate) as $id) {
            try { \humhub\modules\mail\models\UserMessage::invalidateNewMessageCountCache($id); } catch (\Throwable) { /* Native cache TTL remains a safety net. */ }
        }
        $this->invalidate = []; return $result;
    }
    public function now(): int
    {
        $this->guard(); return SafeInteger::native($this->sql->one('SELECT UNIX_TIMESTAMP() AS now')['now'] ?? null, 'server_time');
    }
    public function activeAccount(int $userId): bool { $this->guard(); $row = $this->native->account($userId); return $row !== null && (int)$row['status'] === 1; }
    public function friendsUnblocked(int $firstUserId, int $secondUserId): bool { $this->guard(); return $this->native->friendsUnblocked($firstUserId, $secondUserId); }
    public function activeGroup(int $conversationId): bool { return $this->group($conversationId) !== null; }
    public function nativeOwner(int $conversationId, int $userId): bool { return $this->group($conversationId)?->ownerId === $userId; }
    public function nativeMember(int $conversationId, int $userId): bool
    {
        $this->guard();
        $rows = $this->sql->all('SELECT user_id FROM {{%user_message}} WHERE message_id=:message AND user_id=:user FOR UPDATE', [':message' => $conversationId, ':user' => $userId]);
        return count($rows) === 1 && SafeInteger::native($rows[0]['user_id'], 'user_id') === $userId;
    }
    public function group(int $conversationId): ?GroupState
    {
        $this->guard(); SafeInteger::positive($conversationId, 'conversation_id');
        $state = $this->sql->state($conversationId);
        if ($state === null || $state['type'] !== 'group' || $state['status'] !== 'active') { return null; }
        $this->touched[$conversationId] = true;
        if ($state['pair_low'] !== null || $state['pair_high'] !== null || $state['owner_id'] === null || (int)$state['last_seq'] !== 0) { $this->invalid(); }
        $owner = SafeInteger::native($state['owner_id'], 'owner_id');
        $message = $this->sql->nativeMessage($conversationId);
        if ($message === null || SafeInteger::native($message['created_by'], 'native_owner') !== $owner
            || !hash_equals($state['native_projection_hash'], self::messageHash($message))) { throw ChatException::unavailable(); }
        $this->emptyHistory($conversationId);
        $native = $this->sql->all('SELECT user_id,is_originator,created_at,created_by FROM {{%user_message}} WHERE message_id=:id ORDER BY user_id FOR UPDATE', [':id' => $conversationId]);
        $members = $this->sql->all('SELECT * FROM {{%matcher_chat_member}} WHERE message_id=:id AND status=:status ORDER BY user_id,generation LIMIT 1001 FOR UPDATE', [':id' => $conversationId, ':status' => 'active']);
        if ($members === [] || count($members) > 1000 || count($members) !== count($native)
            || !hash_equals($state['native_members_hash'], NativeProjection::membershipHash($native))) { throw ChatException::unavailable(); }
        $seen = [];
        foreach ($members as $index => $row) {
            $member = self::memberRow($row); $user = $member->userId;
            if (isset($seen[$user]) || SafeInteger::native($native[$index]['user_id'], 'native_member') !== $user
                || (int)$native[$index]['is_originator'] !== ($user === $owner ? 1 : 0)
                || $member->joinSeq !== 0 || $this->latestMembership($conversationId, $user) != $member) { throw ChatException::unavailable(); }
            $seen[$user] = true;
        }
        if (!isset($seen[$owner])) { throw ChatException::unavailable(); }
        return new GroupState($conversationId, $owner, GroupCommand::title($message['title']), SafeInteger::native($state['version'], 'version'), 0, count($members));
    }
    public function create(int $ownerId, string $title): GroupState
    {
        $this->actor($ownerId); GroupCommand::title($title); $this->quota('create', 5);
        $time = $this->nativeTime();
        $this->sql->db->createCommand()->insert('{{%message}}', ['title' => $title, 'created_at' => $time, 'created_by' => $ownerId, 'updated_at' => $time, 'updated_by' => $ownerId])->execute();
        $id = SafeInteger::native($this->sql->db->getLastInsertID(), 'conversation_id');
        $this->insertNativeMember($id, $ownerId, true, $time);
        $this->sql->db->createCommand()->insert('{{%matcher_chat_member}}', ['message_id' => $id, 'user_id' => $ownerId, 'generation' => 1, 'join_seq' => 0, 'status' => 'active', 'version' => 1])->execute();
        $message = $this->sql->nativeMessage($id);
        if ($message === null) { $this->invalid(); }
        $this->sql->db->createCommand()->insert('{{%matcher_chat_conversation}}', ['message_id' => $id, 'type' => 'group', 'status' => 'active',
            'version' => 1, 'last_seq' => 0, 'pair_low' => null, 'pair_high' => null, 'owner_id' => $ownerId,
            'native_members_hash' => NativeProjection::membershipHash($this->sql->nativeMembers($id)), 'native_projection_hash' => self::messageHash($message),
            'admission_ref' => 'matcher-chat:group-created-v1', 'revocation_ref' => null, 'admitted_at' => $this->now()])->execute();
        $this->invalidate[$ownerId] = true;
        return $this->group($id) ?? throw ChatException::unavailable();
    }
    public function latestMembership(int $conversationId, int $userId): ?GroupMembership
    {
        $this->guard();
        $row = $this->sql->one('SELECT * FROM {{%matcher_chat_member}} WHERE message_id=:message AND user_id=:user ORDER BY generation DESC LIMIT 1 FOR UPDATE', [':message' => $conversationId, ':user' => $userId]);
        return $row === null ? null : self::memberRow($row);
    }
    public function activeMembership(int $conversationId, int $userId): ?GroupMembership { $member = $this->latestMembership($conversationId, $userId); return $member?->status === 'active' ? $member : null; }
    public function join(GroupState $group, GroupMembership $membership): void
    {
        $this->actor($membership->userId); $priorGroup = $this->group($group->conversationId);
        $prior = $this->latestMembership($group->conversationId, $membership->userId);
        if ($priorGroup === null || $membership->conversationId !== $group->conversationId || $membership->status !== 'active'
            || $prior?->status === 'active' || $membership->generation !== ($prior?->generation ?? 0) + 1 || $membership->version !== ($prior?->version ?? 0) + 1
            || $membership->joinSeq !== 0 || $group != $priorGroup->withMembershipCount($priorGroup->activeMemberCount + 1)) { $this->invalid(); }
        $this->insertNativeMember($group->conversationId, $membership->userId, false, $this->nativeTime());
        $this->sql->db->createCommand()->insert('{{%matcher_chat_member}}', ['message_id' => $membership->conversationId, 'user_id' => $membership->userId,
            'generation' => $membership->generation, 'join_seq' => 0, 'status' => 'active', 'version' => $membership->version])->execute();
        $this->updateGroup($priorGroup, $group);
        $this->invalidate[$membership->userId] = true;
    }
    public function leave(GroupState $group, GroupMembership $membership): void
    {
        $this->actor($membership->userId); $priorGroup = $this->group($group->conversationId);
        $prior = $this->latestMembership($group->conversationId, $membership->userId);
        if ($priorGroup === null || $priorGroup->ownerId === $membership->userId || $prior?->status !== 'active' || $membership != $prior->left()
            || $group != $priorGroup->withMembershipCount($priorGroup->activeMemberCount - 1)) { $this->invalid(); }
        $deleted = $this->sql->db->createCommand()->delete('{{%user_message}}', ['message_id' => $group->conversationId, 'user_id' => $membership->userId])->execute();
        if ($deleted !== 1) { $this->invalid(); }
        $changed = $this->sql->db->createCommand()->update('{{%matcher_chat_member}}', ['status' => 'left', 'version' => $membership->version],
            ['message_id' => $group->conversationId, 'user_id' => $membership->userId, 'generation' => $membership->generation, 'version' => $prior->version, 'status' => 'active'])->execute();
        if ($changed !== 1) { $this->invalid(); }
        $this->updateGroup($priorGroup, $group); $this->invalidate[$membership->userId] = true;
    }
    public function invitation(int $invitationId): ?GroupInvitation
    {
        $this->guard(); $row = $this->sql->one('SELECT * FROM {{%matcher_chat_group_invitation}} WHERE id=:id FOR UPDATE', [':id' => $invitationId]);
        return $row === null ? null : self::invitationRow($row);
    }
    public function pendingInvitations(int $conversationId): array
    {
        $this->guard();
        $rows = $this->sql->all('SELECT * FROM {{%matcher_chat_group_invitation}} WHERE message_id=:message AND pending_invitee_id IS NOT NULL ORDER BY pending_invitee_id LIMIT 1001 FOR UPDATE', [':message' => $conversationId]);
        if (count($rows) > 1000) { $this->invalid(); }
        return array_map(self::invitationRow(...), $rows);
    }
    public function insertInvitation(int $conversationId, int $inviterId, int $inviteeId, string $createdAt, string $expiresAt): GroupInvitation
    {
        $this->actor($inviterId); $this->quota('invite', 20);
        $this->sql->db->createCommand()->insert('{{%matcher_chat_group_invitation}}', ['message_id' => $conversationId, 'inviter_id' => $inviterId,
            'invitee_id' => $inviteeId, 'pending_invitee_id' => $inviteeId, 'status' => 'pending', 'version' => 1,
            'created_at' => $createdAt, 'expires_at' => $expiresAt, 'resolved_at' => null])->execute();
        return $this->invitation(SafeInteger::native($this->sql->db->getLastInsertID(), 'invitation_id')) ?? throw ChatException::unavailable();
    }
    public function saveInvitation(GroupInvitation $invitation): void
    {
        $this->guard(); $prior = $this->invitation($invitation->id);
        if ($prior === null || $prior->status !== 'pending' || $invitation != $prior->transition($invitation->status, $invitation->resolvedAt ?? '')) { $this->invalid(); }
        $changed = $this->sql->db->createCommand()->update('{{%matcher_chat_group_invitation}}', ['status' => $invitation->status,
            'version' => $invitation->version, 'resolved_at' => $invitation->resolvedAt, 'pending_invitee_id' => null],
            ['id' => $invitation->id, 'version' => $prior->version, 'status' => 'pending'])->execute();
        if ($changed !== 1) { $this->invalid(); }
    }
    public function receipt(int $actorId, string $operation, string $clientCommandId): ?GroupReceipt
    {
        $this->actor($actorId);
        $row = $this->sql->one('SELECT * FROM {{%matcher_chat_group_receipt}} WHERE actor_id=:actor AND operation=:operation AND client_command_id=:key FOR UPDATE', [':actor' => $actorId, ':operation' => $operation, ':key' => $clientCommandId]);
        return $row === null ? null : new GroupReceipt(SafeInteger::native($row['actor_id'], 'actor_id'), $row['operation'], $row['client_command_id'], $row['payload_hash'],
            SafeInteger::native($row['message_id'], 'conversation_id'), $row['invitation_id'] === null ? null : SafeInteger::native($row['invitation_id'], 'invitation_id'));
    }
    public function remember(GroupReceipt $receipt): void
    {
        $this->actor($receipt->actorId);
        $this->sql->db->createCommand()->insert('{{%matcher_chat_group_receipt}}', ['actor_id' => $receipt->actorId, 'operation' => $receipt->operation,
            'client_command_id' => $receipt->clientCommandId, 'payload_hash' => $receipt->payloadHash, 'message_id' => $receipt->conversationId,
            'invitation_id' => $receipt->invitationId, 'created_at' => $this->now()])->execute();
    }
    private function quota(string $operation, int $limit): void
    {
        $now = $this->now();
        $rows = $this->sql->all('SELECT created_at FROM {{%matcher_chat_group_receipt}} WHERE actor_id=:actor AND operation=:operation AND created_at>:since ORDER BY created_at,client_command_id LIMIT ' . $limit . ' FOR UPDATE', [':actor' => $this->actorId, ':operation' => $operation, ':since' => $now - 60]);
        if (count($rows) >= $limit) { throw new ChatException('RATE_LIMITED', 'Wait before another group command.', 429, true, [], max(1, SafeInteger::native($rows[0]['created_at'], 'created_at') + 60 - $now)); }
    }
    private function updateGroup(GroupState $prior, GroupState $next): void
    {
        $changed = $this->sql->db->createCommand()->update('{{%matcher_chat_conversation}}', ['version' => $next->version,
            'native_members_hash' => NativeProjection::membershipHash($this->sql->nativeMembers($next->conversationId))],
            ['message_id' => $next->conversationId, 'type' => 'group', 'status' => 'active', 'version' => $prior->version])->execute();
        if ($changed !== 1 || $this->group($next->conversationId) != $next) { $this->invalid(); }
    }
    private function insertNativeMember(int $id, int $user, bool $owner, string $time): void
    {
        $this->sql->db->createCommand()->insert('{{%user_message}}', ['message_id' => $id, 'user_id' => $user, 'is_originator' => $owner ? 1 : 0,
            'last_viewed' => $time, 'created_at' => $time, 'created_by' => $this->actorId, 'updated_at' => $time, 'updated_by' => $this->actorId])->execute();
    }
    private function emptyHistory(int $id): void
    {
        $entry = $this->sql->one('SELECT id FROM {{%message_entry}} WHERE message_id=:id ORDER BY id LIMIT 1 FOR UPDATE', [':id' => $id]);
        $mapped = $this->sql->one('SELECT entry_id FROM {{%matcher_chat_entry_sequence}} WHERE message_id=:id ORDER BY seq LIMIT 1 FOR UPDATE', [':id' => $id]);
        if ($entry !== null || $mapped !== null) { throw new ChatException('GROUP_HISTORY_UNAVAILABLE', 'Group messages require a later reviewed integration.', 503); }
    }
    private static function memberRow(array $row): GroupMembership
    {
        return new GroupMembership(SafeInteger::native($row['message_id'], 'conversation_id'), SafeInteger::native($row['user_id'], 'user_id'),
            SafeInteger::native($row['generation'], 'generation'), SafeInteger::native($row['join_seq'], 'join_seq', true), $row['status'], SafeInteger::native($row['version'], 'membership_version'));
    }
    private static function invitationRow(array $row): GroupInvitation
    {
        if (($row['status'] === 'pending') !== ($row['pending_invitee_id'] !== null)
            || $row['pending_invitee_id'] !== null && SafeInteger::native($row['pending_invitee_id'], 'pending_invitee_id') !== SafeInteger::native($row['invitee_id'], 'invitee_id')) {
            throw new ChatException('INVALID_GROUP_PROJECTION', 'The invitation pending key is inconsistent.', 503);
        }
        return new GroupInvitation(SafeInteger::native($row['id'], 'invitation_id'), SafeInteger::native($row['message_id'], 'conversation_id'),
            SafeInteger::native($row['inviter_id'], 'inviter_id'), SafeInteger::native($row['invitee_id'], 'invitee_id'), $row['status'],
            SafeInteger::native($row['version'], 'invitation_version'), $row['created_at'], $row['expires_at'], $row['resolved_at']);
    }
    private static function messageHash(array $message): string
    {
        return hash('sha256', json_encode([$message['title'], (int)$message['created_by'], $message['created_at'], (int)$message['updated_by'], $message['updated_at']], JSON_THROW_ON_ERROR));
    }
    private function nativeTime(): string { return (new \DateTimeImmutable('@' . $this->now()))->setTimezone(new \DateTimeZone($this->sql->nativeTimeZone))->format('Y-m-d H:i:s'); }
    private function gate(): void
    {
        if (!$this->native->enabled()) { throw new ChatException('CHAT_GROUPS_UNAVAILABLE', 'Group lifecycle is unavailable.', 503); }
        if (!$this->activeAccount($this->actorId)) { throw new ChatException('ACCOUNT_UNAVAILABLE', 'The account is unavailable.', 401); }
    }
    private function actor(int $actorId): void { $this->guard(); if ($actorId !== $this->actorId) { throw ChatException::unavailable(); } }
    private function guard(): void { if (!$this->active || !$this->sql->db->getTransaction()?->getIsActive()) { throw new \LogicException('Group access requires the owned actor transaction.'); } }
    private function invalid(): never { throw new ChatException('INVALID_GROUP_PROJECTION', 'The group storage projection is inconsistent.', 503); }
}
