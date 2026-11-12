<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

use humhub\modules\matcherChat\adapters\memory\InMemoryGroupStore;
use humhub\modules\matcherChat\application\ChatGroups;
use humhub\modules\matcherChat\domain\{GroupCommand, GroupPolicy};

// Actual offline use-case results only; no bootstrapped application or database.
$store = new InMemoryGroupStore();
foreach (range(1, 5) as $id) { $store->setAccount($id, true); $store->setFriendship(1, $id, true); $store->setFriendship($id, 1, true); }
$service = new ChatGroups($store, $store, $store, new GroupPolicy(259200, 50, 50));
$cases = [];
$command = static function (string $operation, int $key, mixed $value): GroupCommand {
    $field = $operation === 'create' ? 'title' : ($operation === 'invite' ? 'target_user_id' : 'expected_version');
    return new GroupCommand($operation, ['client_command_id' => '12345678-1234-4234-8234-' . sprintf('%012d', $key), 'confirmation_intent' => GroupCommand::INTENTS[$operation], $field => $value]);
};
$run = static function (string $name, string $operation, int $actor, ?int $target, ?GroupCommand $input) use (&$cases, $service): array {
    $payload = $operation === 'detail' ? $service->invitation($actor, $target, $name)
        : ($operation === 'create' ? $service->create($actor, $input, $name) : $service->$operation($actor, $target, $input, $name));
    $cases[] = ['name' => $name, 'operation' => $operation, 'actor_id' => $actor, 'target_id' => $target, 'command' => $input?->body(), 'payload' => $payload];
    return $payload['data'];
};
$create = $command('create', 1, 'Synthetic 普通群');
$group = $run('create-owner-only', 'create', 1, null, $create)['group']['conversation_id'];
$run('create-replay', 'create', 1, null, $create);
$invite = $command('invite', 2, 2);
$invitation = $run('invite-pending', 'invite', 1, $group, $invite)['invitation']['id'];
$run('pending-invitee-detail', 'detail', 2, $invitation, null);
$run('invite-replay-pending', 'invite', 1, $group, $invite);
$store->setLastSeq($group, 7);
$accept = $command('accept', 3, 1);
$run('accept-current-boundary', 'accept', 2, $invitation, $accept);
$run('accept-replay-active', 'accept', 2, $invitation, $accept);
$leave = $command('leave', 4, 1);
$run('leave-current-generation', 'leave', 2, $group, $leave);
$run('accept-replay-after-leave', 'accept', 2, $invitation, $accept);
$newInvitation = $run('reinvite-with-new-key', 'invite', 1, $group, $command('invite', 5, 2))['invitation']['id'];
$run('pending-after-left-detail', 'detail', 2, $newInvitation, null);
$store->setLastSeq($group, 19);
$run('accept-second-generation', 'accept', 2, $newInvitation, $command('accept', 6, 1));
$run('old-leave-replay-current-active', 'leave', 2, $group, $leave);
$run('old-accept-replay-current-generation', 'accept', 2, $invitation, $accept);
$third = $run('invite-to-withdraw', 'invite', 1, $group, $command('invite', 7, 3))['invitation']['id'];
$withdraw = $command('withdraw', 8, 1);
$run('withdraw-by-owner', 'withdraw', 1, $third, $withdraw);
$run('withdraw-replay', 'withdraw', 1, $third, $withdraw);
$fourth = $run('invite-to-decline', 'invite', 1, $group, $command('invite', 9, 4))['invitation']['id'];
$decline = $command('decline', 10, 1);
$run('decline-by-invitee', 'decline', 4, $fourth, $decline);
$run('decline-replay', 'decline', 4, $fourth, $decline);
$expiringCommand = $command('invite', 11, 5);
$expiring = $run('invite-to-expire', 'invite', 1, $group, $expiringCommand)['invitation']['id'];
$store->time += 259200;
$run('expiry-boundary-detail', 'detail', 5, $expiring, null);
$run('invite-replay-current-expired', 'invite', 1, $group, $expiringCommand);
echo json_encode(['schema_version' => 1, 'kind' => 'matcher-chat-c07p-synthetic-contract', 'cases' => $cases], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), PHP_EOL;
