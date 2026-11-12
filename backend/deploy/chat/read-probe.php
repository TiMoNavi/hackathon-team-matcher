<?php
declare(strict_types=1);
/** Fixed synthetic-fixture observer. Never accepts ids, SQL, credentials or content. */
if (PHP_SAPI !== 'cli' || ($argv[1] ?? '') !== 'snapshot' || count($argv) !== 2) { exit(2); }
ob_start(); $stage = 'bootstrap';
try {
    $app = require __DIR__ . '/bootstrap.php'; $db = $app->db;
    $file = $chatRuntime . '/c04-fixture.json'; chatPrivatePath($file, 0600);
    $private = json_decode(file_get_contents($file), true, 16, JSON_THROW_ON_ERROR);
    $marker = (new yii\db\Query())->from('_chat_c04_fixture')->where(['id' => 1])->one($db);
    if (!$marker || $marker['spec'] !== 'chat-c04-synthetic-v1' || $private['kind'] !== $marker['spec']
        || !hash_equals($chatConfig['nonce'], $marker['nonce']) || !hash_equals($chatConfig['nonce'], $private['nonce'])) {
        throw new RuntimeException('Unowned fixture.');
    }
    $state = json_decode($marker['payload_json'], true, 16, JSON_THROW_ON_ERROR);
    if (!in_array(array_keys($state), [['actors', 'conversations', 'entries'], ['actors', 'conversations', 'entries', 'sql_probe']], true)
        || array_keys($state['actors']) !== ['a', 'b', 'outsider'] || array_keys($state['conversations']) !== ['history', 'empty', 'unmanaged']
        || !array_is_list($state['entries']) || count($state['entries']) !== 7) { throw new RuntimeException('Invalid fixture.'); }
    foreach (['actors', 'conversations', 'entries'] as $key) {
        if (count(array_unique($state[$key])) !== count($state[$key])) { throw new RuntimeException('Duplicate fixture ids.'); }
        foreach ($state[$key] as $id) { if (!is_int($id) || $id < 1 || $id > 9007199254740991) { throw new RuntimeException('Invalid fixture id.'); } }
    }
    $ownedEntries = $state['entries'];
    if (array_key_exists('sql_probe', $state)) {
        $variant = $state['sql_probe'];
        if (!is_array($variant) || array_keys($variant) !== ['spec', 'append_entry_id'] || $variant['spec'] !== 'chat-c04-isolated-sql-v1'
            || !is_int($variant['append_entry_id']) || $variant['append_entry_id'] <= max($ownedEntries)
            || $variant['append_entry_id'] > 9007199254740991) { throw new RuntimeException('Invalid owned variant.'); }
        $ownedEntries[] = $variant['append_entry_id'];
    }
    foreach ($state['actors'] as $role => $id) {
        if (!(new yii\db\Query())->from('user')->where(['id' => $id, 'username' => 'chat_c04_' . $role])->exists($db)) { throw new RuntimeException('Actor mismatch.'); }
    }
    foreach ($state['conversations'] as $label => $id) {
        if (!(new yii\db\Query())->from('message')->where(['id' => $id, 'title' => 'Synthetic C04 ' . $label])->exists($db)) { throw new RuntimeException('Conversation mismatch.'); }
        $expected = $label === 'unmanaged' ? [$state['actors']['b'], $state['actors']['outsider']] : [$state['actors']['a'], $state['actors']['b']]; sort($expected);
        $actual = array_map('intval', (new yii\db\Query())->select('user_id')->from('user_message')->where(['message_id' => $id])->orderBy('user_id')->column($db));
        if ($actual !== $expected) { throw new RuntimeException('Membership mismatch.'); }
    }
    foreach ($ownedEntries as $index => $id) {
        $author = $state['actors'][$index % 2 === 0 ? 'a' : 'b'];
        if (!(new yii\db\Query())->from('message_entry')->where(['id' => $id, 'message_id' => $state['conversations']['history'],
            'user_id' => $author, 'created_by' => $author, 'type' => 0, 'content' => 'Synthetic C04 message ' . ($index + 1)])->exists($db)) { throw new RuntimeException('Entry mismatch.'); }
    }
    if ((int)(new yii\db\Query())->from('message_entry')->count('*', $db) !== count($ownedEntries)) { throw new RuntimeException('Unexpected entry count.'); }
    $stage = 'snapshot';
    $native = (new yii\db\Query())->select(['message_id', 'user_id', 'last_viewed'])->from('user_message')
        ->where(['message_id' => array_values($state['conversations'])])->orderBy(['message_id' => SORT_ASC, 'user_id' => SORT_ASC])->all($db);
    $read = (new yii\db\Query())->select(['message_id', 'user_id', 'generation', 'read_seq'])->from('matcher_chat_read_state')
        ->where(['message_id' => array_values($state['conversations'])])->orderBy(['message_id' => SORT_ASC, 'user_id' => SORT_ASC])->all($db);
    $metadata = (new yii\db\Query())->select(['message_id', 'status', 'version', 'last_seq'])->from('matcher_chat_conversation')
        ->where(['message_id' => array_values($state['conversations'])])->orderBy('message_id')->all($db);
    $result = ['status' => 'passed', 'action' => 'snapshot', 'database' => $chatConfig['database'],
        'synthetic_ids' => ['actors' => $state['actors'], 'conversations' => $state['conversations'], 'entries' => $state['entries']],
        'native_seen' => $native, 'read_state' => $read, 'metadata' => $metadata];
    ob_end_clean(); echo PHP_EOL, '__CHAT_CONTROL_RESULT__', PHP_EOL, json_encode($result, JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $e) {
    while (ob_get_level() > 0) { ob_end_clean(); }
    fwrite(STDERR, json_encode(['status' => 'failed', 'stage' => $stage, 'type' => get_class($e), 'reason' => 'Synthetic observer refused.']) . PHP_EOL); exit(1);
}
