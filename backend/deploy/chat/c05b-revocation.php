<?php
declare(strict_types=1);

/**
 * Fixed root-owned C05B membership-revocation probe. Never a product endpoint.
 * Only the restricted deploy/chat harness may execute an admitted mode.
 * The native DELETE below verifies database contention, not a native AR workflow.
 */
if (PHP_SAPI !== 'cli' || count($argv) !== 2
    || !in_array($argv[1], ['hold-download', 'revoke-member', 'denied-download'], true)) {
    exit(2);
}

$mode = $argv[1];
ini_set('display_errors', '0');
ini_set('log_errors', '0');
$stage = 'bootstrap';
$checks = 0;
$db = null;
$originalCommandClass = null;
ob_start();

function c05bRevCheck(bool $condition): void
{
    global $checks;
    ++$checks;
    if (!$condition) { throw new RuntimeException('Fixed C05B revocation scope refused.'); }
}

function c05bRevSignal(string $signal): void
{
    c05bRevCheck(fwrite(STDOUT, $signal . PHP_EOL) === strlen($signal) + strlen(PHP_EOL));
    fflush(STDOUT);
}

function c05bRevHold(): void
{
    c05bRevSignal('__CHAT_C05_READY__');
    $read = [STDIN]; $write = []; $except = [];
    c05bRevCheck(stream_select($read, $write, $except, 30) === 1);
    c05bRevCheck(fgets(STDIN, 16) === "continue\n");
}

/** Matches the fixture owner's full legacy hash; never prints any row content. */
function c05bRevLegacy($db, string $nonce): array
{
    $old = [];
    foreach (['_chat_c04_fixture' => 'chat-c04-synthetic-v1', '_chat_c05_fixture' => 'chat-c05-text-v1'] as $table => $spec) {
        $row = $db->createCommand('SELECT spec,nonce,payload_json FROM ' . $table . ' WHERE id=1')->queryOne();
        c05bRevCheck(is_array($row) && $row['spec'] === $spec && hash_equals($nonce, $row['nonce']));
        $old[$table] = json_decode($row['payload_json'], true, 16, JSON_THROW_ON_ERROR);
    }
    $actors = array_merge(array_values($old['_chat_c04_fixture']['actors']), array_values($old['_chat_c05_fixture']['actors']));
    $conversations = array_merge(array_values($old['_chat_c04_fixture']['conversations']), [$old['_chat_c05_fixture']['conversation_id']]);
    c05bRevCheck(count(array_unique($actors)) === 5 && count(array_unique($conversations)) === 4);
    $legacy = [];
    foreach (['user' => ['id' => $actors], 'profile' => ['user_id' => $actors], 'message' => ['id' => $conversations],
        'user_message' => ['message_id' => $conversations], 'message_entry' => ['message_id' => $conversations],
        'matcher_chat_conversation' => ['message_id' => $conversations], 'matcher_chat_member' => ['message_id' => $conversations],
        'matcher_chat_entry_sequence' => ['message_id' => $conversations], 'matcher_chat_read_state' => ['message_id' => $conversations],
        'matcher_chat_send_receipt' => ['message_id' => $conversations], 'user_friendship' => ['user_id' => $actors]] as $table => $where) {
        $rows = (new yii\db\Query())->from($table)->where($where)->all($db);
        usort($rows, static fn(array $a, array $b): int => strcmp(json_encode($a), json_encode($b)));
        $legacy[$table] = $rows;
    }
    c05bRevCheck(count($legacy['message_entry']) === 19 && count($legacy['matcher_chat_send_receipt']) === 11 && count($legacy['user_friendship']) === 2);
    return ['hash' => hash('sha256', json_encode($legacy, JSON_THROW_ON_ERROR)), 'actors' => $actors, 'conversations' => $conversations];
}

function c05bRevScope($db, string $nonce): array
{
    c05bRevCheck((int)$db->createCommand('SELECT COUNT(*) FROM _chat_c05b_fixture')->queryScalar() === 1);
    $marker = $db->createCommand('SELECT spec,nonce,payload_json FROM _chat_c05b_fixture WHERE id=1')->queryOne();
    c05bRevCheck(is_array($marker) && $marker['spec'] === 'chat-c05b-attachment-v1' && hash_equals($nonce, $marker['nonce']));
    $payload = json_decode($marker['payload_json'], true, 16, JSON_THROW_ON_ERROR);
    $keys = array_keys($payload); sort($keys);
    $terminal = array_key_exists('revocation_probe', $payload);
    c05bRevCheck($keys === ($terminal ? ['actors', 'conversation_id', 'legacy_hash', 'queue_count', 'revocation_probe'] : ['actors', 'conversation_id', 'legacy_hash', 'queue_count']));
    c05bRevCheck(is_array($payload['actors']) && array_keys($payload['actors']) === ['a', 'b', 'outsider']);
    foreach (array_merge(array_values($payload['actors']), [$payload['conversation_id']]) as $id) {
        c05bRevCheck(is_int($id) && $id > 0 && $id <= humhub\modules\matcherChat\domain\SafeInteger::MAX);
    }
    c05bRevCheck(count(array_unique($payload['actors'])) === 3);
    c05bRevCheck(is_string($payload['legacy_hash']) && preg_match('/^[a-f0-9]{64}$/D', $payload['legacy_hash']) === 1
        && is_int($payload['queue_count']) && $payload['queue_count'] >= 0);
    if ($terminal) {
        c05bRevCheck($payload['revocation_probe'] === ['spec' => 'chat-c05b-revocation-v1', 'removed_user_id' => $payload['actors']['b']]);
    }
    $legacy = c05bRevLegacy($db, $nonce);
    c05bRevCheck(hash_equals($payload['legacy_hash'], $legacy['hash']));
    c05bRevCheck(array_intersect(array_values($payload['actors']), $legacy['actors']) === []
        && !in_array($payload['conversation_id'], $legacy['conversations'], true));
    foreach ($payload['actors'] as $role => $id) {
        $user = $db->createCommand('SELECT id,username,status FROM {{%user}} WHERE id=:id', [':id' => $id])->queryOne();
        c05bRevCheck(is_array($user) && (int)$user['id'] === $id && $user['username'] === 'chat_c05b_' . $role && (int)$user['status'] === 1);
    }
    $conversation = $payload['conversation_id'];
    $pair = [$payload['actors']['a'], $payload['actors']['b']]; sort($pair, SORT_NUMERIC);
    $message = $db->createCommand('SELECT title,created_by FROM {{%message}} WHERE id=:id', [':id' => $conversation])->queryOne();
    c05bRevCheck(is_array($message) && $message['title'] === 'Synthetic C05B attachments' && (int)$message['created_by'] === $payload['actors']['a']);
    $members = array_map('intval', $db->createCommand('SELECT user_id FROM {{%user_message}} WHERE message_id=:id ORDER BY user_id', [':id' => $conversation])->queryColumn());
    c05bRevCheck($members === ($terminal ? [$payload['actors']['a']] : $pair));
    $managed = $db->createCommand('SELECT type,status,pair_low,pair_high,admission_ref FROM {{%matcher_chat_conversation}} WHERE message_id=:id', [':id' => $conversation])->queryOne();
    c05bRevCheck(is_array($managed) && $managed['type'] === 'direct'
        && (int)$managed['pair_low'] === $pair[0] && (int)$managed['pair_high'] === $pair[1]
        && $managed['admission_ref'] === 'chat-c05b-attachment-v1:direct'
        && in_array($managed['status'], $terminal ? ['active', 'revoked'] : ['active'], true));
    foreach (['user' => 8, 'profile' => 8, 'message' => 5, 'user_message' => ($terminal ? 9 : 10), 'space' => 0, 'queue' => $payload['queue_count']] as $table => $expected) {
        c05bRevCheck((int)$db->createCommand('SELECT COUNT(*) FROM {{%' . $table . '}}')->queryScalar() === $expected);
    }
    return ['marker' => $marker, 'payload' => $payload, 'terminal' => $terminal, 'pair' => $pair];
}

/** Download/revocation must not mutate any message, file, receipt or read position. */
function c05bRevImmutableDigest($db, int $conversation): string
{
    $data = [];
    foreach (['message' => ['id' => $conversation], 'message_entry' => ['message_id' => $conversation],
        'matcher_chat_attachment' => ['message_id' => $conversation], 'matcher_chat_send_receipt' => ['message_id' => $conversation],
        'matcher_chat_read_state' => ['message_id' => $conversation]] as $table => $where) {
        $rows = (new yii\db\Query())->from($table)->where($where)->all($db);
        usort($rows, static fn(array $a, array $b): int => strcmp(json_encode($a), json_encode($b)));
        $data[$table] = $rows;
    }
    $files = (new yii\db\Query())->from('file')->all($db);
    usort($files, static fn(array $a, array $b): int => strcmp(json_encode($a), json_encode($b)));
    $data['file'] = $files;
    return hash('sha256', json_encode($data, JSON_THROW_ON_ERROR));
}

try {
    $app = require __DIR__ . '/bootstrap.php';
    $db = $app->db;
    c05bRevCheck($chatConfig['database'] === 'humhub_chat_c02_20261112'
        && $chatConfig['modules'] === ['mail', 'matcher-chat-ui', 'matcher-chat']);
    $chat = $app->moduleManager->getModule('matcher-chat', false);
    c05bRevCheck($chat instanceof humhub\modules\matcherChat\Module && $chat->isEnabled
        && $chat->isReadingEnabled() && $chat->attachmentDownloadsReady());
    $stage = 'owned-scope';
    $scope = c05bRevScope($db, $chatConfig['nonce']);
    c05bRevCheck($scope['terminal'] === ($mode === 'denied-download'));
    $payload = $scope['payload']; $conversation = $payload['conversation_id'];
    $actorA = $payload['actors']['a']; $actorB = $payload['actors']['b'];
    $row = $db->createCommand('SELECT * FROM {{%matcher_chat_attachment}} WHERE message_id=:message AND user_id=:owner AND state=:state ORDER BY file_id,attachment_id LIMIT 1',
        [':message' => $conversation, ':owner' => $actorA, ':state' => 'bound'])->queryOne();
    c05bRevCheck(is_array($row) && $row['entry_id'] !== null && $row['uploaded_at'] !== null && $row['cleaned_at'] === null);
    humhub\modules\matcherChat\domain\Attachment::uuid($row['attachment_id']);
    $file = $db->createCommand('SELECT * FROM {{%file}} WHERE id=:id', [':id' => $row['file_id']])->queryOne();
    c05bRevCheck(is_array($file) && humhub\modules\matcherChat\adapters\persistence\SqlAttachmentStore::matches($row, $file, true));
    $entry = $db->createCommand('SELECT id,message_id,user_id FROM {{%message_entry}} WHERE id=:id', [':id' => $row['entry_id']])->queryOne();
    c05bRevCheck(is_array($entry) && (int)$entry['message_id'] === $conversation && (int)$entry['user_id'] === $actorA);
    c05bRevCheck((int)$row['size'] >= 1 && (int)$row['size'] <= humhub\modules\matcherChat\domain\Attachment::MAX_BYTES
        && preg_match('/^[a-f0-9]{64}$/D', $row['sha256']) === 1);
    $before = c05bRevImmutableDigest($db, $conversation);
    $result = [];

    if ($mode === 'revoke-member') {
        $stage = 'native-membership-revocation';
        c05bRevSignal('__CHAT_C05_ATTEMPTING__');
        // Deliberately no chat mutex: contend on the real native membership lock.
        $transaction = $db->beginTransaction(yii\db\Transaction::REPEATABLE_READ);
        try {
            $marker = $db->createCommand('SELECT spec,nonce,payload_json FROM _chat_c05b_fixture WHERE id=1 FOR UPDATE')->queryOne();
            c05bRevCheck($marker === $scope['marker']);
            $affected = $db->createCommand()->delete('{{%user_message}}', ['message_id' => $conversation, 'user_id' => $actorB])->execute();
            c05bRevCheck($affected === 1);
            $payload['revocation_probe'] = ['spec' => 'chat-c05b-revocation-v1', 'removed_user_id' => $actorB];
            c05bRevCheck($db->createCommand()->update('_chat_c05b_fixture', ['payload_json' => json_encode($payload, JSON_THROW_ON_ERROR)],
                ['id' => 1, 'spec' => 'chat-c05b-attachment-v1', 'nonce' => $chatConfig['nonce'], 'payload_json' => $marker['payload_json']])->execute() === 1);
            c05bRevCheck(array_map('intval', $db->createCommand('SELECT user_id FROM {{%user_message}} WHERE message_id=:id ORDER BY user_id FOR UPDATE', [':id' => $conversation])->queryColumn()) === [$actorA]);
            c05bRevCheck(hash_equals($before, c05bRevImmutableDigest($db, $conversation)));
            c05bRevCheck(hash_equals($payload['legacy_hash'], c05bRevLegacy($db, $chatConfig['nonce'])['hash']));
            $transaction->commit();
        } catch (Throwable $error) {
            if ($transaction->getIsActive()) { $transaction->rollBack(); }
            throw $error;
        }
        $result = ['removed_native_memberships' => 1, 'terminal_marker_committed' => true, 'native_ar_workflow_tested' => false];
    } else {
        $app->user->switchIdentity(humhub\modules\user\models\User::findOne($actorB));
        if ($mode === 'hold-download') {
            // Keep Yii's real MySQL execution. Pause only after the original query
            // returns successfully, so READY proves the native member rows are locked.
            final class C05BRevocationCommand extends yii\db\Command
            {
                public static int $conversation;
                public static array $pair;
                public static bool $held = false;
                public function queryAll($fetchMode = null)
                {
                    $rows = parent::queryAll($fetchMode);
                    $sql = strtolower(trim(preg_replace('/\s+/', ' ', str_replace(chr(96), '', $this->getSql()))));
                    if (!self::$held && $sql === 'select user_id,created_at,created_by from user_message where message_id=:id order by user_id for update'
                        && (int)($this->params[':id'] ?? 0) === self::$conversation) {
                        c05bRevCheck($this->db->getTransaction()?->getIsActive() === true);
                        c05bRevCheck(array_map('intval', array_column($rows, 'user_id')) === self::$pair);
                        self::$held = true;
                        c05bRevHold();
                    }
                    return $rows;
                }
            }
            C05BRevocationCommand::$conversation = $conversation;
            C05BRevocationCommand::$pair = $scope['pair'];
            $originalCommandClass = $db->commandClass;
            $db->commandClass = C05BRevocationCommand::class;
            $stage = 'locked-authorized-download';
            c05bRevSignal('__CHAT_C05_ATTEMPTING__');
            try { $download = $chat->attachments($actorB)->download($conversation, $row['attachment_id']); }
            finally { $db->commandClass = $originalCommandClass; $originalCommandClass = null; }
            c05bRevCheck(C05BRevocationCommand::$held);
            c05bRevCheck(isset($download['bytes'], $download['attachment']) && is_string($download['bytes'])
                && $download['attachment']->id === $row['attachment_id']);
            $size = strlen($download['bytes']); $hash = hash('sha256', $download['bytes']);
            c05bRevCheck($size === (int)$row['size'] && hash_equals($row['sha256'], $hash));
            unset($download);
            $result = ['locked_download_completed' => true, 'bytes_size' => $size, 'bytes_sha256' => $hash];
        } else {
            $stage = 'post-revocation-download';
            $denied = false; $download = null;
            try { $download = $chat->attachments($actorB)->download($conversation, $row['attachment_id']); }
            catch (humhub\modules\matcherChat\domain\ChatException $error) {
                c05bRevCheck($error->httpStatus === 404 && $error->errorCode === 'CONVERSATION_UNAVAILABLE');
                $denied = true;
            }
            c05bRevCheck($denied && $download === null);
            $managed = $db->createCommand('SELECT status FROM {{%matcher_chat_conversation}} WHERE message_id=:id', [':id' => $conversation])->queryOne();
            c05bRevCheck(is_array($managed) && $managed['status'] === 'revoked');
            $result = ['http_status' => 404, 'error_code' => 'CONVERSATION_UNAVAILABLE', 'bytes_returned' => false, 'admission_revoked' => true];
        }
        c05bRevCheck(hash_equals($before, c05bRevImmutableDigest($db, $conversation)));
        c05bRevCheck(hash_equals($payload['legacy_hash'], c05bRevLegacy($db, $chatConfig['nonce'])['hash']));
    }
    while (ob_get_level() > 0) { ob_end_clean(); }
    echo PHP_EOL, '__CHAT_CONTROL_RESULT__', PHP_EOL, json_encode([
        'status' => 'passed', 'action' => $mode, 'fixture' => 'chat-c05b-attachment-v1',
        'probe' => 'chat-c05b-revocation-v1', 'checks' => $checks, 'legacy_preserved' => true,
        'immutable_message_file_data_preserved' => true, 'credentials_returned' => false,
    ] + $result, JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    if ($db !== null && $originalCommandClass !== null) { $db->commandClass = $originalCommandClass; }
    if ($db !== null && $db->getTransaction()?->getIsActive()) { $db->getTransaction()->rollBack(); }
    while (ob_get_level() > 0) { ob_end_clean(); }
    fwrite(STDERR, json_encode(['status' => 'failed', 'action' => $mode, 'stage' => $stage,
        'type' => get_class($error), 'reason' => 'Fixed revocation probe refused; private diagnostics suppressed.'], JSON_THROW_ON_ERROR) . PHP_EOL);
    exit(1);
}
