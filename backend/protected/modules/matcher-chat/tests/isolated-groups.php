<?php
declare(strict_types=1);
/** Root-only, fixed C07A provenance and commands. No arbitrary IDs, SQL or paths. */
use humhub\modules\matcherChat\Module;
use humhub\modules\matcherChat\adapters\persistence\SqlGroupStore;
use humhub\modules\matcherChat\application\ChatGroups;
use humhub\modules\matcherChat\domain\{ChatException, GroupCommand, GroupInvitation, GroupMembership, GroupPolicy, GroupReceipt, GroupState, SafeInteger};
use humhub\modules\matcherChat\domain\ports\GroupRepository;

const C07_MODES = ['rollback-create', 'rollback-accept', 'quota-rollback', 'hold-accept', 'try-accept', 'hold-unfriend', 'try-unfriend', 'hold-block', 'try-block'];
if (PHP_SAPI !== 'cli' || count($argv ?? []) !== 2 || !in_array($argv[1] ?? null, C07_MODES, true)) { exit(2); }
require __DIR__ . '/bootstrap.php';
ini_set('display_errors', '0'); ini_set('log_errors', '0'); ob_start();
$stage = 'bootstrap'; $checks = 0;
function c07Check(bool $condition): void { global $checks; ++$checks; if (!$condition) { throw new RuntimeException('Fixed C07A probe refused.'); } }
function c07Key(int $suffix): string { return 'c07a0000-0000-4000-8000-' . sprintf('%012d', $suffix); }
function c07Command(string $operation, int $key, mixed $value): GroupCommand
{
    return new GroupCommand($operation, ['client_command_id' => c07Key($key), 'confirmation_intent' => GroupCommand::INTENTS[$operation],
        $operation === 'create' ? 'title' : ($operation === 'invite' ? 'target_user_id' : 'expected_version') => $value]);
}
function c07Signal(string $signal): void { fwrite(STDOUT, $signal . PHP_EOL); fflush(STDOUT); }
function c07Hold(): void
{
    c07Signal('__CHAT_C07_READY__'); $read = [STDIN]; $write = []; $except = [];
    c07Check(stream_select($read, $write, $except, 30) === 1 && fgets(STDIN, 16) === "continue\n");
}
function c07Owned($db, string $nonce): array
{
    $rows = $db->createCommand('SELECT id,spec,nonce,payload_json FROM _chat_c07a_fixture ORDER BY id')->queryAll();
    c07Check(count($rows) === 1 && (int)$rows[0]['id'] === 1 && $rows[0]['spec'] === 'chat-c07a-group-v1' && hash_equals($nonce, $rows[0]['nonce']));
    $fixture = json_decode($rows[0]['payload_json'], true, 16, JSON_THROW_ON_ERROR);
    c07Check(array_keys($fixture) === ['actors', 'conversation_id', 'legacy_hash', 'queue_count'] && array_keys($fixture['actors']) === ['a', 'b', 'outsider']
        && count(array_unique($fixture['actors'])) === 3 && preg_match('/^[a-f0-9]{64}$/D', $fixture['legacy_hash']) === 1 && $fixture['queue_count'] === 1);
    foreach ($fixture['actors'] as $role => $id) {
        c07Check(is_int($id) && $id > 0 && $id <= SafeInteger::MAX);
        $row = $db->createCommand('SELECT username,email,status,contentcontainer_id FROM {{%user}} WHERE id=:id', [':id' => $id])->queryOne();
        c07Check($row !== false && $row['username'] === 'chat_c07a_' . $role && $row['email'] === 'chat_c07a_' . $role . '@example.invalid' && (int)$row['status'] === 1);
        $fixture['containers'][$role] = SafeInteger::native($row['contentcontainer_id'], 'contentcontainer_id');
    }
    c07Check(count(array_unique($fixture['containers'])) === 3);
    $direct = $db->createCommand('SELECT type,status,admission_ref FROM {{%matcher_chat_conversation}} WHERE message_id=:id', [':id' => $fixture['conversation_id']])->queryOne();
    c07Check($direct !== false && $direct['type'] === 'direct' && $direct['status'] === 'active' && $direct['admission_ref'] === 'chat-c07a-group-v1:direct');
    $old = $db->createCommand('SELECT spec,nonce,payload_json FROM _chat_c05b_fixture WHERE id=1')->queryOne();
    c07Check($old !== false && $old['spec'] === 'chat-c05b-attachment-v1' && hash_equals($nonce, $old['nonce']));
    $old = json_decode($old['payload_json'], true, 16, JSON_THROW_ON_ERROR);
    c07Check(array_intersect(array_values($fixture['actors']), array_values($old['actors'])) === []);
    c07Check($db->createCommand('SELECT status FROM {{%matcher_chat_conversation}} WHERE message_id=:id', [':id' => $old['conversation_id']])->queryScalar() === 'revoked');
    c07Check((int)$db->createCommand('SELECT COUNT(*) FROM {{%message_entry}}')->queryScalar() === 28
        && (int)$db->createCommand('SELECT COUNT(*) FROM {{%file}}')->queryScalar() === 16 && (int)$db->createCommand('SELECT COUNT(*) FROM {{%queue}}')->queryScalar() === 1);
    return $fixture;
}
function c07Invitation($db, array $fixture, int $base): array
{
    $row = $db->createCommand('SELECT r.message_id,r.invitation_id FROM {{%matcher_chat_group_receipt}} r WHERE actor_id=:actor AND operation=:op AND client_command_id=:key',
        [':actor' => $fixture['actors']['a'], ':op' => 'invite', ':key' => c07Key($base + 1)])->queryOne();
    c07Check($row !== false);
    $group = $db->createCommand('SELECT c.*,m.title FROM {{%matcher_chat_conversation}} c INNER JOIN {{%message}} m ON m.id=c.message_id WHERE c.message_id=:id', [':id' => $row['message_id']])->queryOne();
    c07Check($group !== false && $group['type'] === 'group' && $group['status'] === 'active' && (int)$group['owner_id'] === $fixture['actors']['a']
        && $group['pair_low'] === null && $group['pair_high'] === null && (int)$group['last_seq'] === 0);
    $creation = $db->createCommand('SELECT message_id FROM {{%matcher_chat_group_receipt}} WHERE actor_id=:actor AND operation=:op AND client_command_id=:key',
        [':actor' => $fixture['actors']['a'], ':op' => 'create', ':key' => c07Key($base)])->queryScalar();
    c07Check((int)$creation === (int)$row['message_id']);
    $invite = $db->createCommand('SELECT * FROM {{%matcher_chat_group_invitation}} WHERE id=:id', [':id' => $row['invitation_id']])->queryOne();
    c07Check($invite !== false && (int)$invite['message_id'] === (int)$row['message_id'] && (int)$invite['inviter_id'] === $fixture['actors']['a'] && (int)$invite['invitee_id'] === $fixture['actors']['b']);
    return ['group' => (int)$row['message_id'], 'invitation' => (int)$row['invitation_id'], 'status' => $invite['status']];
}
function c07Digest($db): string
{
    $rows = [];
    foreach (['matcher_chat_group_invitation' => 'id', 'matcher_chat_group_receipt' => 'actor_id,operation,client_command_id'] as $table => $order) {
        $rows[] = $db->createCommand('SELECT * FROM {{%' . $table . '}} ORDER BY ' . $order)->queryAll();
    }
    foreach (['message' => ['id', 'id'], 'user_message' => ['message_id', 'user_id'], 'matcher_chat_member' => ['message_id', 'user_id,generation']] as $table => [$key, $order]) {
        $rows[] = $db->createCommand('SELECT t.* FROM {{%' . $table . '}} t WHERE t.' . $key . ' IN (SELECT message_id FROM {{%matcher_chat_conversation}} WHERE type=:type) ORDER BY t.' . $key . ',' . $order, [':type' => 'group'])->queryAll();
    }
    $rows[] = $db->createCommand('SELECT * FROM {{%matcher_chat_conversation}} WHERE type=:type ORDER BY message_id', [':type' => 'group'])->queryAll();
    return hash('sha256', json_encode($rows, JSON_THROW_ON_ERROR));
}
final class C07Rollback extends RuntimeException {}
/** Test seam delegates every production write, then injects a rollback/hold at receipt. */
final class C07ProbeRepository implements GroupRepository
{
    public function __construct(private SqlGroupStore $store, private bool $inline = false, private mixed $afterRemember = null) {}
    public function run(callable $operation): mixed { return $this->inline ? $operation() : $this->store->run($operation); }
    public function create(int $ownerId, string $title): GroupState { return $this->store->create($ownerId, $title); }
    public function group(int $id): ?GroupState { return $this->store->group($id); }
    public function activeMembership(int $id, int $user): ?GroupMembership { return $this->store->activeMembership($id, $user); }
    public function latestMembership(int $id, int $user): ?GroupMembership { return $this->store->latestMembership($id, $user); }
    public function join(GroupState $group, GroupMembership $member): void { $this->store->join($group, $member); }
    public function leave(GroupState $group, GroupMembership $member): void { $this->store->leave($group, $member); }
    public function invitation(int $id): ?GroupInvitation { return $this->store->invitation($id); }
    public function pendingInvitations(int $id): array { return $this->store->pendingInvitations($id); }
    public function insertInvitation(int $id, int $from, int $to, string $created, string $expires): GroupInvitation { return $this->store->insertInvitation($id, $from, $to, $created, $expires); }
    public function saveInvitation(GroupInvitation $invitation): void { $this->store->saveInvitation($invitation); }
    public function receipt(int $actor, string $operation, string $key): ?GroupReceipt { return $this->store->receipt($actor, $operation, $key); }
    public function remember(GroupReceipt $receipt): void { $this->store->remember($receipt); if ($this->afterRemember !== null) { ($this->afterRemember)(); } }
}

try {
    $mode = $argv[1]; $backend = dirname(__DIR__, 4); $app = require $backend . '/deploy/chat/bootstrap.php'; $db = $app->db;
    c07Check($chatConfig['database'] === 'humhub_chat_c02_20261112' && $chatConfig['modules'] === ['mail', 'matcher-chat-ui', 'matcher-chat']);
    $chat = $app->moduleManager->getModule('matcher-chat', false);
    // CLI proves configured persistence intent and schema only. Web/session/poll
    // readiness belongs to the separately executed real HTTP verifier.
    c07Check($chat instanceof Module && $chat->isEnabled && $chat->groupsEnabled
        && in_array($chat->settings->getUncached('groupsEnabled'), ['1', 'true'], true));
    $stage = 'owned_fixture'; $fixture = c07Owned($db, $chatConfig['nonce']); $owner = $fixture['actors']['a']; $target = $fixture['actors']['b'];
    c07Check((new SqlGroupStore($chat->sql(), $owner, $chat->groupsEnabled))->ready());
    $result = [];
    if (in_array($mode, ['hold-unfriend', 'hold-block'], true)) {
        $stage = 'native_relation_transaction'; c07Invitation($db, $fixture, $mode === 'hold-unfriend' ? 30 : 40);
        c07Signal('__CHAT_C07_ATTEMPTING__'); $tx = $db->beginTransaction(\yii\db\Transaction::REPEATABLE_READ);
        try {
            if ($mode === 'hold-block') {
                $key = ['contentcontainer_id' => $fixture['containers']['a'], 'user_id' => $target];
                c07Check($db->createCommand('SELECT user_id FROM {{%contentcontainer_blocked_users}} WHERE contentcontainer_id=:container AND user_id=:user FOR UPDATE', [':container' => $key['contentcontainer_id'], ':user' => $target])->queryOne() === false);
                $db->createCommand()->insert('{{%contentcontainer_blocked_users}}', $key)->execute();
            } else {
                $pair = [$owner, $target]; sort($pair); $count = 0;
                foreach ([[$pair[0], $pair[1]], [$pair[1], $pair[0]]] as [$from, $to]) { $count += $db->createCommand()->delete('{{%user_friendship}}', ['user_id' => $from, 'friend_user_id' => $to])->execute(); }
                c07Check($count === 2);
            }
            c07Hold(); $tx->commit(); $result = ['native_change_committed' => true];
        } catch (Throwable $e) { if ($tx->isActive) { $tx->rollBack(); } throw $e; }
    } elseif ($mode === 'quota-rollback') {
        $stage = 'quota_rollback'; c07Signal('__CHAT_C07_ATTEMPTING__');
        foreach (['create' => $fixture['actors']['outsider'], 'invite' => $owner] as $operation => $actor) {
            $before = c07Digest($db); $store = new SqlGroupStore($chat->sql(), $actor, true); $count = 0; $limited = false; $existingInWindow = null;
            $location = $operation === 'invite' ? c07Invitation($db, $fixture, 30) : null;
            try {
                $store->run(function () use ($store, $db, $operation, $actor, $owner, $target, $location, &$count, &$limited, &$existingInWindow): void {
                    $service = new ChatGroups(new C07ProbeRepository($store, true), $store, $store, new GroupPolicy(259200, 50, 50));
                    $limit = $operation === 'create' ? 5 : 20;
                    $baseline = $db->createCommand('SELECT created_at FROM {{%matcher_chat_group_receipt}} WHERE actor_id=:actor AND operation=:operation AND created_at>:since ORDER BY created_at LIMIT ' . ($limit + 1) . ' FOR UPDATE',
                        [':actor' => $actor, ':operation' => $operation, ':since' => $store->now() - 60])->queryAll();
                    c07Check(count($baseline) <= $limit);
                    if ($location !== null) {
                        c07Check($location['status'] === 'pending');
                        $service->withdraw($owner, $location['invitation'], c07Command('withdraw', 700, 1), 'quota-clear-pending');
                    }
                    for ($i = 0; $i <= $limit; ++$i) {
                        try {
                            if ($operation === 'create') { $service->create($actor, c07Command('create', 800 + $i, 'Synthetic C07A rollback quota'), 'quota-create'); }
                            else {
                                $invite = $service->invite($owner, $location['group'], c07Command('invite', 900 + $i, $target), 'quota-invite')['data']['invitation'];
                                $service->withdraw($owner, $invite['id'], c07Command('withdraw', 950 + $i, 1), 'quota-withdraw');
                            }
                            ++$count;
                        } catch (ChatException $e) {
                            c07Check($e->errorCode === 'RATE_LIMITED' && $e->httpStatus === 429 && $e->retryAfterSeconds !== null);
                            $since = $store->now() - 60;
                            $existingInWindow = count(array_filter($baseline, static fn (array $row): bool => (int)$row['created_at'] > $since));
                            c07Check($count + $existingInWindow === $limit);
                            $limited = true; break;
                        }
                    }
                    c07Check($limited && $count <= $limit); throw new C07Rollback();
                });
            } catch (C07Rollback) { c07Check($limited); }
            c07Check(c07Digest($db) === $before); $result[$operation] = ['new_commands_rolled_back' => $count, 'existing_in_window_at_limit' => $existingInWindow, 'quota_observed' => $limited];
        }
    } else {
        $actor = $mode === 'rollback-create' ? $fixture['actors']['outsider'] : $target;
        $store = new SqlGroupStore($chat->sql(), $actor, true);
        $base = $mode === 'try-unfriend' ? 30 : ($mode === 'try-block' ? 40 : 20);
        $location = $mode === 'rollback-create' ? null : c07Invitation($db, $fixture, $base);
        $before = c07Digest($db); $stage = 'group_command';
        $rollback = in_array($mode, ['rollback-create', 'rollback-accept'], true);
        if ($rollback && $location !== null) { c07Check($location['status'] === 'pending'); }
        $hook = $rollback ? static function (): void { throw new C07Rollback(); } : ($mode === 'hold-accept' ? c07Hold(...) : null);
        $service = new ChatGroups(new C07ProbeRepository($store, false, $hook), $store, $store, new GroupPolicy(259200, 50, 50));
        c07Signal('__CHAT_C07_ATTEMPTING__');
        try {
            $payload = $location === null ? $service->create($actor, c07Command('create', 600, 'Synthetic C07A rollback create'), 'rollback-create')
                : $service->accept($actor, $location['invitation'], c07Command('accept', $base + 2, 1), $mode);
            c07Check(!$rollback && !in_array($mode, ['try-unfriend', 'try-block'], true));
            $result = ['replayed' => $payload['data']['replayed'], 'conversation_id' => $payload['data']['group']['conversation_id'],
                'membership_generation' => $payload['data']['membership']['generation'], 'invitation_status' => $payload['data']['invitation']['status']];
        } catch (C07Rollback) { c07Check($rollback && c07Digest($db) === $before); $result = ['full_rollback' => true]; }
        catch (ChatException $e) {
            c07Check(in_array($mode, ['try-unfriend', 'try-block'], true) && $e->errorCode === 'GROUP_TARGET_UNAVAILABLE');
            c07Check(c07Digest($db) === $before); $result = ['authorization_denied' => $e->errorCode, 'membership_added' => false];
        }
    }
    c07Check((int)$db->createCommand('SELECT COUNT(*) FROM {{%message_entry}}')->queryScalar() === 28 && (int)$db->createCommand('SELECT COUNT(*) FROM {{%queue}}')->queryScalar() === 1);
    while (ob_get_level() > 0) { ob_end_clean(); }
    echo json_encode(['status' => 'passed', 'mode' => $mode, 'checks' => $checks, 'result' => $result, 'scope' => 'Fixed synthetic C07A native SQL transaction probe; no group message or attachment delivery.'], JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $e) {
    while (ob_get_level() > 0) { ob_end_clean(); }
    fwrite(STDERR, json_encode(['status' => 'failed', 'stage' => $stage, 'exception_type' => get_class($e),
        'code' => $e instanceof ChatException ? $e->errorCode : null, 'reason' => 'Fixed C07A probe refused; private diagnostics suppressed.'], JSON_THROW_ON_ERROR) . PHP_EOL); exit(1);
}
