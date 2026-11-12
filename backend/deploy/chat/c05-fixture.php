<?php
declare(strict_types=1);
/** Fixed synthetic C05 scope. No arbitrary account, conversation, SQL or body inputs. */
if (PHP_SAPI !== 'cli' || count($argv) !== 2 || !in_array($argv[1], ['prepare', 'snapshot', 'unfriend', 'refriend', 'block', 'unblock'], true)) { exit(2); }
ob_start(); $stage = 'bootstrap';
try {
    $action = $argv[1]; $app = require __DIR__ . '/bootstrap.php'; $db = $app->db;
    $chat = $app->moduleManager->getModule('matcher-chat', false);
    if ($chatConfig['modules'] !== ['mail', 'matcher-chat-ui', 'matcher-chat'] || !$chat || !$chat->isEnabled || !method_exists($chat, 'sender')) {
        throw new RuntimeException('C05 module not ready.');
    }
    $query = static fn(string $table): yii\db\Query => (new yii\db\Query())->from($table);
    $count = static fn(string $table): int => (int)$query($table)->count('*', $db);
    $oldMarker = $query('_chat_c04_fixture')->where(['id' => 1])->one($db);
    if (!$oldMarker || $oldMarker['spec'] !== 'chat-c04-synthetic-v1' || !hash_equals($chatConfig['nonce'], $oldMarker['nonce'])) { throw new RuntimeException('C04 provenance absent.'); }
    $old = json_decode($oldMarker['payload_json'], true, 16, JSON_THROW_ON_ERROR);
    if (array_keys($old) !== ['actors', 'conversations', 'entries', 'sql_probe'] || count($old['entries']) !== 7
        || ($old['sql_probe']['spec'] ?? null) !== 'chat-c04-isolated-sql-v1') { throw new RuntimeException('C04 variant changed.'); }
    $oldEntries = array_merge($old['entries'], [$old['sql_probe']['append_entry_id']]);
    $oldActors = array_values($old['actors']); $oldConversations = array_values($old['conversations']);
    $legacy = [];
    foreach (['user' => ['id' => $oldActors], 'profile' => ['user_id' => $oldActors],
        'message' => ['id' => $oldConversations], 'user_message' => ['message_id' => $oldConversations],
        'message_entry' => ['id' => $oldEntries], 'matcher_chat_conversation' => ['message_id' => $oldConversations],
        'matcher_chat_entry_sequence' => ['message_id' => $oldConversations], 'matcher_chat_member' => ['message_id' => $oldConversations],
        'matcher_chat_read_state' => ['message_id' => $oldConversations]] as $table => $where) {
        $rows = $query($table)->where($where)->all($db);
        usort($rows, static fn(array $a, array $b): int => strcmp(json_encode($a), json_encode($b)));
        $legacy[$table] = $rows;
    }
    if (count($legacy['message_entry']) !== 8 || count($legacy['user']) !== 3 || count($legacy['user_message']) !== 6) { throw new RuntimeException('C04 original rows changed.'); }
    $legacyHash = hash('sha256', json_encode($legacy, JSON_THROW_ON_ERROR));
    $file = $chatRuntime . '/c05-fixture.json'; $table = '_chat_c05_fixture';
    $exists = $db->schema->getTableSchema($table, true) !== null;
    if (!file_exists($file)) {
        if ($action !== 'prepare' || $exists || is_link($file)) { throw new RuntimeException('C05 ownership absent.'); }
        foreach (['user' => 3, 'profile' => 3, 'message' => 3, 'user_message' => 6, 'message_entry' => 8,
            'user_friendship' => 0, 'contentcontainer_blocked_users' => 0, 'file' => 0, 'space' => 0] as $t => $n) {
            if ($count($t) !== $n) { throw new RuntimeException('Unexpected initial C05 baseline.'); }
        }
        $actors = [];
        foreach (['a', 'b'] as $role) { $actors[$role] = ['username' => 'chat_c05_' . $role, 'password' => bin2hex(random_bytes(24))]; }
        $private = ['kind' => 'chat-c05-text-v1', 'nonce' => $chatConfig['nonce'], 'actors' => $actors];
        $handle = fopen($file, 'x'); if (!$handle) { throw new RuntimeException('Private marker refused.'); }
        try { chmod($file, 0600); $bytes = json_encode($private, JSON_THROW_ON_ERROR); if (fwrite($handle, $bytes) !== strlen($bytes) || !fflush($handle)) { throw new RuntimeException('Private marker failed.'); } }
        finally { fclose($handle); }
    }
    chatPrivatePath($file, 0600); $private = json_decode(file_get_contents($file), true, 16, JSON_THROW_ON_ERROR);
    if (($private['kind'] ?? null) !== 'chat-c05-text-v1' || !hash_equals($chatConfig['nonce'], $private['nonce'] ?? '') || array_keys($private['actors'] ?? []) !== ['a', 'b']) { throw new RuntimeException('Private scope changed.'); }
    foreach ($private['actors'] as $role => $record) {
        if (($record['username'] ?? null) !== 'chat_c05_' . $role || preg_match('/^[a-f0-9]{48}$/D', $record['password'] ?? '') !== 1) { throw new RuntimeException('Private shape changed.'); }
    }
    if (!$exists) {
        if ($action !== 'prepare') { throw new RuntimeException('C05 marker absent.'); }
        $db->createCommand()->createTable($table, ['id' => 'integer NOT NULL PRIMARY KEY', 'spec' => 'varchar(64) NOT NULL', 'nonce' => 'char(64) NOT NULL', 'payload_json' => 'text NOT NULL'], 'ENGINE=InnoDB')->execute();
    }
    $marker = $query($table)->where(['id' => 1])->one($db);
    if (!$marker) {
        if ($action !== 'prepare' || $count($table) !== 0 || $count('user') !== 3 || $count('message') !== 3 || $count('message_entry') !== 8 || $count('user_friendship') !== 0) { throw new RuntimeException('Unowned C05 records refused.'); }
        $baselineQueue = $count('queue');
        $stage = 'prepare-owned-synthetic'; $tx = $db->beginTransaction();
        try {
            $users = [];
            foreach ($private['actors'] as $role => $record) {
                $user = new humhub\modules\user\models\User(['username' => $record['username'], 'email' => $record['username'] . '@example.invalid', 'status' => 1, 'language' => 'en-US']);
                if (!$user->save()) { throw new RuntimeException('C05 user failed.'); }
                $user->profile->firstname = 'Synthetic'; $user->profile->lastname = 'Chat C05 ' . $role;
                if (!$user->profile->save()) { throw new RuntimeException('C05 profile failed.'); }
                $password = new humhub\modules\user\models\Password(['user_id' => $user->id]); $password->setPassword($record['password']);
                if (!$password->save()) { throw new RuntimeException('C05 password failed.'); }
                $users[$role] = $user;
            }
            $app->user->switchIdentity($users['a']);
            $message = new humhub\modules\mail\models\Message(['title' => 'Synthetic C05 direct']);
            if (!$message->save()) { throw new RuntimeException('C05 conversation failed.'); }
            foreach (['a', 'b'] as $index => $role) {
                $member = new humhub\modules\mail\models\UserMessage(['message_id' => $message->id, 'user_id' => $users[$role]->id, 'is_originator' => $index === 0 ? 1 : 0]);
                $member->informAfterAdd = false;
                if (!$member->save()) { throw new RuntimeException('C05 member failed.'); }
            }
            // Explicit fixture prerequisites, not a product friendship acceptance workflow.
            foreach ([['a', 'b'], ['b', 'a']] as [$from, $to]) {
                $db->createCommand()->insert('user_friendship', ['user_id' => $users[$from]->id, 'friend_user_id' => $users[$to]->id, 'created_at' => gmdate('Y-m-d H:i:s')])->execute();
            }
            $state = ['actors' => array_map(static fn($u): int => (int)$u->id, $users), 'conversation_id' => (int)$message->id, 'legacy_hash' => $legacyHash, 'queue_count' => $baselineQueue];
            if ($count('queue') !== $baselineQueue) { throw new RuntimeException('Fixture produced unexpected queue work.'); }
            $db->createCommand()->insert($table, ['id' => 1, 'spec' => $private['kind'], 'nonce' => $chatConfig['nonce'], 'payload_json' => json_encode($state, JSON_THROW_ON_ERROR)])->execute();
            $tx->commit();
        } catch (Throwable $error) { if ($tx->isActive) { $tx->rollBack(); } throw $error; }
        $marker = $query($table)->where(['id' => 1])->one($db);
    }
    $stage = 'validate-owned-scope';
    if ($count($table) !== 1 || $marker['spec'] !== $private['kind'] || !hash_equals($chatConfig['nonce'], $marker['nonce'])) { throw new RuntimeException('C05 marker changed.'); }
    $state = json_decode($marker['payload_json'], true, 16, JSON_THROW_ON_ERROR);
    if (array_keys($state) !== ['actors', 'conversation_id', 'legacy_hash', 'queue_count'] || array_keys($state['actors']) !== ['a', 'b'] || !hash_equals($state['legacy_hash'], $legacyHash)) { throw new RuntimeException('Original C04 records changed.'); }
    $pair = array_values($state['actors']); sort($pair); $id = $state['conversation_id'];
    if (count(array_unique($pair)) !== 2 || array_intersect($pair, $oldActors) || in_array($id, $oldConversations, true)) { throw new RuntimeException('C05 scope overlaps legacy.'); }
    foreach ($state['actors'] as $role => $uid) {
        if (!is_int($uid) || $uid < 1) { throw new RuntimeException('Invalid actor ID.'); }
        $user = humhub\modules\user\models\User::findOne(['id' => $uid, 'username' => $private['actors'][$role]['username'], 'email' => $private['actors'][$role]['username'] . '@example.invalid', 'status' => 1]);
        $password = humhub\modules\user\models\Password::findOne(['user_id' => $uid]);
        if (!$user || !$password || !$password->validatePassword($private['actors'][$role]['password'])) { throw new RuntimeException('C05 actor mismatch.'); }
    }
    if (!$query('message')->where(['id' => $id, 'title' => 'Synthetic C05 direct'])->exists($db)
        || array_map('intval', $query('user_message')->select('user_id')->where(['message_id' => $id])->orderBy('user_id')->column($db)) !== $pair) { throw new RuntimeException('C05 conversation mismatch.'); }
    foreach (['user' => 5, 'profile' => 5, 'message' => 4, 'user_message' => 8, 'file' => 0, 'space' => 0, 'queue' => $state['queue_count']] as $t => $n) {
        if ($count($t) !== $n) { throw new RuntimeException('Unexpected C05 global counts.'); }
    }
    if ($action === 'prepare') { $app->getModule('friendship')->settings->set('enable', '1'); $chat->admission()->acceptExistingDirect($id, $pair, 'chat-c05-text-v1:direct'); }
    $managed = $query('matcher_chat_conversation')->where(['message_id' => $id])->one($db);
    if (!$managed || $managed['status'] !== 'active' || $managed['admission_ref'] !== 'chat-c05-text-v1:direct' || (int)$managed['pair_low'] !== $pair[0] || (int)$managed['pair_high'] !== $pair[1]) { throw new RuntimeException('C05 admission changed.'); }
    $friendWhere = ['or', ['user_id' => $pair[0], 'friend_user_id' => $pair[1]], ['user_id' => $pair[1], 'friend_user_id' => $pair[0]]];
    $friendCount = (int)$query('user_friendship')->where($friendWhere)->count('*', $db);
    if ($friendCount !== $count('user_friendship') || !in_array($friendCount, [0, 2], true)) { throw new RuntimeException('Unowned friendships refused.'); }
    $containerA = (int)$query('user')->select('contentcontainer_id')->where(['id' => $state['actors']['a']])->scalar($db);
    $blockWhere = ['contentcontainer_id' => $containerA, 'user_id' => $state['actors']['b']];
    if ((int)$query('contentcontainer_blocked_users')->where($blockWhere)->count('*', $db) !== $count('contentcontainer_blocked_users')) { throw new RuntimeException('Unowned blocking rows refused.'); }
    $entries = $query('message_entry')->where(['message_id' => $id])->orderBy('id')->all($db);
    if (count($entries) > 32 || $count('message_entry') !== 8 + count($entries)) { throw new RuntimeException('Unbounded or unowned messages refused.'); }
    foreach ($entries as $entry) {
        if (!in_array((int)$entry['user_id'], $pair, true) || (int)$entry['created_by'] !== (int)$entry['user_id'] || (int)$entry['type'] !== 0) { throw new RuntimeException('C05 message attribution changed.'); }
        $receipt = $query('matcher_chat_send_receipt')->where(['entry_id' => $entry['id'], 'message_id' => $id, 'user_id' => $entry['user_id']])->one($db);
        $sequence = $query('matcher_chat_entry_sequence')->where(['entry_id' => $entry['id'], 'message_id' => $id, 'sender_id' => $entry['user_id']])->one($db);
        $text = humhub\modules\matcherChat\adapters\native\NativeProjection::text($entry['content']);
        if (!$receipt || !$sequence || (int)$receipt['seq'] !== (int)$sequence['seq'] || !hash_equals($receipt['body_hash'], hash('sha256', $text))) { throw new RuntimeException('C05 send receipt mismatch.'); }
    }
    if ($count('matcher_chat_send_receipt') !== count($entries)) { throw new RuntimeException('Unowned send receipts refused.'); }
    $stage = 'fixed-relation-transition';
    if ($action === 'unfriend') { $db->createCommand()->delete('user_friendship', $friendWhere)->execute(); }
    if ($action === 'refriend' && $friendCount === 0) {
        $tx = $db->beginTransaction();
        try {
            foreach ([[$pair[0], $pair[1]], [$pair[1], $pair[0]]] as [$from, $to]) { $db->createCommand()->insert('user_friendship', ['user_id' => $from, 'friend_user_id' => $to, 'created_at' => gmdate('Y-m-d H:i:s')])->execute(); }
            $tx->commit();
        } catch (Throwable $error) { if ($tx->isActive) { $tx->rollBack(); } throw $error; }
    }
    if ($action === 'block' && !$query('contentcontainer_blocked_users')->where($blockWhere)->exists($db)) { $db->createCommand()->insert('contentcontainer_blocked_users', $blockWhere)->execute(); }
    if ($action === 'unblock') { $db->createCommand()->delete('contentcontainer_blocked_users', $blockWhere)->execute(); }
    $stage = 'snapshot';
    $read = $query('matcher_chat_read_state')->select(['user_id', 'read_seq', 'generation'])->where(['message_id' => $id])->orderBy('user_id')->all($db);
    $nativeSeen = $query('user_message')->select(['user_id', 'last_viewed'])->where(['message_id' => $id])->orderBy('user_id')->all($db);
    $result = ['status' => 'passed', 'action' => $action, 'fixture' => $private['kind'], 'database' => $chatConfig['database'],
        'synthetic_ids' => ['actors' => $state['actors'], 'conversation_id' => $id, 'old_conversations' => $old['conversations'], 'old_outsider' => $old['actors']['outsider']],
        'legacy_preserved' => true, 'legacy_hash' => $legacyHash, 'message_count' => count($entries), 'total_message_count' => $count('message_entry'),
        'messages_hash' => hash('sha256', json_encode($entries, JSON_THROW_ON_ERROR)), 'last_seq' => (int)$managed['last_seq'],
        'read_state' => $read, 'native_seen' => $nativeSeen, 'friendship_rows' => $count('user_friendship'), 'blocked_rows' => $count('contentcontainer_blocked_users'),
        'queue_count' => $count('queue'), 'credentials_returned' => false];
    ob_end_clean(); echo PHP_EOL, '__CHAT_CONTROL_RESULT__', PHP_EOL, json_encode($result, JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    while (ob_get_level() > 0) { ob_end_clean(); }
    fwrite(STDERR, json_encode(['status' => 'failed', 'stage' => $stage, 'type' => get_class($error), 'reason' => 'Fixed C05 synthetic scope refused.']) . PHP_EOL); exit(1);
}
