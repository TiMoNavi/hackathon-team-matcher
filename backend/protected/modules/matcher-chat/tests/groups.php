<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

use humhub\modules\matcherChat\adapters\memory\InMemoryGroupStore;
use humhub\modules\matcherChat\application\ChatGroups;
use humhub\modules\matcherChat\domain\{ChatException, GroupCommand, GroupInvitation, GroupPolicy, GroupReceipt, SafeInteger};

$checks = 0;
function groupCheck(bool $condition, string $label): void { global $checks; ++$checks; if (!$condition) { throw new RuntimeException($label); } }
function groupError(callable $operation, string $code): ChatException
{
    try { $operation(); } catch (ChatException $error) { groupCheck($error->errorCode === $code, 'Expected ' . $code . ', got ' . $error->errorCode); return $error; }
    throw new RuntimeException('Expected group error: ' . $code);
}
function groupKey(int $value): string { return '12345678-1234-4234-8234-' . sprintf('%012d', $value); }
function groupCommand(string $op, int $key, mixed $value): GroupCommand
{
    return new GroupCommand($op, ['client_command_id' => groupKey($key), 'confirmation_intent' => GroupCommand::INTENTS[$op],
        $op === 'create' ? 'title' : ($op === 'invite' ? 'target_user_id' : 'expected_version') => $value]);
}
function groupFixture(?GroupPolicy $policy = null): array
{
    $store = new InMemoryGroupStore();
    foreach (range(1, 6) as $id) { $store->setAccount($id, true); $store->setFriendship(1, $id, true); $store->setFriendship($id, 1, true); }
    $service = new ChatGroups($store, $store, $store, $policy ?? new GroupPolicy(259200, 50, 50));
    $group = $service->create(1, groupCommand('create', 1, 'Synthetic group'), 'fixture')['data']['group']['conversation_id'];
    return [$store, $service, $group];
}
function groupPending(?GroupPolicy $policy = null): array
{
    [$store, $service, $group] = groupFixture($policy);
    $id = $service->invite(1, $group, groupCommand('invite', 2, 2), 'fixture-invite')['data']['invitation']['id'];
    return [$store, $service, $group, $id];
}
function groupJoined(): array
{
    [$store, $service, $group, $id] = groupPending();
    $store->setLastSeq($group, 5);
    $service->accept(2, $id, groupCommand('accept', 3, 1), 'fixture-accept');
    return [$store, $service, $group, $id];
}
function groupReplace(InMemoryGroupStore $store, string $field, callable $change): void
{
    $property = new ReflectionProperty($store, $field); $data = $property->getValue($store); $property->setValue($store, $change($data));
}

foreach (['group', '  exact title  ', '中文🙂é', str_repeat('🙂', 100), '<tag>&literal', "\u{feff}"] as $title) {
    groupCheck(groupCommand('create', 1, $title)->title === $title, 'title preserved without normalization');
}
foreach (['', ' ', "\t", "\u{00a0}\u{3000}", "x\0", "x\u{0085}", "x\u{007f}", "\xff", str_repeat('🙂', 101), null, [], 3] as $title) {
    groupError(fn () => groupCommand('create', 1, $title), 'INVALID_GROUP_TITLE');
}
$body = groupCommand('create', 1, 'Group')->body();
foreach (['bad', 'ABCDEF00-1234-4234-8234-123456789012', str_replace('-4234-', '-1234-', groupKey(1)), groupKey(1) . ' ', 1, null] as $key) {
    groupError(fn () => new GroupCommand('create', array_replace($body, ['client_command_id' => $key])), 'INVALID_CLIENT_COMMAND_ID');
}
groupError(fn () => new GroupCommand('delete', $body), 'INVALID_GROUP_COMMAND');
groupError(fn () => new GroupCommand('create', $body + ['actor_id' => 1]), 'INVALID_GROUP_COMMAND');
groupError(fn () => new GroupCommand('create', $body + ['expected_version' => 1]), 'INVALID_GROUP_COMMAND');
$missing = $body; unset($missing['title']);
groupError(fn () => new GroupCommand('create', $missing), 'INVALID_GROUP_COMMAND');
groupError(fn () => new GroupCommand('create', array_replace($body, ['confirmation_intent' => true])), 'CONFIRMATION_REQUIRED');
foreach ([0, -1, '1', 1.0, true, SafeInteger::MAX + 1] as $bad) {
    groupError(fn () => groupCommand('accept', 1, $bad), 'INVALID_ARGUMENT');
    groupError(fn () => groupCommand('invite', 1, $bad), 'INVALID_ARGUMENT');
}
foreach ([[0, 50, 50], [1, 1, 50], [1, 50, 0], [31536001, 50, 50], [1, 1001, 50]] as $bad) { groupError(fn () => new GroupPolicy(...$bad), 'INVALID_GROUP_POLICY'); }
$created = '2026-11-13T00:00:00Z'; $expires = '2026-11-16T00:00:00Z';
foreach ([['pending', $created, $expires, $created], ['accepted', $created, $expires, null], ['accepted', $created, $expires, $expires],
    ['expired', $created, $expires, $created], ['declined', $created, $expires, '2026-11-12T00:00:00Z'],
    ['pending', $created, $created, null], ['pending', '2026-02-30T00:00:00Z', $expires, null], ['pending', '2026-11-13T00:00:00.000Z', $expires, null]] as $bad) {
    groupError(fn () => new GroupInvitation(1, 1, 1, 2, $bad[0], 1, $bad[1], $bad[2], $bad[3]), 'INVALID_GROUP_INVITATION');
}
groupError(fn () => new GroupReceipt(1, 'create', groupKey(1), str_repeat('a', 64), 1, 2), 'INVALID_IDEMPOTENCY_RECEIPT');
groupError(fn () => new GroupReceipt(1, 'invite', groupKey(1), str_repeat('a', 64), 1, null), 'INVALID_IDEMPOTENCY_RECEIPT');
groupError(fn () => new GroupReceipt(1, 'accept', groupKey(1), str_repeat('a', 64), 1, SafeInteger::MAX + 1), 'INVALID_ARGUMENT');

[$store, $service, $group] = groupFixture();
$original = $store->snapshot();
$createdReply = $service->create(1, groupCommand('create', 1, 'Synthetic group'), 'create-again')['data'];
groupCheck($createdReply['replayed'] && $store->snapshot() === $original && $createdReply['group']['active_member_count'] === 1, 'create replay does not add members or a conversation');
groupError(fn () => $service->create(1, groupCommand('create', 1, 'Changed title'), 'changed'), 'IDEMPOTENCY_CONFLICT');
groupCheck($service->create(2, groupCommand('create', 1, 'Other owner'), 'other-owner')['data']['group']['owner_id'] === 2, 'command keys are actor scoped');
groupError(fn () => $service->create(1, groupCommand('invite', 1, 2), 'wrong-action'), 'INVALID_GROUP_COMMAND');
groupError(fn () => $service->create(0, groupCommand('create', 9, 'Valid'), 'bad-actor'), 'INVALID_ARGUMENT');
groupError(fn () => $service->create(1, groupCommand('create', 9, 'Valid'), "bad\nrequest"), 'INVALID_ARGUMENT');
groupError(fn () => $service->invite(2, $group, groupCommand('invite', 1, 3), 'not-owner'), 'CONVERSATION_UNAVAILABLE');
groupError(fn () => $service->invite(1, $group, groupCommand('invite', 1, 1), 'self'), 'GROUP_TARGET_UNAVAILABLE');
groupError(fn () => $service->invite(1, 999, groupCommand('invite', 1, 2), 'unknown'), 'CONVERSATION_UNAVAILABLE');
$store->setFriendship(2, 1, false);
groupError(fn () => $service->invite(1, $group, groupCommand('invite', 1, 2), 'one-sided'), 'GROUP_TARGET_UNAVAILABLE');
$store->setFriendship(2, 1, true);
foreach ([[1, 2], [2, 1]] as [$a, $b]) {
    $store->setBlock($a, $b, true); groupError(fn () => $service->invite(1, $group, groupCommand('invite', 1, 2), 'blocked'), 'GROUP_TARGET_UNAVAILABLE'); $store->setBlock($a, $b, false);
}
$store->setAccount(2, false); groupError(fn () => $service->invite(1, $group, groupCommand('invite', 1, 2), 'inactive'), 'GROUP_TARGET_UNAVAILABLE'); $store->setAccount(2, true);
$invite = groupCommand('invite', 1, 2);
$id = $service->invite(1, $group, $invite, 'invite')['data']['invitation']['id'];
groupCheck($store->latestMembership($group, 2) === null && !$store->nativeMember($group, 2), 'pending does not make a native member');
$detail = $service->invitation(2, $id, 'pending-detail')['data'];
groupCheck($detail['group'] === null && $detail['membership'] === null && array_keys($detail) === ['group', 'invitation', 'membership', 'replayed'], 'pending detail has no group or message disclosure');
groupError(fn () => $service->invitation(3, $id, 'foreign-detail'), 'CONVERSATION_UNAVAILABLE');
groupError(fn () => $service->accept(1, $id, groupCommand('accept', 2, 1), 'wrong-acceptor'), 'CONVERSATION_UNAVAILABLE');
groupError(fn () => $service->withdraw(2, $id, groupCommand('withdraw', 2, 1), 'wrong-manager'), 'CONVERSATION_UNAVAILABLE');
groupError(fn () => $service->accept(2, $id, groupCommand('accept', 2, 2), 'stale-version'), 'VERSION_CONFLICT');
groupError(fn () => $service->invite(1, $group, groupCommand('invite', 2, 2), 'duplicate-pending'), 'GROUP_INVITATION_PENDING');
groupError(fn () => $service->invite(1, $group, groupCommand('invite', 1, 3), 'different-target'), 'IDEMPOTENCY_CONFLICT');
$other = $service->create(1, groupCommand('create', 20, 'Other group'), 'another')['data']['group']['conversation_id'];
groupError(fn () => $service->invite(1, $other, $invite, 'different-group'), 'IDEMPOTENCY_CONFLICT');
$store->setFriendship(1, 2, false);
groupError(fn () => $service->accept(2, $id, groupCommand('accept', 2, 1), 'unfriended'), 'GROUP_TARGET_UNAVAILABLE');
groupCheck($store->invitation($id)->status === 'pending' && !$store->nativeMember($group, 2), 'failed acceptance preserves pending and no member');
$decline = groupCommand('decline', 3, 1);
groupCheck($service->decline(2, $id, $decline, 'decline-unfriended')['data']['invitation']['status'] === 'declined', 'decline remains possible after friendship ends');
groupCheck($service->decline(2, $id, $decline, 'decline-replay')['data']['replayed'], 'terminal decline replay');
groupError(fn () => $service->accept(2, $id, groupCommand('accept', 4, 2), 'terminal'), 'INVITATION_NOT_PENDING');
groupCheck($service->invite(1, $group, $invite, 'old-invite')['data']['invitation']['status'] === 'declined', 'old invitation key never creates a new pending');

[$store, $service, $group, $id] = groupJoined();
$member = $store->latestMembership($group, 2);
groupCheck($member->joinSeq === 5 && $member->generation === 1 && $member->version === 1 && $store->nativeMember($group, 2), 'accept establishes current sequence boundary and native member');
groupCheck($store->group($group)->version === 2 && $store->group($group)->activeMemberCount === 2, 'accept increments group version and member count');
groupError(fn () => $service->invite(1, $group, groupCommand('invite', 4, 2), 'active-member'), 'GROUP_ALREADY_MEMBER');
groupError(fn () => $service->leave(1, $group, groupCommand('leave', 4, 1), 'owner-leave'), 'GROUP_OWNER_CANNOT_LEAVE');
groupError(fn () => $service->leave(2, $group, groupCommand('leave', 4, 2), 'stale-leave'), 'VERSION_CONFLICT');
$leave = groupCommand('leave', 4, 1);
$left = $service->leave(2, $group, $leave, 'leave')['data'];
groupCheck($left['group'] === null && $left['membership']['status'] === 'left' && $left['membership']['version'] === 2 && !$store->nativeMember($group, 2), 'leave removes native member and hides group');
$after = $store->snapshot();
$acceptedReplay = $service->accept(2, $id, groupCommand('accept', 3, 1), 'accept-left')['data'];
groupCheck($acceptedReplay['replayed'] && $acceptedReplay['group'] === null && $acceptedReplay['membership']['status'] === 'left' && $store->snapshot() === $after, 'old acceptance cannot resurrect left member');
$newId = $service->invite(1, $group, groupCommand('invite', 5, 2), 'reinvite')['data']['invitation']['id'];
groupCheck($newId !== $id && $service->invitation(2, $newId, 'pending-left')['data']['membership']['status'] === 'left', 'new pending preserves previous left projection');
$store->setLastSeq($group, 22);
$rejoined = $service->accept(2, $newId, groupCommand('accept', 6, 1), 'rejoin')['data'];
groupCheck($rejoined['membership']['generation'] === 2 && $rejoined['membership']['join_seq'] === 22 && $rejoined['membership']['version'] === 3, 'rejoin is a new membership generation and boundary');
groupCheck($service->leave(2, $group, $leave, 'old-leave')['data']['membership']['status'] === 'active' && $store->nativeMember($group, 2), 'old leave replay never removes new membership');
groupCheck($service->accept(2, $id, groupCommand('accept', 3, 1), 'old-accept')['data']['membership']['generation'] === 2, 'old acceptance replays current membership generation');
groupError(fn () => $service->leave(2, $group, groupCommand('leave', 7, 1), 'old-membership-version'), 'VERSION_CONFLICT');

[$store, $service, $group, $id] = groupPending(new GroupPolicy(10, 50, 50));
$store->time += 9; groupCheck($service->invitation(2, $id, 'before-expiry')['data']['invitation']['status'] === 'pending', 'invite active just before expiry');
$store->time++; $snapshot = $store->snapshot();
$expired = $service->invitation(2, $id, 'at-expiry')['data']['invitation'];
$store->time++; $expiredAgain = $service->invitation(2, $id, 'later-expiry')['data']['invitation'];
groupCheck($expired === $expiredAgain && $expired['status'] === 'expired' && $expired['resolved_at'] === $expired['expires_at'] && $expired['version'] === 2, 'virtual expiry stable at exact boundary');
groupCheck($store->snapshot() === $snapshot && $store->invitation($id)->status === 'pending', 'detail does not persist expiry');
foreach ([1, 2] as $version) { groupError(fn () => $service->accept(2, $id, groupCommand('accept', 4, $version), 'expired-accept'), 'INVITATION_EXPIRED'); }
groupError(fn () => $service->decline(2, $id, groupCommand('decline', 4, 1), 'expired-decline'), 'INVITATION_EXPIRED');
groupError(fn () => $service->withdraw(1, $id, groupCommand('withdraw', 4, 1), 'expired-withdraw'), 'INVITATION_EXPIRED');
$new = $service->invite(1, $group, groupCommand('invite', 4, 2), 'invite-after-expiry')['data']['invitation'];
groupCheck($new['id'] !== $id && $store->invitation($id)->dto() === $expired, 'reinvite persists exact prior virtual expiry and new identity');

[$store, $service, $group, $id] = groupPending(new GroupPolicy(10, 2, 1));
groupError(fn () => $service->invite(1, $group, groupCommand('invite', 4, 3), 'pending-limit'), 'GROUP_PENDING_LIMIT');
$service->withdraw(1, $id, groupCommand('withdraw', 4, 1), 'withdraw-slot');
$second = $service->invite(1, $group, groupCommand('invite', 5, 3), 'freed-slot')['data']['invitation']['id'];
$service->accept(3, $second, groupCommand('accept', 6, 1), 'fills-members');
groupError(fn () => $service->invite(1, $group, groupCommand('invite', 7, 4), 'member-limit'), 'GROUP_MEMBER_LIMIT');
[$store, $service, $group, $id] = groupPending(new GroupPolicy(10, 2, 50));
$second = $service->invite(1, $group, groupCommand('invite', 5, 3), 'parallel-pending')['data']['invitation']['id'];
$service->accept(2, $id, groupCommand('accept', 6, 1), 'last-slot');
groupError(fn () => $service->accept(3, $second, groupCommand('accept', 7, 1), 'accept-full'), 'GROUP_MEMBER_LIMIT');
groupCheck($store->invitation($second)->status === 'pending' && $store->latestMembership($group, 3) === null, 'full acceptance adds no member or decision');

// Every write stage rolls back group, native-members, history, invitations, receipts and IDs.
foreach (['create' => ['create', 'remember'], 'invite' => ['insertInvitation', 'remember'], 'accept' => ['join', 'saveInvitation', 'remember'],
    'decline' => ['saveInvitation', 'remember'], 'withdraw' => ['saveInvitation', 'remember'], 'leave' => ['leave', 'remember']] as $operation => $stages) {
    foreach ($stages as $stage) {
        [$store, $service, $group, $id] = $operation === 'leave' ? groupJoined() : groupPending();
        $actor = in_array($operation, ['accept', 'decline', 'leave'], true) ? 2 : 1;
        $command = groupCommand($operation, 50, $operation === 'create' ? 'Rollback group' : ($operation === 'invite' ? 3 : 1));
        $target = in_array($operation, ['accept', 'decline', 'withdraw'], true) ? $id : $group;
        $run = fn () => $operation === 'create' ? $service->create($actor, $command, 'rollback') : $service->$operation($actor, $target, $command, 'rollback');
        $before = $store->snapshot();
        $store->onNext($stage, static function (): void { throw new RuntimeException('Injected group failure.'); });
        try { $run(); throw new LogicException('Missing injected failure.'); } catch (RuntimeException $error) { groupCheck($error->getMessage() === 'Injected group failure.', 'failure at ' . $operation . '/' . $stage); }
        groupCheck($store->snapshot() === $before, 'full rollback at ' . $operation . '/' . $stage);
        groupCheck(!$run()['data']['replayed'], 'same command can recover after rollback at ' . $operation . '/' . $stage);
    }
}

// One-shot interleavings are deterministic simulations, not SQL race evidence.
foreach (['friendship', 'block', 'target-account', 'owner-account', 'group', 'native-owner-member', 'native-join', 'clock'] as $change) {
    [$store, $service, $group, $id] = groupPending(); $before = $store->snapshot();
    $store->onNext('remember', static function (InMemoryGroupStore $s) use ($change, $group): void {
        match ($change) {
            'friendship' => $s->setFriendship(2, 1, false), 'block' => $s->setBlock(2, 1, true),
            'target-account' => $s->setAccount(2, false), 'owner-account' => $s->setAccount(1, false),
            'group' => $s->setGroupEnabled($group, false), 'native-owner-member' => $s->overrideNativeMember($group, 1, false),
            'native-join' => $s->overrideNativeMember($group, 2, false), 'clock' => $s->time += 259200,
        };
    });
    $code = match ($change) { 'group', 'native-owner-member', 'native-join' => 'CONVERSATION_UNAVAILABLE', 'clock' => 'INVITATION_EXPIRED', default => 'GROUP_TARGET_UNAVAILABLE' };
    groupError(fn () => $service->accept(2, $id, groupCommand('accept', 3, 1), 'late-change'), $code);
    groupCheck($store->snapshot() === $before && $store->invitation($id)->status === 'pending', 'late change rolls back acceptance: ' . $change);
}
[$store, $service, $group] = groupFixture(); $before = $store->snapshot();
$store->onNext('remember', static fn (InMemoryGroupStore $s) => $s->setAccount(1, false));
groupError(fn () => $service->create(1, groupCommand('create', 7, 'No orphan'), 'account-race'), 'ACCOUNT_UNAVAILABLE');
groupCheck($store->snapshot() === $before && !$store->activeAccount(1), 'creation rollback does not restore external account authority');
[$store, $service, $group, $id] = groupJoined();
$store->setAccount(2, false);
groupError(fn () => $service->accept(2, $id, groupCommand('accept', 3, 1), 'disabled-replay'), 'ACCOUNT_UNAVAILABLE');
$store->setAccount(2, true); $store->setGroupEnabled($group, false);
groupError(fn () => $service->accept(2, $id, groupCommand('accept', 3, 1), 'revoked-group-replay'), 'CONVERSATION_UNAVAILABLE');
$store->setGroupEnabled($group, true); $store->overrideNativeMember($group, 2, false);
groupError(fn () => $service->accept(2, $id, groupCommand('accept', 3, 1), 'removed-native-replay'), 'CONVERSATION_UNAVAILABLE');
groupCheck(!$store->nativeMember($group, 2), 'replay never repairs removed native membership');

// Treat corrupt adapter projections as failures, not alternate authorization facts.
[$store, $service, $group, $id] = groupPending();
groupReplace($store, 'invitations', static function (array $rows) use ($id): array {
    $old = $rows[$id]; $rows[$id] = new GroupInvitation($old->id, $old->conversationId, 3, $old->inviteeId, $old->status, $old->version, $old->createdAt, $old->expiresAt, $old->resolvedAt); return $rows;
});
$before = $store->snapshot();
groupError(fn () => $service->accept(2, $id, groupCommand('accept', 3, 1), 'foreign-inviter'), 'INVALID_GROUP_PROJECTION');
groupError(fn () => $service->invitation(2, $id, 'foreign-inviter-detail'), 'INVALID_GROUP_PROJECTION');
groupError(fn () => $service->invite(1, $group, groupCommand('invite', 2, 2), 'foreign-inviter-replay'), 'CONVERSATION_UNAVAILABLE');
groupCheck($store->snapshot() === $before, 'foreign inviter fails before any persistent changes');
[$store, $service, $group, $id] = groupPending();
$other = $service->create(1, groupCommand('create', 8, 'Other group'), 'second-group')['data']['group']['conversation_id'];
groupReplace($store, 'receipts', static function (array $rows) use ($other): array {
    $old = $rows[1]['invite'][groupKey(2)]; $rows[1]['invite'][groupKey(2)] = new GroupReceipt(1, 'invite', $old->clientCommandId, $old->payloadHash, $other, $old->invitationId); return $rows;
});
groupError(fn () => $service->invite(1, $group, groupCommand('invite', 2, 2), 'wrong-receipt-group'), 'INVALID_GROUP_PROJECTION');
[$store, $service, $group, $id] = groupJoined();
groupReplace($store, 'receipts', static function (array $rows): array {
    $old = $rows[2]['accept'][groupKey(3)]; $rows[2]['accept'][groupKey(3)] = new GroupReceipt(2, 'accept', $old->clientCommandId, $old->payloadHash, $old->conversationId, 999); return $rows;
});
groupError(fn () => $service->accept(2, $id, groupCommand('accept', 3, 1), 'wrong-receipt-invitation'), 'INVALID_GROUP_PROJECTION');

[$store, $service, $group, $id] = groupPending();
$otherInvitation = $service->invite(1, $group, groupCommand('invite', 3, 3), 'other-recipient')['data']['invitation']['id'];
groupReplace($store, 'receipts', static function (array $rows) use ($otherInvitation): array {
    $old = $rows[1]['invite'][groupKey(2)];
    $rows[1]['invite'][groupKey(2)] = new GroupReceipt(1, 'invite', $old->clientCommandId, $old->payloadHash, $old->conversationId, $otherInvitation);
    return $rows;
});
$before = $store->snapshot();
groupError(fn () => $service->invite(1, $group, groupCommand('invite', 2, 2), 'same-group-wrong-recipient'), 'INVALID_GROUP_PROJECTION');
groupCheck($store->snapshot() === $before, 'same-group wrong invitation receipt cannot mutate or project another recipient');

foreach (['accept', 'decline', 'withdraw'] as $operation) {
    foreach (['status', 'version'] as $corruption) {
        [$store, $service, $group, $id] = groupPending();
        $actor = $operation === 'withdraw' ? 1 : 2;
        $command = groupCommand($operation, 3, 1);
        $service->$operation($actor, $id, $command, 'original-decision');
        groupReplace($store, 'invitations', static function (array $rows) use ($id, $corruption): array {
            $old = $rows[$id];
            $status = $corruption === 'status' ? ($old->status === 'accepted' ? 'declined' : 'accepted') : $old->status;
            $rows[$id] = new GroupInvitation($old->id, $old->conversationId, $old->inviterId, $old->inviteeId, $status,
                $old->version + ($corruption === 'version' ? 1 : 0), $old->createdAt, $old->expiresAt, $old->resolvedAt);
            return $rows;
        });
        $before = $store->snapshot();
        groupError(fn () => $service->$operation($actor, $id, $command, 'corrupt-decision-replay'), 'INVALID_GROUP_PROJECTION');
        groupCheck($store->snapshot() === $before, 'decision replay rejects inconsistent ' . $operation . '/' . $corruption . ' without writing');
    }
}
[$store, $service, $group, $id] = groupJoined();
groupReplace($store, 'invitations', static function (array $rows) use ($id): array {
    $old = $rows[$id];
    $rows[$id] = new GroupInvitation($old->id, $old->conversationId, $old->inviterId, 3, $old->status, $old->version, $old->createdAt, $old->expiresAt, $old->resolvedAt);
    return $rows;
});
$before = $store->snapshot();
groupError(fn () => $service->accept(2, $id, groupCommand('accept', 3, 1), 'wrong-decision-actor'), 'CONVERSATION_UNAVAILABLE');
groupCheck($store->snapshot() === $before, 'decision replay never substitutes the actor role');

echo json_encode(['status' => 'passed', 'checks' => $checks, 'database_connections' => 0, 'http_requests' => 0,
    'scope' => 'Offline ordinary-group commands, current-authority projections, generation boundaries and synthetic rollback; no SQL/API/UI acceptance.'], JSON_THROW_ON_ERROR), PHP_EOL;
