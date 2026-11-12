<?php
declare(strict_types=1);
/** Fixed, owned synthetic direct fixture. No caller ids, SQL or passwords. */
if (PHP_SAPI !== 'cli' || !in_array($argv[1] ?? '', ['fixture-prepare', 'fixture-inspect'], true)) { exit(2); }
ob_start(); $stage = 'bootstrap';
try {
    $action = $argv[1]; $app = require __DIR__ . '/bootstrap.php'; $db = $app->db;
    if ($chatConfig['modules'] !== ['mail', 'matcher-chat-ui', 'matcher-chat']) { throw new RuntimeException('Fixed module set required.'); }
    $module = $app->moduleManager->getModule('matcher-chat', false);
    if (!$module || !$module->isEnabled || !method_exists($module, 'admission')) { throw new RuntimeException('Chat contract absent.'); }
    $file = $chatRuntime . '/c04-fixture.json';
    $count = static fn(string $table): int => (int)(new yii\db\Query())->from($table)->count('*', $db);
    $markerTable = '_chat_c04_fixture'; $markerExists = $db->schema->getTableSchema($markerTable, true) !== null;
    $emptyTables = ['user', 'profile', 'space', 'space_membership', 'user_auth', 'message', 'user_message', 'message_entry', 'file',
        'matcher_chat_conversation', 'matcher_chat_entry_sequence', 'matcher_chat_member', 'matcher_chat_read_state', 'matcher_chat_viewer_revision'];
    if (!file_exists($file)) {
        if ($action !== 'fixture-prepare' || $markerExists || is_link($file)) { throw new RuntimeException('Fixture ownership missing.'); }
        foreach ($emptyTables as $table) { if ($count($table) !== 0) { throw new RuntimeException('Nonempty unowned baseline refused.'); } }
        $actors = [];
        foreach (['a', 'b', 'outsider'] as $role) { $actors[$role] = ['username' => 'chat_c04_' . $role, 'password' => bin2hex(random_bytes(24))]; }
        $value = ['kind' => 'chat-c04-synthetic-v1', 'nonce' => $chatConfig['nonce'], 'actors' => $actors];
        $handle = fopen($file, 'x'); if (!$handle) { throw new RuntimeException('Private fixture creation failed.'); }
        try { chmod($file, 0600); fwrite($handle, json_encode($value, JSON_THROW_ON_ERROR)); fflush($handle); } finally { fclose($handle); }
    }
    chatPrivatePath($file, 0600); $private = json_decode(file_get_contents($file), true, 16, JSON_THROW_ON_ERROR);
    if (($private['kind'] ?? '') !== 'chat-c04-synthetic-v1' || !hash_equals($chatConfig['nonce'], $private['nonce'] ?? '')
        || array_keys($private['actors'] ?? []) !== ['a', 'b', 'outsider']) { throw new RuntimeException('Fixture provenance changed.'); }
    foreach ($private['actors'] as $role => $record) {
        if (($record['username'] ?? '') !== 'chat_c04_' . $role || preg_match('/^[a-f0-9]{48}$/D', $record['password'] ?? '') !== 1) { throw new RuntimeException('Invalid fixture shape.'); }
    }
    $stage = 'fixture-schema';
    if (!$markerExists) {
        if ($action !== 'fixture-prepare') { throw new RuntimeException('Fixture not prepared.'); }
        $db->createCommand()->createTable($markerTable, ['id' => 'integer NOT NULL PRIMARY KEY', 'spec' => 'varchar(64) NOT NULL', 'nonce' => 'char(64) NOT NULL', 'payload_json' => 'text NOT NULL'], 'ENGINE=InnoDB')->execute();
    }
    $marker = (new yii\db\Query())->from($markerTable)->where(['id' => 1])->one($db);
    if (!$marker) {
        if ($action !== 'fixture-prepare' || $count($markerTable) !== 0) { throw new RuntimeException('Incomplete marker.'); }
        foreach ($emptyTables as $table) { if ($count($table) !== 0) { throw new RuntimeException('Unowned data refuses creation.'); } }
        $transaction = $db->beginTransaction();
        try {
            $stage = 'synthetic-users'; $users = [];
            foreach ($private['actors'] as $role => $record) {
                $user = new humhub\modules\user\models\User(['username' => $record['username'], 'email' => $record['username'] . '@example.invalid',
                    'status' => humhub\modules\user\models\User::STATUS_ENABLED, 'language' => 'en-US']);
                if (!$user->save()) { throw new RuntimeException('Synthetic user failed.'); }
                $user->profile->firstname = 'Synthetic'; $user->profile->lastname = 'Chat C04 ' . $role;
                if (!$user->profile->save()) { throw new RuntimeException('Synthetic profile failed.'); }
                $password = new humhub\modules\user\models\Password(['user_id' => $user->id]); $password->setPassword($record['password']);
                if (!$password->save()) { throw new RuntimeException('Synthetic password failed.'); }
                $users[$role] = $user;
            }
            $app->user->switchIdentity($users['a']);
            $stage = 'synthetic-native-conversations'; $conversations = []; $entries = [];
            foreach (['history', 'empty', 'unmanaged'] as $label) {
                $message = new humhub\modules\mail\models\Message(['title' => 'Synthetic C04 ' . $label]);
                if (!$message->save()) { throw new RuntimeException('Synthetic conversation failed.'); }
                $pair = $label === 'unmanaged' ? ['b', 'outsider'] : ['a', 'b'];
                foreach ($pair as $index => $role) {
                    $member = new humhub\modules\mail\models\UserMessage(['message_id' => $message->id, 'user_id' => $users[$role]->id, 'is_originator' => $index === 0 ? 1 : 0]);
                    $member->informAfterAdd = false;
                    if (!$member->save()) { throw new RuntimeException('Synthetic member failed.'); }
                }
                $conversations[$label] = (int)$message->id;
                if ($label === 'history') {
                    for ($index = 1; $index <= 7; ++$index) {
                        $author = $users[$index % 2 === 1 ? 'a' : 'b']; $app->user->switchIdentity($author);
                        $entry = humhub\modules\mail\models\MessageEntry::createForMessage($message, $author, 'Synthetic C04 message ' . $index);
                        if (!$entry->save()) { throw new RuntimeException('Synthetic entry failed.'); } $entries[] = (int)$entry->id;
                    }
                }
            }
            $payload = ['actors' => array_map(static fn($u): int => (int)$u->id, $users), 'conversations' => $conversations, 'entries' => $entries];
            $db->createCommand()->insert($markerTable, ['id' => 1, 'spec' => $private['kind'], 'nonce' => $chatConfig['nonce'], 'payload_json' => json_encode($payload, JSON_THROW_ON_ERROR)])->execute();
            $transaction->commit();
        } catch (Throwable $e) { if ($transaction->isActive) { $transaction->rollBack(); } throw $e; }
        $marker = (new yii\db\Query())->from($markerTable)->where(['id' => 1])->one($db);
    }
    $stage = 'verify-fixture';
    if ($count($markerTable) !== 1 || $marker['spec'] !== $private['kind'] || !hash_equals($chatConfig['nonce'], $marker['nonce'])) { throw new RuntimeException('Marker mismatch.'); }
    $state = json_decode($marker['payload_json'], true, 16, JSON_THROW_ON_ERROR);
    foreach ($state['actors'] as $role => $id) {
        $record = $private['actors'][$role];
        $user = humhub\modules\user\models\User::findOne(['id' => $id, 'username' => $record['username'], 'email' => $record['username'] . '@example.invalid', 'status' => humhub\modules\user\models\User::STATUS_ENABLED]);
        $password = humhub\modules\user\models\Password::findOne(['user_id' => $id]);
        if (!$user || !$password || !$password->validatePassword($record['password'])) { throw new RuntimeException('Synthetic actor mismatch.'); }
    }
    foreach ($state['conversations'] as $label => $id) {
        if (!humhub\modules\mail\models\Message::findOne(['id' => $id, 'title' => 'Synthetic C04 ' . $label])) { throw new RuntimeException('Conversation mismatch.'); }
        $expected = $label === 'unmanaged' ? [$state['actors']['b'], $state['actors']['outsider']] : [$state['actors']['a'], $state['actors']['b']]; sort($expected);
        $actual = array_map('intval', (new yii\db\Query())->select('user_id')->from('user_message')->where(['message_id' => $id])->orderBy('user_id')->column($db));
        if ($actual !== $expected) { throw new RuntimeException('Membership mismatch.'); }
    }
    foreach (['user' => 3, 'profile' => 3, 'message' => 3, 'user_message' => 6, 'message_entry' => 7, 'file' => 0, 'space' => 0] as $table => $expected) {
        if ($count($table) !== $expected) { throw new RuntimeException('Fixture count mismatch.'); }
    }
    if (count($state['entries'] ?? []) !== 7 || count(array_unique($state['entries'])) !== 7) { throw new RuntimeException('Fixture entry ownership invalid.'); }
    foreach ($state['entries'] as $index => $id) {
        $row = (new yii\db\Query())->from('message_entry')->where(['id' => $id])->one($db);
        $author = $state['actors'][$index % 2 === 0 ? 'a' : 'b'];
        if (!$row || (int)$row['message_id'] !== $state['conversations']['history'] || (int)$row['user_id'] !== $author
            || (int)$row['created_by'] !== $author || (int)$row['type'] !== 0 || $row['content'] !== 'Synthetic C04 message ' . ($index + 1)) {
            throw new RuntimeException('Synthetic entry ownership/content mismatch.');
        }
    }
    $stage = 'admit-owned-direct';
    if ($action === 'fixture-prepare') {
        foreach (['history', 'empty'] as $label) { $module->admission()->acceptExistingDirect($state['conversations'][$label], [$state['actors']['a'], $state['actors']['b']], 'chat-c04-synthetic-v1:' . $label); }
    }
    if ($count('matcher_chat_conversation') !== 2) { throw new RuntimeException('Unexpected admitted conversation count.'); }
    $pair = [$state['actors']['a'], $state['actors']['b']]; sort($pair);
    foreach (['history', 'empty'] as $label) {
        $row = (new yii\db\Query())->from('matcher_chat_conversation')->where(['message_id' => $state['conversations'][$label]])->one($db);
        if (!$row || $row['status'] !== 'active' || $row['type'] !== 'direct' || (int)$row['pair_low'] !== $pair[0] || (int)$row['pair_high'] !== $pair[1]
            || $row['admission_ref'] !== 'chat-c04-synthetic-v1:' . $label || (int)$row['last_seq'] !== ($label === 'history' ? 7 : 0)) {
            throw new RuntimeException('Admission provenance mismatch.');
        }
    }
    if ((new yii\db\Query())->from('matcher_chat_conversation')->where(['message_id' => $state['conversations']['unmanaged']])->exists($db)) { throw new RuntimeException('Unmanaged fixture was admitted.'); }
    $result = ['status' => 'passed', 'action' => $action, 'database' => $chatConfig['database'], 'fixture' => $private['kind'],
        'synthetic_users' => 3, 'native_conversations' => 3, 'admitted_direct' => $count('matcher_chat_conversation'), 'native_entries' => 7,
        'seeded_users' => true, 'real_provider_authentication' => false, 'real_user_data_used' => false, 'credentials_returned' => false];
    ob_end_clean(); echo PHP_EOL, '__CHAT_CONTROL_RESULT__', PHP_EOL, json_encode($result, JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    while (ob_get_level() > 0) { ob_end_clean(); }
    fwrite(STDERR, json_encode(['status' => 'failed', 'stage' => $stage, 'reason' => 'Owned synthetic fixture refused; private diagnostics suppressed.']) . PHP_EOL); exit(1);
}
