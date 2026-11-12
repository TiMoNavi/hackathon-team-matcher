<?php
declare(strict_types=1);
/** Fixed owned C05 probe. Only the root's restricted bootstrap/harness may execute it. */
use humhub\modules\matcherChat\Module;
use humhub\modules\matcherChat\adapters\native\NativeSendEligibility;
use humhub\modules\matcherChat\adapters\persistence\{SqlReadStore, SqlSendStore};
use humhub\modules\matcherChat\application\ChatSender;
use humhub\modules\matcherChat\domain\{ChatException, Message, SafeInteger, SendReceipt, SendText};
use humhub\modules\matcherChat\domain\ports\{ConsistencyBoundary, SendRepository};

const C05_MODES = ['hold-send', 'dedupe-send', 'changed-send', 'delete-friend', 'hold-unfriend', 'hold-block', 'try-send', 'rollback-send', 'quota-rollback',
    'hold-new-unfriend', 'hold-new-block', 'try-new-unfriend', 'try-new-block'];
if (PHP_SAPI !== 'cli' || count($argv ?? []) !== 2 || !in_array($argv[1] ?? null, C05_MODES, true)) {
    echo '{"status":"failed","check":"fixed_mode_required"}', PHP_EOL; exit(2);
}
ini_set('display_errors', '0'); ini_set('log_errors', '0'); ob_start();
$stage = 'bootstrap'; $checks = 0;
function c05Check(bool $condition): void { global $checks; ++$checks; if (!$condition) { throw new RuntimeException('Owned C05 probe refused.'); } }
function c05Key(int $suffix): string { return 'c0500000-0000-4000-8000-' . sprintf('%012d', $suffix); }
function c05Owned($db, string $nonce): array
{
    $rows = $db->createCommand('SELECT id,spec,nonce,payload_json FROM _chat_c05_fixture ORDER BY id')->queryAll();
    c05Check(count($rows) === 1 && (int)$rows[0]['id'] === 1 && $rows[0]['spec'] === 'chat-c05-text-v1' && hash_equals($nonce, $rows[0]['nonce']));
    $fixture = json_decode($rows[0]['payload_json'], true, 16, JSON_THROW_ON_ERROR);
    c05Check(is_array($fixture) && array_keys($fixture) === ['actors', 'conversation_id', 'legacy_hash', 'queue_count']
        && is_array($fixture['actors']) && array_keys($fixture['actors']) === ['a', 'b']
        && is_string($fixture['legacy_hash']) && preg_match('/^[a-f0-9]{64}$/D', $fixture['legacy_hash']) === 1);
    $pair = [];
    foreach ($fixture['actors'] as $role => $id) {
        c05Check(is_int($id) && $id > 0 && $id <= SafeInteger::MAX); $pair[] = $id;
        $user = $db->createCommand('SELECT username,email,status,contentcontainer_id FROM {{%user}} WHERE id=:id', [':id' => $id])->queryOne();
        c05Check($user !== false && $user['username'] === 'chat_c05_' . $role && $user['email'] === 'chat_c05_' . $role . '@example.invalid' && (int)$user['status'] === 1);
        $fixture['containers'][$role] = SafeInteger::native($user['contentcontainer_id'], 'contentcontainer_id');
    }
    c05Check($pair[0] !== $pair[1] && $fixture['containers']['a'] !== $fixture['containers']['b']); sort($pair, SORT_NUMERIC);
    $id = $fixture['conversation_id']; c05Check(is_int($id) && $id > 0 && $id <= SafeInteger::MAX);
    $row = $db->createCommand('SELECT title FROM {{%message}} WHERE id=:id', [':id' => $id])->queryOne();
    c05Check($row !== false && $row['title'] === 'Synthetic C05 direct');
    $members = $db->createCommand('SELECT user_id FROM {{%user_message}} WHERE message_id=:id ORDER BY user_id', [':id' => $id])->queryColumn();
    c05Check(array_map('intval', $members) === $pair);
    $state = $db->createCommand('SELECT type,status,pair_low,pair_high,admission_ref FROM {{%matcher_chat_conversation}} WHERE message_id=:id', [':id' => $id])->queryOne();
    c05Check($state !== false && $state['type'] === 'direct' && $state['status'] === 'active' && (int)$state['pair_low'] === $pair[0] && (int)$state['pair_high'] === $pair[1] && $state['admission_ref'] === 'chat-c05-text-v1:direct');
    $old = $db->createCommand('SELECT spec,nonce,payload_json FROM _chat_c04_fixture WHERE id=1')->queryOne();
    c05Check($old !== false && $old['spec'] === 'chat-c04-synthetic-v1' && hash_equals($nonce, $old['nonce']));
    $old = json_decode($old['payload_json'], true, 16, JSON_THROW_ON_ERROR);
    c05Check(array_intersect($pair, array_values($old['actors'])) === [] && !in_array($id, array_values($old['conversations']), true));
    $entries = $db->createCommand('SELECT user_id,created_by,type FROM {{%message_entry}} WHERE message_id=:id ORDER BY id LIMIT 101', [':id' => $id])->queryAll();
    c05Check(count($entries) <= 100);
    foreach ($entries as $entry) { c05Check(in_array((int)$entry['user_id'], $pair, true) && (int)$entry['created_by'] === (int)$entry['user_id'] && (int)$entry['type'] === 0); }
    return $fixture;
}
function c05Digest($db, int $id): string
{
    $rows = [];
    foreach (['message' => ['id', 'id'], 'message_entry' => ['message_id', 'id'], 'user_message' => ['message_id', 'user_id'],
        'matcher_chat_conversation' => ['message_id', 'message_id'], 'matcher_chat_entry_sequence' => ['message_id', 'seq'],
        'matcher_chat_read_state' => ['message_id', 'user_id,generation'], 'matcher_chat_send_receipt' => ['message_id', 'user_id,client_message_id']] as $table => [$key, $order]) {
        $rows[] = $db->createCommand('SELECT * FROM {{%' . $table . '}} WHERE ' . $key . '=:id ORDER BY ' . $order, [':id' => $id])->queryAll();
    }
    return hash('sha256', json_encode($rows, JSON_THROW_ON_ERROR));
}
function c05Signal(string $signal): void { fwrite(STDOUT, $signal . PHP_EOL); fflush(STDOUT); }
function c05Hold(): void
{
    c05Signal('__CHAT_C05_READY__');
    $read = [STDIN]; $write = []; $except = [];
    c05Check(stream_select($read, $write, $except, 30) === 1);
    c05Check(fgets(STDIN, 16) === "continue\n");
}
final class C05Rollback extends RuntimeException {}

try {
    $mode = $argv[1]; $backend = dirname(__DIR__, 4);
    $app = require $backend . '/deploy/chat/bootstrap.php'; $db = $app->db;
    c05Check($chatConfig['modules'] === ['mail', 'matcher-chat-ui', 'matcher-chat'] && $chatConfig['database'] === 'humhub_chat_c02_20261112');
    $chat = $app->moduleManager->getModule('matcher-chat', false);
    c05Check($chat instanceof Module && $chat->isEnabled && $chat->isSendingEnabled());
    $stage = 'owned_fixture'; $fixture = c05Owned($db, $chatConfig['nonce']);
    $actor = $fixture['actors']['a']; $other = $fixture['actors']['b']; $id = $fixture['conversation_id'];
    $result = [];
    if (in_array($mode, ['delete-friend', 'hold-unfriend', 'hold-block'], true)) {
        $stage = 'owned_relation_transition'; c05Signal('__CHAT_C05_ATTEMPTING__');
        // Deliberately no chat mutex: model a concurrent native relation writer.
        $tx = $db->beginTransaction(\yii\db\Transaction::REPEATABLE_READ);
        try {
            if ($mode === 'hold-block') {
                $key = ['contentcontainer_id' => $fixture['containers']['a'], 'user_id' => $other];
                $existing = $db->createCommand('SELECT user_id FROM {{%contentcontainer_blocked_users}} WHERE contentcontainer_id=:container AND user_id=:other FOR UPDATE', [':container' => $key['contentcontainer_id'], ':other' => $other])->queryOne();
                c05Check($existing === false);
                $db->createCommand()->insert('{{%contentcontainer_blocked_users}}', $key)->execute();
                c05Hold();
                $result = ['blocked_pair_count' => 1];
            } else {
                $affected = 0;
                $pair = [$actor, $other]; sort($pair, SORT_NUMERIC);
                foreach ([[$pair[0], $pair[1]], [$pair[1], $pair[0]]] as [$owner, $friend]) {
                    $affected += $db->createCommand()->delete('{{%user_friendship}}', ['user_id' => $owner, 'friend_user_id' => $friend])->execute();
                }
                c05Check(in_array($affected, [0, 2], true));
                if ($mode === 'hold-unfriend') { c05Hold(); }
                $result = ['deleted_friendship_rows' => $affected];
            }
            $tx->commit();
        } catch (Throwable $error) { if ($tx->getIsActive()) { $tx->rollBack(); } throw $error; }
    } else {
        $stage = 'send_boundary';
        $reads = new SqlReadStore($chat->sql(), $actor, new NativeSendEligibility($chat->sql(), $chat->sendEnabled));
        $writes = new SqlSendStore($chat->sql(), $reads, $actor);
        if ($mode === 'quota-rollback') {
            $before = c05Digest($db, $id); $quotaChecked = false; $created = 0;
            c05Signal('__CHAT_C05_ATTEMPTING__');
            try {
                $writes->run(function () use ($writes, $reads, $actor, $id, &$quotaChecked, &$created): void {
                    $inline = new class implements ConsistencyBoundary { public function run(callable $operation): mixed { return $operation(); } };
                    $sender = new ChatSender($reads, $reads, $writes, $inline);
                    for ($index = 0; $index < 61; ++$index) {
                        try { $sender->send($actor, $id, new SendText(c05Key(1000 + $index), 'Synthetic C05 rollback quota ' . $index), 'isolated-quota-' . $index); ++$created; }
                        catch (ChatException $error) {
                            c05Check($error->errorCode === 'RATE_LIMITED' && $error->httpStatus === 429 && $error->retryAfterSeconds !== null);
                            $quotaChecked = true; break;
                        }
                    }
                    c05Check($quotaChecked && $created <= 60);
                    throw new C05Rollback('Fixed rollback.');
                });
            } catch (C05Rollback) { /* Native messages and real references were temporary together. */ }
            c05Check($quotaChecked && hash_equals($before, c05Digest($db, $id)));
            $result = ['quota_denied' => true, 'temporary_sends' => $created, 'all_temporary_rows_rolled_back' => true];
        } else {
            $repository = $writes;
            if ($mode === 'rollback-send') {
                $repository = new class($writes) implements SendRepository {
                    public function __construct(private SqlSendStore $inner) {}
                    public function receipt(int $viewerId, int $conversationId, string $key): ?SendReceipt { return $this->inner->receipt($viewerId, $conversationId, $key); }
                    public function assertQuota(int $viewerId): void { $this->inner->assertQuota($viewerId); }
                    public function append(int $viewerId, int $conversationId, SendText $text): Message { return $this->inner->append($viewerId, $conversationId, $text); }
                    public function remember(int $viewerId, int $conversationId, SendText $text, Message $message): void {
                        $this->inner->remember($viewerId, $conversationId, $text, $message);
                        throw new ChatException('C05_TEST_ROLLBACK', 'Fixed rollback.', 409);
                    }
                };
            }
            $freshKeys = ['hold-new-unfriend' => 10, 'hold-new-block' => 11, 'try-new-unfriend' => 12, 'try-new-block' => 13];
            $fresh = array_key_exists($mode, $freshKeys);
            $tryFresh = in_array($mode, ['try-new-unfriend', 'try-new-block'], true);
            $key = c05Key($freshKeys[$mode] ?? ($mode === 'try-send' ? 2 : ($mode === 'rollback-send' ? 3 : 1)));
            $boundary = new class($writes, in_array($mode, ['hold-send', 'hold-new-unfriend', 'hold-new-block'], true), in_array($mode, ['dedupe-send', 'changed-send'], true), $actor, $id, $fresh ? $key : null) implements ConsistencyBoundary {
                public function __construct(private SqlSendStore $inner, private bool $hold, private bool $requireReceipt, private int $actor, private int $conversation, private ?string $freshKey) {}
                public function run(callable $operation): mixed {
                    return $this->inner->run(function () use ($operation): mixed {
                        // Check after lock acquisition so a concurrent original can commit.
                        // A misordered probe must not create its own missing original.
                        if ($this->requireReceipt) { c05Check($this->inner->receipt($this->actor, $this->conversation, c05Key(1)) !== null); }
                        if ($this->freshKey !== null) { c05Check($this->inner->receipt($this->actor, $this->conversation, $this->freshKey) === null); }
                        if ($this->hold) { c05Hold(); }
                        return $operation();
                    });
                }
            };
            $sender = new ChatSender($reads, $reads, $repository, $boundary);
            $text = new SendText($key, $mode === 'changed-send' ? 'Synthetic C05 overlap changed' : 'Synthetic C05 overlap original');
            $before = $mode === 'rollback-send' || $tryFresh ? c05Digest($db, $id) : null;
            c05Signal('__CHAT_C05_ATTEMPTING__');
            try {
                $data = $sender->send($actor, $id, $text, 'isolated-' . $mode)['data'];
                c05Check($mode !== 'rollback-send' && $mode !== 'changed-send' && !$tryFresh);
                if ($mode === 'dedupe-send') { c05Check($data['replayed']); }
                if ($fresh) { c05Check(!$data['replayed']); }
                $result = ['http_status' => $data['replayed'] ? 200 : 201, 'replayed' => $data['replayed'],
                    'seq' => $data['message']['seq'], 'read_seq' => $data['read_seq'], 'unread_count' => $data['unread_count']];
            } catch (ChatException $error) {
                $expected = $mode === 'rollback-send' ? 'C05_TEST_ROLLBACK' : ($mode === 'changed-send' ? 'IDEMPOTENCY_CONFLICT' : 'SEND_FORBIDDEN');
                c05Check($error->errorCode === $expected);
                if ($mode === 'rollback-send' || $tryFresh) { c05Check(hash_equals($before, c05Digest($db, $id))); }
                if ($tryFresh) {
                    c05Check($error->httpStatus === 403 && $db->createCommand('SELECT entry_id FROM {{%matcher_chat_send_receipt}} WHERE message_id=:id AND user_id=:actor AND client_message_id=:key',
                        [':id' => $id, ':actor' => $actor, ':key' => $key])->queryOne() === false);
                }
                $result = ['http_status' => $error->httpStatus, 'error_code' => $error->errorCode,
                    'rollback_verified' => $mode === 'rollback-send', 'no_new_message' => true];
            }
        }
    }
    c05Owned($db, $chatConfig['nonce']);
    while (ob_get_level() > 0) { ob_end_clean(); }
    echo json_encode(['status' => 'passed', 'mode' => $mode, 'checks' => $checks, 'owned_synthetic_scope' => true,
        'credentials_returned' => false, 'notifications_sent' => false] + $result, JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    while (ob_get_level() > 0) { ob_end_clean(); }
    echo json_encode(['status' => 'failed', 'check' => $stage, 'private_diagnostics_suppressed' => true], JSON_THROW_ON_ERROR), PHP_EOL; exit(1);
}
