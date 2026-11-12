<?php
declare(strict_types=1);

/**
 * Fixed C04 synthetic SQL probe. Run only through the chat harness PHP command.
 * No caller IDs, credentials, SQL, text, timing or filesystem paths are accepted.
 * This is an isolation acceptance aid, not a management endpoint or send API.
 */
use humhub\modules\matcherChat\Module;
use humhub\modules\matcherChat\adapters\persistence\SqlReadStore;
use humhub\modules\matcherChat\adapters\security\{HmacCursorCodec, SystemClock};
use humhub\modules\matcherChat\application\ChatReader;
use humhub\modules\matcherChat\domain\{ChatException, PageRequest, SafeInteger};
use humhub\modules\matcherChat\domain\ports\ConsistencyBoundary;
use yii\db\Connection;

const CHAT_SQL_PROBE_SPEC = 'chat-c04-isolated-sql-v1';
const CHAT_SQL_FIXTURE_SPEC = 'chat-c04-synthetic-v1';
const CHAT_SQL_MODES = ['snapshot', 'read-low-b', 'read-high-b', 'read-high-b-hold', 'append-once', 'revoke-empty'];

if (PHP_SAPI !== 'cli' || count($argv ?? []) !== 2 || !in_array($argv[1] ?? null, CHAT_SQL_MODES, true)) {
    echo '{"status":"failed","check":"fixed_mode_required"}', PHP_EOL;
    exit(2);
}

ini_set('display_errors', '0');
ini_set('log_errors', '0');
ob_start();
$stage = 'bootstrap';
$checks = 0;

function chatSqlCheck(bool $condition): void
{
    global $checks;
    ++$checks;
    if (!$condition) { throw new RuntimeException('Owned synthetic probe refused.'); }
}

function chatSqlKeys(array $value, array $keys): bool
{
    $actual = array_keys($value);
    sort($actual);
    sort($keys);
    return $actual === $keys;
}

function chatSqlOwnedId(mixed $value): int
{
    chatSqlCheck(is_int($value) && $value > 0 && $value <= SafeInteger::MAX);
    return $value;
}

function chatSqlRows(Connection $db, string $sql, array $params = []): array
{
    return $db->createCommand($sql, $params)->queryAll();
}

/** Select only synthetic identity/content columns; never credentials or auth records. */
function chatSqlFixture(Connection $db, string $nonce, bool $lockMarker = false): array
{
    $rows = chatSqlRows($db, 'SELECT id,spec,nonce,payload_json FROM _chat_c04_fixture ORDER BY id' . ($lockMarker ? ' FOR UPDATE' : ''));
    chatSqlCheck(count($rows) === 1 && (int)$rows[0]['id'] === 1 && $rows[0]['spec'] === CHAT_SQL_FIXTURE_SPEC
        && is_string($rows[0]['nonce']) && hash_equals($nonce, $rows[0]['nonce']));
    $fixture = json_decode($rows[0]['payload_json'], true, 16, JSON_THROW_ON_ERROR);
    chatSqlCheck(is_array($fixture) && (chatSqlKeys($fixture, ['actors', 'conversations', 'entries'])
        || chatSqlKeys($fixture, ['actors', 'conversations', 'entries', 'sql_probe'])));
    chatSqlCheck(is_array($fixture['actors']) && chatSqlKeys($fixture['actors'], ['a', 'b', 'outsider']));
    chatSqlCheck(is_array($fixture['conversations']) && chatSqlKeys($fixture['conversations'], ['history', 'empty', 'unmanaged']));
    chatSqlCheck(is_array($fixture['entries']) && array_is_list($fixture['entries']) && count($fixture['entries']) === 7);
    $actors = array_map('chatSqlOwnedId', $fixture['actors']);
    $conversations = array_map('chatSqlOwnedId', $fixture['conversations']);
    $entries = array_map('chatSqlOwnedId', $fixture['entries']);
    chatSqlCheck(count(array_unique($actors)) === 3 && count(array_unique($conversations)) === 3 && count(array_unique($entries)) === 7);
    $allEntries = $entries;
    if (array_key_exists('sql_probe', $fixture)) {
        chatSqlCheck(is_array($fixture['sql_probe']) && chatSqlKeys($fixture['sql_probe'], ['spec', 'append_entry_id'])
            && $fixture['sql_probe']['spec'] === CHAT_SQL_PROBE_SPEC);
        $appendId = chatSqlOwnedId($fixture['sql_probe']['append_entry_id']);
        chatSqlCheck(!in_array($appendId, $entries, true) && $appendId > max($entries));
        $allEntries[] = $appendId;
    }

    $users = chatSqlRows($db, 'SELECT id,username,email,status FROM {{%user}} ORDER BY id');
    chatSqlCheck(count($users) === 3);
    foreach ($actors as $role => $id) {
        $matching = array_values(array_filter($users, static fn(array $row): bool => (int)$row['id'] === $id));
        $name = 'chat_c04_' . $role;
        chatSqlCheck(count($matching) === 1 && $matching[0]['username'] === $name && $matching[0]['email'] === $name . '@example.invalid' && (int)$matching[0]['status'] === 1);
    }
    $profiles = array_map('intval', $db->createCommand('SELECT user_id FROM {{%profile}} ORDER BY user_id')->queryColumn());
    $actorIds = array_values($actors);
    sort($actorIds, SORT_NUMERIC);
    chatSqlCheck($profiles === $actorIds);
    foreach (['space', 'space_membership', 'file'] as $table) {
        chatSqlCheck((int)$db->createCommand('SELECT COUNT(*) FROM {{%' . $table . '}}')->queryScalar() === 0);
    }

    $native = chatSqlRows($db, 'SELECT id,title FROM {{%message}} ORDER BY id');
    $members = chatSqlRows($db, 'SELECT message_id,user_id,last_viewed FROM {{%user_message}} ORDER BY message_id,user_id');
    chatSqlCheck(count($native) === 3 && count($members) === 6);
    foreach ($conversations as $label => $id) {
        $matching = array_values(array_filter($native, static fn(array $row): bool => (int)$row['id'] === $id));
        chatSqlCheck(count($matching) === 1 && $matching[0]['title'] === 'Synthetic C04 ' . $label);
        $expected = $label === 'unmanaged' ? [$actors['b'], $actors['outsider']] : [$actors['a'], $actors['b']];
        sort($expected, SORT_NUMERIC);
        $actual = array_values(array_filter($members, static fn(array $row): bool => (int)$row['message_id'] === $id));
        chatSqlCheck(array_map(static fn(array $row): int => (int)$row['user_id'], $actual) === $expected);
    }
    foreach ($members as $member) { chatSqlCheck($member['last_viewed'] === null); }

    $messages = chatSqlRows($db, 'SELECT id,message_id,user_id,created_by,type,content FROM {{%message_entry}} ORDER BY id');
    chatSqlCheck(count($messages) === count($allEntries));
    foreach ($allEntries as $index => $id) {
        $matching = array_values(array_filter($messages, static fn(array $row): bool => (int)$row['id'] === $id));
        $author = $actors[$index % 2 === 0 ? 'a' : 'b'];
        chatSqlCheck(count($matching) === 1 && (int)$matching[0]['message_id'] === $conversations['history']
            && (int)$matching[0]['user_id'] === $author && (int)$matching[0]['created_by'] === $author
            && (int)$matching[0]['type'] === 0 && $matching[0]['content'] === 'Synthetic C04 message ' . ($index + 1));
    }
    $metadata = chatSqlRows($db, 'SELECT message_id,type,status,version,last_seq,pair_low,pair_high,admission_ref,revocation_ref FROM {{%matcher_chat_conversation}} ORDER BY message_id');
    chatSqlCheck(count($metadata) === 2);
    $sequences = chatSqlRows($db, 'SELECT entry_id,message_id,seq,sender_id,native_type,deleted FROM {{%matcher_chat_entry_sequence}} ORDER BY seq');
    // A committed append may await its first adapter read. This permits a safe retry
    // after interruption between the fixed native insertion and synchronization.
    chatSqlCheck(count($sequences) === 7 || (count($allEntries) === 8 && count($sequences) === 8));
    $pair = [$actors['a'], $actors['b']];
    sort($pair, SORT_NUMERIC);
    $statuses = [];
    foreach (['history', 'empty'] as $label) {
        $id = $conversations[$label];
        $matching = array_values(array_filter($metadata, static fn(array $row): bool => (int)$row['message_id'] === $id));
        chatSqlCheck(count($matching) === 1 && $matching[0]['type'] === 'direct'
            && (int)$matching[0]['pair_low'] === $pair[0] && (int)$matching[0]['pair_high'] === $pair[1]
            && $matching[0]['admission_ref'] === CHAT_SQL_FIXTURE_SPEC . ':' . $label
            && (int)$matching[0]['last_seq'] === ($label === 'history' ? count($sequences) : 0));
        $state = $matching[0];
        chatSqlCheck(($state['status'] === 'active' && $state['revocation_ref'] === null)
            || ($label === 'empty' && $state['status'] === 'revoked' && $state['revocation_ref'] === CHAT_SQL_PROBE_SPEC . ':empty'));
        $statuses[$id] = $state['status'];
    }
    foreach ($sequences as $index => $sequence) {
        chatSqlCheck((int)$sequence['entry_id'] === $allEntries[$index] && (int)$sequence['message_id'] === $conversations['history']
            && (int)$sequence['seq'] === $index + 1 && (int)$sequence['sender_id'] === $actors[$index % 2 === 0 ? 'a' : 'b']
            && (int)$sequence['native_type'] === 0 && (int)$sequence['deleted'] === 0);
    }
    $managedMembers = chatSqlRows($db, 'SELECT message_id,user_id,generation,join_seq,status FROM {{%matcher_chat_member}} ORDER BY message_id,user_id');
    chatSqlCheck(count($managedMembers) === 4);
    foreach ($managedMembers as $member) {
        chatSqlCheck(in_array((int)$member['message_id'], [$conversations['history'], $conversations['empty']], true)
            && in_array((int)$member['user_id'], $pair, true) && (int)$member['generation'] === 1
            && (int)$member['join_seq'] === 0 && $member['status'] === $statuses[(int)$member['message_id']]);
    }
    foreach (chatSqlRows($db, 'SELECT message_id,user_id,generation,read_seq FROM {{%matcher_chat_read_state}}') as $read) {
        chatSqlCheck(in_array((int)$read['message_id'], [$conversations['history'], $conversations['empty']], true)
            && in_array((int)$read['user_id'], $pair, true) && (int)$read['generation'] === 1
            && (int)$read['read_seq'] >= 0 && (int)$read['read_seq'] <= ((int)$read['message_id'] === $conversations['history'] ? count($allEntries) : 0));
    }
    return $fixture;
}

function chatSqlBRead(Connection $db, array $fixture): int
{
    $rows = chatSqlRows($db, 'SELECT read_seq FROM {{%matcher_chat_read_state}} WHERE message_id=:message AND user_id=:viewer AND generation=1',
        [':message' => $fixture['conversations']['history'], ':viewer' => $fixture['actors']['b']]);
    chatSqlCheck(count($rows) <= 1);
    return $rows === [] ? 0 : SafeInteger::native($rows[0]['read_seq'], 'read_seq', true);
}

function chatSqlReadRows(Connection $db): array
{
    return chatSqlRows($db, 'SELECT message_id,user_id,generation,read_seq FROM {{%matcher_chat_read_state}} ORDER BY message_id,user_id,generation');
}

/** Used only after full ownership verification; the digest itself is never output. */
function chatSqlNativeDigest(Connection $db): string
{
    $native = [];
    foreach (['message', 'message_entry', 'user_message'] as $table) {
        $order = $table === 'user_message' ? 'message_id,user_id' : 'id';
        $native[] = chatSqlRows($db, 'SELECT * FROM {{%' . $table . '}} ORDER BY ' . $order);
    }
    return hash('sha256', json_encode($native, JSON_THROW_ON_ERROR));
}

try {
    $mode = $argv[1];
    $backend = dirname(__DIR__, 4);
    $app = require $backend . '/deploy/chat/bootstrap.php';
    $db = $app->db;
    chatSqlCheck($chatConfig['modules'] === ['mail', 'matcher-chat-ui', 'matcher-chat']
        && $chatConfig['database'] === 'humhub_chat_c02_20261112' && $db->tablePrefix === ''
        && is_string($chatConfig['nonce']) && preg_match('/^[a-f0-9]{64}$/D', $chatConfig['nonce']) === 1);
    $module = $app->moduleManager->getModule('matcher-chat', false);
    chatSqlCheck($module instanceof Module && $module->isEnabled && $module->isReadingEnabled());
    $stage = 'fixture_provenance';
    $fixture = chatSqlFixture($db, $chatConfig['nonce']);
    $history = $fixture['conversations']['history'];
    $actorB = $fixture['actors']['b'];
    $entryCount = isset($fixture['sql_probe']) ? 8 : 7;

    if ($mode === 'snapshot') {
        $stage = 'snapshot_projection';
        $a = $module->reader($fixture['actors']['a'])->messages($fixture['actors']['a'], $history, new PageRequest(), 'isolated-snapshot-a')['data'];
        $b = $module->reader($actorB)->messages($actorB, $history, new PageRequest(), 'isolated-snapshot-b')['data'];
        chatSqlCheck(count($a['items']) === $entryCount && count($b['items']) === $entryCount && !$a['has_more'] && !$b['has_more']);
        chatSqlCheck($a['context']['permissions'] === ['read' => true, 'send' => false, 'invite' => false, 'leave' => false]);
        chatSqlFixture($db, $chatConfig['nonce']);
        $result = ['native_entries' => $entryCount, 'projected_entries' => $entryCount, 'read_seq_a' => $a['read_seq'], 'read_seq_b' => $b['read_seq'],
            'unread_count_a' => $a['unread_count'], 'unread_count_b' => $b['unread_count'],
            'authorization_revision_a' => $a['context']['authorization_revision'], 'authorization_revision_b' => $b['context']['authorization_revision'],
            'read_only_permissions' => true, 'native_seen_unchanged' => true];
    } elseif ($mode === 'append-once') {
        $stage = 'append_baseline';
        $beforeContexts = [];
        foreach (['a', 'b'] as $role) {
            $actor = $fixture['actors'][$role];
            $beforeContexts[$role] = $module->reader($actor)->messages($actor, $history, new PageRequest(24, null, 7), 'isolated-append-before-' . $role)['data']['context'];
        }
        $beforeReads = chatSqlReadRows($db);
        $stage = 'append_owned_native';
        [$fixture, $inserted] = $module->sql()->transaction(function () use ($db, $chatConfig, $fixture, $history, $actorB): array {
            $owned = chatSqlFixture($db, $chatConfig['nonce'], true);
            chatSqlCheck($owned === $fixture);
            if (isset($owned['sql_probe'])) { return [$owned, false]; }
            // Deliberate fixed test insertion behind the owned-fixture/mutex checks.
            // It never invokes notifications, models, sending endpoints or arbitrary SQL.
            $db->createCommand()->insert('{{%message_entry}}', ['message_id' => $history, 'user_id' => $actorB, 'type' => 0,
                'content' => 'Synthetic C04 message 8', 'created_at' => '2026-11-12 12:00:08', 'created_by' => $actorB,
                'updated_at' => '2026-11-12 12:00:08', 'updated_by' => $actorB])->execute();
            $appendId = SafeInteger::native($db->getLastInsertID(), 'entry_id');
            chatSqlCheck($appendId > max($owned['entries']));
            $owned['sql_probe'] = ['spec' => CHAT_SQL_PROBE_SPEC, 'append_entry_id' => $appendId];
            $changed = $db->createCommand()->update('_chat_c04_fixture', ['payload_json' => json_encode($owned, JSON_THROW_ON_ERROR)],
                ['id' => 1, 'spec' => CHAT_SQL_FIXTURE_SPEC, 'nonce' => $chatConfig['nonce']])->execute();
            chatSqlCheck($changed === 1 && chatSqlFixture($db, $chatConfig['nonce'], true) === $owned);
            return [$owned, true];
        });
        $stage = 'append_projection';
        foreach (['a', 'b'] as $role) {
            $actor = $fixture['actors'][$role];
            $data = $module->reader($actor)->messages($actor, $history, new PageRequest(24, null, 7), 'isolated-append-after-' . $role)['data'];
            chatSqlCheck(count($data['items']) === 1 && $data['items'][0]['id'] === $fixture['sql_probe']['append_entry_id']
                && $data['items'][0]['seq'] === 8 && $data['items'][0]['body'] === 'Synthetic C04 message 8'
                && $data['items'][0]['kind'] === 'text' && $data['items'][0]['attachments'] === [] && !$data['has_more'] && $data['next_cursor'] === null);
            chatSqlCheck($data['context'] === $beforeContexts[$role]);
        }
        chatSqlCheck(chatSqlReadRows($db) === $beforeReads && chatSqlFixture($db, $chatConfig['nonce']) === $fixture);
        $result = ['native_entries' => 8, 'projected_entries' => 8, 'inserted_entries' => $inserted ? 1 : 0,
            'appended_seq' => 8, 'incremental_items' => 1, 'idempotent_replay' => !$inserted,
            'authorization_revision_unchanged' => true, 'conversation_version_unchanged' => true,
            'read_state_unchanged' => true, 'native_seen_unchanged' => true, 'send_api_exercised' => false];
    } elseif ($mode === 'revoke-empty') {
        $stage = 'revoke_baseline';
        $beforeNative = chatSqlNativeDigest($db);
        $beforeReads = chatSqlReadRows($db);
        $empty = $fixture['conversations']['empty'];
        $actorA = $fixture['actors']['a'];
        $prior = $module->reader($actorA)->conversations($actorA, new PageRequest(1), 'isolated-revoke-before')['data'];
        $cursor = $prior['next_cursor'];
        $wasRevoked = $cursor === null;
        chatSqlCheck(count($prior['items']) === 1 && ($wasRevoked ? !$prior['has_more'] : $prior['has_more']));
        $stage = 'revoke_owned_metadata';
        $revoked = $module->admission()->revokeDirect($empty, CHAT_SQL_PROBE_SPEC . ':empty');
        chatSqlCheck($revoked['conversation_id'] === $empty && $revoked['status'] === 'revoked' && $revoked['last_seq'] === 0);
        $stage = 'revoke_failed_cursor_observation';
        $invalidDenied = false;
        try { $module->reader($actorA)->conversations($actorA, new PageRequest(1, 'fixed-invalid-c04-cursor'), 'isolated-revoke-invalid'); }
        catch (ChatException $failure) { $invalidDenied = $failure->httpStatus === 422 && $failure->errorCode === 'INVALID_CURSOR'; }
        chatSqlCheck($invalidDenied);
        // The failed user operation must not roll back the newly observed scope epoch.
        $revision = $db->createCommand('SELECT revision FROM {{%matcher_chat_viewer_revision}} WHERE user_id=:viewer', [':viewer' => $actorA])->queryScalar();
        chatSqlCheck(SafeInteger::native($revision, 'authorization_revision') === $prior['authorization_revision'] + ($wasRevoked ? 0 : 1));
        if ($cursor !== null) {
            $staleDenied = false;
            try { $module->reader($actorA)->conversations($actorA, new PageRequest(1, $cursor), 'isolated-revoke-stale'); }
            catch (ChatException $failure) { $staleDenied = $failure->httpStatus === 409 && $failure->errorCode === 'CURSOR_CONTEXT_CHANGED'; }
            chatSqlCheck($staleDenied);
        }
        $stage = 'revoke_denied_read';
        foreach (['a', 'b'] as $role) {
            $actor = $fixture['actors'][$role];
            $denied = false;
            try { $module->reader($actor)->messages($actor, $empty, new PageRequest(), 'isolated-revoked-' . $role); }
            catch (ChatException $failure) { $denied = $failure->httpStatus === 404 && $failure->errorCode === 'CONVERSATION_UNAVAILABLE'; }
            chatSqlCheck($denied);
        }
        $stage = 'revoke_durability';
        $persisted = chatSqlRows($db, 'SELECT status,revocation_ref FROM {{%matcher_chat_conversation}} WHERE message_id=:message', [':message' => $empty]);
        chatSqlCheck(count($persisted) === 1 && $persisted[0]['status'] === 'revoked' && $persisted[0]['revocation_ref'] === CHAT_SQL_PROBE_SPEC . ':empty');
        chatSqlCheck(hash_equals($beforeNative, chatSqlNativeDigest($db)) && chatSqlReadRows($db) === $beforeReads);
        chatSqlCheck(chatSqlFixture($db, $chatConfig['nonce']) === $fixture);
        $result = ['revoked_conversations' => 1, 'denied_read_checks' => 2, 'revocation_durable' => true,
            'native_members_unchanged' => true, 'native_messages_unchanged' => true, 'read_state_unchanged' => true,
            'invalid_cursor_denied' => true, 'failed_cursor_observation_durable' => true, 'stale_cursor_checked' => $cursor !== null,
            'idempotent_replay' => $wasRevoked, 'native_seen_unchanged' => true, 'readmission_attempted' => false];
    } else {
        $stage = 'bounded_read_merge';
        chatSqlCheck(chatSqlBRead($db, $fixture) <= 3);
        $requested = $mode === 'read-low-b' ? 1 : 3;
        $hold = $mode === 'read-high-b-hold';
        $store = new SqlReadStore($module->sql(), $actorB);
        $boundary = new class($store, $db, $chatConfig['nonce'], $fixture, $hold) implements ConsistencyBoundary {
            public function __construct(private SqlReadStore $store, private Connection $db, private string $nonce, private array $fixture, private bool $hold) {}
            public function run(callable $operation): mixed
            {
                return $this->store->run(function () use ($operation): mixed {
                    // Revalidate ownership and the no-reset ceiling inside the real SQL boundary.
                    chatSqlCheck(chatSqlFixture($this->db, $this->nonce, true) === $this->fixture);
                    chatSqlCheck(chatSqlBRead($this->db, $this->fixture) <= 3);
                    $result = $operation();
                    chatSqlCheck($result['data']['read_seq'] <= 3);
                    if ($this->hold) {
                        fwrite(STDERR, "__CHAT_SQL_HIGH_LOCK_HELD__\n");
                        fflush(STDERR);
                        usleep(750000);
                    }
                    return $result;
                });
            }
        };
        $reader = new ChatReader($store, $store, new HmacCursorCodec($module->cursorSecret, new SystemClock()), $boundary);
        $before = chatSqlBRead($db, $fixture);
        $data = $reader->markRead($actorB, $history, $requested, 'isolated-' . $mode)['data'];
        $after = chatSqlBRead($db, $fixture);
        chatSqlCheck($data['read_seq'] >= max($before, $requested) && $data['read_seq'] <= 3 && $after >= $data['read_seq'] && $after <= 3);
        chatSqlFixture($db, $chatConfig['nonce']);
        $result = ['requested_seq' => $requested, 'merged_read_seq' => $data['read_seq'], 'persisted_read_seq' => $after,
            'unread_count' => $data['unread_count'], 'monotonic_merge' => true, 'read_state_reset' => false,
            'fixed_lock_hold_used' => $hold, 'native_seen_unchanged' => true];
    }
    while (ob_get_level() > 0) { ob_end_clean(); }
    echo json_encode(['status' => 'passed', 'mode' => $mode, 'checks' => $checks, 'synthetic_fixture_verified' => true,
        'real_user_data_used' => false, 'credentials_returned' => false] + $result, JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    while (ob_get_level() > 0) { ob_end_clean(); }
    echo json_encode(['status' => 'failed', 'check' => $stage, 'private_diagnostics_suppressed' => true], JSON_THROW_ON_ERROR), PHP_EOL;
    exit(1);
}
