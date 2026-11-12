<?php
declare(strict_types=1);
/** Three owned synthetic live records only; no message, email or queue send. */
if (PHP_SAPI !== 'cli' || count($argv) !== 2 || $argv[1] !== 'prepare') { exit(2); }
ob_start(); $stage = 'bootstrap';
try {
    $app = require __DIR__ . '/bootstrap.php'; $db = $app->db;
    $fixture = (new yii\db\Query())->from('_chat_c04_fixture')->where(['id' => 1])->one($db);
    if (!$fixture || $fixture['spec'] !== 'chat-c04-synthetic-v1' || !hash_equals($chatConfig['nonce'], $fixture['nonce'])) { throw new RuntimeException('Unowned fixture.'); }
    $state = json_decode($fixture['payload_json'], true, 16, JSON_THROW_ON_ERROR);
    if (array_keys($state['actors'] ?? []) !== ['a', 'b', 'outsider'] || array_keys($state['conversations'] ?? []) !== ['history', 'empty', 'unmanaged']
        || (int)(new yii\db\Query())->from('user')->count('*', $db) !== 3
        || (int)(new yii\db\Query())->from('message_entry')->count('*', $db) !== 8) { throw new RuntimeException('Unexpected fixture shape.'); }
    $actors = [];
    foreach ($state['actors'] as $role => $id) {
        if (!is_int($id) || $id < 1) { throw new RuntimeException('Invalid synthetic actor.'); }
        $actor = humhub\modules\user\models\User::findOne(['id' => $id, 'username' => 'chat_c04_' . $role]);
        if (!$actor || !(int)$actor->contentcontainer_id) { throw new RuntimeException('Actor mismatch.'); }
        $actors[$role] = $actor;
    }
    foreach ($state['conversations'] as $label => $id) {
        if (!is_int($id) || !(new yii\db\Query())->from('message')->where(['id' => $id, 'title' => 'Synthetic C04 ' . $label])->exists($db)) { throw new RuntimeException('Conversation mismatch.'); }
    }
    $markerPath = $chatRuntime . '/entry-live-fixture.json'; $now = time(); $inserted = 0;
    $stage = 'owned-live-fixture';
    if (file_exists($markerPath) || is_link($markerPath)) {
        chatPrivatePath($markerPath, 0600);
        $marker = json_decode(file_get_contents($markerPath), true, 16, JSON_THROW_ON_ERROR);
        if (array_keys($marker) !== ['spec', 'nonce', 'events'] || $marker['spec'] !== 'chat-entry-live-v1'
            || !hash_equals($chatConfig['nonce'], $marker['nonce']) || array_keys($marker['events']) !== ['a_nonchat', 'a_managed_mail', 'b_unmanaged_mail']) { throw new RuntimeException('Invalid live fixture marker.'); }
        foreach ($marker['events'] as $label => $record) {
            if (array_keys($record) !== ['id', 'container', 'sha256'] || !is_int($record['id']) || $record['id'] < 1) { throw new RuntimeException('Invalid live record.'); }
            $row = (new yii\db\Query())->from('live')->where(['id' => $record['id']])->one($db);
            $role = $label === 'b_unmanaged_mail' ? 'b' : 'a';
            if (!$row || (int)$row['contentcontainer_id'] !== (int)$actors[$role]->contentcontainer_id || (int)$row['contentcontainer_id'] !== $record['container']
                || (int)$row['visibility'] !== humhub\modules\content\models\Content::VISIBILITY_OWNER
                || !hash_equals($record['sha256'], hash('sha256', $row['serialized_data']))) { throw new RuntimeException('Owned live record changed.'); }
        }
        $db->transaction(function () use ($db, $marker, $now): void {
            foreach ($marker['events'] as $record) { $db->createCommand()->update('live', ['created_at' => $now], ['id' => $record['id']])->execute(); }
        });
    } else {
        if ((new yii\db\Query())->from('live')->where(['like', 'serialized_data', 'chat-entry-t1-nonchat'])->exists($db)) { throw new RuntimeException('Untracked live fixture exists.'); }
        $nonchat = new humhub\modules\notification\live\NewNotification([
            'notificationId' => 0, 'notificationGroup' => 'chat-entry-t1-nonchat', 'text' => 'Synthetic chat entry non-chat event',
            'ts' => $now, 'contentContainerId' => (int)$actors['a']->contentcontainer_id,
        ]);
        $managed = new humhub\modules\mail\live\NewUserMessage([
            'user_guid' => $actors['a']->guid, 'message_id' => $state['conversations']['history'], 'contentContainerId' => (int)$actors['a']->contentcontainer_id,
        ]);
        $unmanaged = new humhub\modules\mail\live\NewUserMessage([
            'user_guid' => $actors['b']->guid, 'message_id' => $state['conversations']['unmanaged'], 'contentContainerId' => (int)$actors['b']->contentcontainer_id,
        ]);
        $marker = ['spec' => 'chat-entry-live-v1', 'nonce' => $chatConfig['nonce'], 'events' => []];
        $db->transaction(function () use (&$marker, $nonchat, $managed, $unmanaged, $now): void {
            foreach (['a_nonchat' => $nonchat, 'a_managed_mail' => $managed, 'b_unmanaged_mail' => $unmanaged] as $label => $event) {
                $row = new humhub\modules\live\models\Live(); $row->serialized_data = serialize($event); $row->created_at = $now;
                $row->visibility = $event->visibility; $row->contentcontainer_id = $event->contentContainerId;
                if (!$row->save()) { throw new RuntimeException('Synthetic live insert failed.'); }
                $marker['events'][$label] = ['id' => (int)$row->id, 'container' => (int)$row->contentcontainer_id, 'sha256' => hash('sha256', $row->serialized_data)];
            }
        });
        $oldMask = umask(0077); $handle = fopen($markerPath, 'x'); umask($oldMask);
        if ($handle === false) { throw new RuntimeException('Live marker write failed.'); }
        $encoded = json_encode($marker, JSON_THROW_ON_ERROR) . PHP_EOL;
        if (fwrite($handle, $encoded) !== strlen($encoded)) { fclose($handle); throw new RuntimeException('Incomplete live marker.'); }
        fclose($handle); $inserted = 3;
    }
    $result = ['status' => 'passed', 'action' => 'entry-live-prepare', 'database' => $chatConfig['database'], 'query_since' => $now - 1,
        'inserted_live_records' => $inserted, 'refreshed_owned_timestamps' => $inserted === 0 ? 3 : 0,
        'events' => array_map(static fn(array $r): int => $r['id'], $marker['events']),
        'message_entries' => (int)(new yii\db\Query())->from('message_entry')->count('*', $db),
        'queue_records' => (int)(new yii\db\Query())->from('queue')->count('*', $db), 'mail_sent' => false];
    ob_end_clean(); echo PHP_EOL, '__CHAT_CONTROL_RESULT__', PHP_EOL, json_encode($result, JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    while (ob_get_level() > 0) { ob_end_clean(); }
    fwrite(STDERR, json_encode(['status' => 'failed', 'stage' => $stage, 'type' => get_class($error), 'reason' => 'Fixed live probe refused.']) . PHP_EOL); exit(1);
}
