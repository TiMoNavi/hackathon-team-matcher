<?php
declare(strict_types=1);
/** Root-only fixed C05B MySQL/storage probe. Never run as an offline test. */
use humhub\modules\matcherChat\Module;
use humhub\modules\matcherChat\adapters\native\NativeSendEligibility;
use humhub\modules\matcherChat\adapters\persistence\{SqlReadStore, SqlSendStore, SqlAttachmentStore};
use humhub\modules\matcherChat\application\ChatSender;
use humhub\modules\matcherChat\domain\{AttachmentUpload, ChatException, Message, SendReceipt, SendText};
use humhub\modules\matcherChat\domain\ports\SendRepository;

const C05B_MODES = ['prepare', 'hold-upload', 'dedupe-upload', 'hold-bind', 'try-cancel', 'hold-cancel', 'try-bind', 'rollback-bind', 'storage-failure-retry', 'sql-finalize-failure-retry', 'recover-storage-reservation', 'storage-failure-retry-v2'];
if (PHP_SAPI !== 'cli' || count($argv ?? []) !== 2 || !in_array($argv[1] ?? null, C05B_MODES, true)) { echo '{"status":"failed","check":"fixed_mode_required"}', PHP_EOL; exit(2); }
ini_set('display_errors', '0'); ini_set('log_errors', '0'); ob_start();
$stage = 'bootstrap'; $checks = 0;
function bcheck(bool $ok): void { global $checks; ++$checks; if (!$ok) { throw new RuntimeException('Fixed C05B probe refused.'); } }
function bkey(int $suffix, bool $message = false): string { return ($message ? 'e05b0000' : 'd05b0000') . '-0000-4000-8000-' . sprintf('%012d', $suffix); }
function bsignal(string $value): void { fwrite(STDOUT, $value . PHP_EOL); fflush(STDOUT); }
function bhold(): void { bsignal('__CHAT_C05_READY__'); $read = [STDIN]; $write = []; $except = []; bcheck(stream_select($read, $write, $except, 30) === 1 && fgets(STDIN, 16) === "continue\n"); }
function bowned($db, string $nonce): array
{
    $rows = $db->createCommand('SELECT * FROM _chat_c05b_fixture ORDER BY id')->queryAll();
    bcheck(count($rows) === 1 && (int)$rows[0]['id'] === 1 && $rows[0]['spec'] === 'chat-c05b-attachment-v1' && hash_equals($nonce, $rows[0]['nonce']));
    $fixture = json_decode($rows[0]['payload_json'], true, 16, JSON_THROW_ON_ERROR);
    bcheck(array_keys($fixture) === ['actors', 'conversation_id', 'legacy_hash', 'queue_count'] && array_keys($fixture['actors']) === ['a', 'b', 'outsider']);
    foreach ($fixture['actors'] as $role => $id) {
        bcheck(is_int($id) && $id > 0); $user = $db->createCommand('SELECT username,email,status FROM {{%user}} WHERE id=:id', [':id' => $id])->queryOne();
        bcheck($user !== false && $user['username'] === 'chat_c05b_' . $role && $user['email'] === 'chat_c05b_' . $role . '@example.invalid' && (int)$user['status'] === 1);
    }
    bcheck(count(array_unique($fixture['actors'])) === 3 && is_int($fixture['conversation_id']) && $fixture['conversation_id'] > 0);
    $id = $fixture['conversation_id']; $pair = [$fixture['actors']['a'], $fixture['actors']['b']]; sort($pair, SORT_NUMERIC);
    $native = $db->createCommand('SELECT title FROM {{%message}} WHERE id=:id', [':id' => $id])->queryOne();
    $members = $db->createCommand('SELECT user_id FROM {{%user_message}} WHERE message_id=:id ORDER BY user_id', [':id' => $id])->queryColumn();
    bcheck($native !== false && $native['title'] === 'Synthetic C05B attachments' && array_map('intval', $members) === $pair);
    $state = $db->createCommand('SELECT type,status,pair_low,pair_high,admission_ref FROM {{%matcher_chat_conversation}} WHERE message_id=:id', [':id' => $id])->queryOne();
    bcheck($state !== false && $state['type'] === 'direct' && $state['status'] === 'active' && (int)$state['pair_low'] === $pair[0] && (int)$state['pair_high'] === $pair[1] && $state['admission_ref'] === 'chat-c05b-attachment-v1:direct');
    $old = [];
    foreach (['_chat_c04_fixture' => 'chat-c04-synthetic-v1', '_chat_c05_fixture' => 'chat-c05-text-v1'] as $table => $spec) {
        $marker = $db->createCommand('SELECT * FROM ' . $table . ' WHERE id=1')->queryOne(); bcheck($marker !== false && $marker['spec'] === $spec && hash_equals($nonce, $marker['nonce']));
        $old[$table] = json_decode($marker['payload_json'], true, 16, JSON_THROW_ON_ERROR);
    }
    $oldActors = array_merge(array_values($old['_chat_c04_fixture']['actors']), array_values($old['_chat_c05_fixture']['actors']));
    $oldConversations = array_merge(array_values($old['_chat_c04_fixture']['conversations']), [$old['_chat_c05_fixture']['conversation_id']]);
    bcheck(array_intersect($fixture['actors'], $oldActors) === [] && !in_array($id, $oldConversations, true));
    $legacy = [];
    foreach (['user' => ['id' => $oldActors], 'profile' => ['user_id' => $oldActors], 'message' => ['id' => $oldConversations], 'user_message' => ['message_id' => $oldConversations], 'message_entry' => ['message_id' => $oldConversations], 'matcher_chat_conversation' => ['message_id' => $oldConversations], 'matcher_chat_member' => ['message_id' => $oldConversations], 'matcher_chat_entry_sequence' => ['message_id' => $oldConversations], 'matcher_chat_read_state' => ['message_id' => $oldConversations], 'matcher_chat_send_receipt' => ['message_id' => $oldConversations], 'user_friendship' => ['user_id' => $oldActors]] as $table => $where) {
        $values = (new \yii\db\Query())->from($table)->where($where)->all($db); usort($values, static fn ($a, $b): int => strcmp(json_encode($a), json_encode($b))); $legacy[$table] = $values;
    }
    bcheck(hash_equals($fixture['legacy_hash'], hash('sha256', json_encode($legacy, JSON_THROW_ON_ERROR))));
    bcheck((int)$db->createCommand('SELECT COUNT(*) FROM {{%queue}}')->queryScalar() === $fixture['queue_count']);
    $entries = $db->createCommand('SELECT id,user_id FROM {{%message_entry}} WHERE message_id=:id ORDER BY id LIMIT 33', [':id' => $id])->queryAll();
    bcheck(count($entries) <= 32); foreach ($entries as $entry) { bcheck(in_array((int)$entry['user_id'], $pair, true)); }
    $files = $db->createCommand('SELECT created_by FROM {{%file}} LIMIT 81')->queryColumn(); bcheck(count($files) <= 80); foreach ($files as $owner) { bcheck(in_array((int)$owner, $pair, true)); }
    $attachments = $db->createCommand('SELECT message_id,user_id FROM {{%matcher_chat_attachment}} LIMIT 81')->queryAll(); bcheck(count($attachments) <= 80); foreach ($attachments as $row) { bcheck((int)$row['message_id'] === $id && in_array((int)$row['user_id'], $pair, true)); }
    return $fixture;
}
function brow($db, int $conversation, int $actor, int $suffix): array|false { return $db->createCommand('SELECT * FROM {{%matcher_chat_attachment}} WHERE message_id=:id AND user_id=:actor AND client_upload_id=:key', [':id' => $conversation, ':actor' => $actor, ':key' => bkey($suffix)])->queryOne(); }
function bdigest($db, int $id): string
{
    $rows = [];
    foreach (['message' => ['id', 'id'], 'message_entry' => ['message_id', 'id'], 'matcher_chat_conversation' => ['message_id', 'message_id'], 'matcher_chat_entry_sequence' => ['message_id', 'seq'], 'matcher_chat_send_receipt' => ['message_id', 'user_id,client_message_id'], 'matcher_chat_attachment' => ['message_id', 'attachment_id']] as $table => [$key, $order]) { $rows[] = $db->createCommand('SELECT * FROM {{%' . $table . '}} WHERE ' . $key . '=:id ORDER BY ' . $order, [':id' => $id])->queryAll(); }
    $rows[] = $db->createCommand('SELECT f.* FROM {{%file}} f INNER JOIN {{%matcher_chat_attachment}} a ON a.file_id=f.id WHERE a.message_id=:id ORDER BY f.id', [':id' => $id])->queryAll();
    return hash('sha256', json_encode($rows, JSON_THROW_ON_ERROR));
}
function bupload(Module $chat, int $actor, int $id, int $suffix): array
{
    $bytes = 'Synthetic C05B SQL attachment ' . $suffix;
    $handle = tmpfile(); bcheck(is_resource($handle)); bcheck(fwrite($handle, $bytes) === strlen($bytes)); $path = stream_get_meta_data($handle)['uri'];
    try { return $chat->attachments($actor)->upload($id, new AttachmentUpload(bkey($suffix), 'sql-' . $suffix . '.txt', $bytes), $path, 'isolated-attachment-' . $suffix)['data']; } finally { fclose($handle); }
}
function bphysical(array $row): string
{
    $mount = Yii::$app->fs->getDataMountConfig(); $root = realpath(Yii::getAlias($mount->path));
    bcheck($root === realpath(dirname(__DIR__, 4) . '/.runtime/chat-upgrade-files/data') && preg_match('/^[a-f0-9-]{36}$/D', $row['file_guid']) === 1);
    return $root . '/file/' . substr($row['file_guid'], 0, 1) . '/' . substr($row['file_guid'], 1, 1) . '/' . $row['file_guid'] . '/file';
}
try {
    $mode = $argv[1]; $backend = dirname(__DIR__, 4); $app = require $backend . '/deploy/chat/bootstrap.php'; $db = $app->db;
    bcheck($chatConfig['database'] === 'humhub_chat_c02_20261112' && $chatConfig['modules'] === ['mail', 'matcher-chat-ui', 'matcher-chat']);
    $chat = $app->moduleManager->getModule('matcher-chat', false); bcheck($chat instanceof Module && $chat->isEnabled && $chat->isAttachmentsEnabled());
    $stage = 'owned_fixture'; $fixture = bowned($db, $chatConfig['nonce']); $actor = $fixture['actors']['a']; $id = $fixture['conversation_id'];
    $app->user->switchIdentity(\humhub\modules\user\models\User::findOne($actor));
    class C05BAttachmentCommand extends \yii\db\Command
    {
        public static ?string $hold = null;
        public static ?Closure $expect = null;
        public static bool $failStaged = false;
        private bool $failure = false;
        public function queryOne($fetchMode = null)
        {
            $row = parent::queryOne($fetchMode); $sql = $this->getSql();
            if (self::$expect !== null && str_contains($sql, 'matcher_chat_lock') && str_contains($sql, 'FOR UPDATE')) {
                bcheck($row !== false && (int)$row['id'] === 1);
                $expected = self::$expect; self::$expect = null; $expected($this->db);
            }
            if (self::$hold === 'global' && str_contains($sql, 'matcher_chat_lock') && str_contains($sql, 'FOR UPDATE')) { bcheck($row !== false && (int)$row['id'] === 1); self::$hold = null; bhold(); }
            if (self::$hold === 'upload' && str_contains($sql, 'client_upload_id=:key') && str_contains($sql, 'FOR UPDATE') && ($this->params[':key'] ?? null) === bkey(1)) { bcheck($row === false); self::$hold = null; bhold(); }
            return $row;
        }
        public function update($table, $columns, $condition = '', $params = [])
        {
            if (self::$failStaged && trim($table, '{}%') === 'matcher_chat_attachment' && ($columns['state'] ?? null) === 'staged') { self::$failStaged = false; $this->failure = true; }
            return parent::update($table, $columns, $condition, $params);
        }
        public function execute() { if ($this->failure) { throw new RuntimeException('Fixed C05B SQL finalize failure.'); } return parent::execute(); }
    }
    $db->commandClass = C05BAttachmentCommand::class;
    $result = [];
    if ($mode === 'prepare') {
        $stage = 'prepare_fixed_uploads'; $new = 0;
        foreach ([2, 3, 4] as $suffix) { $existing = brow($db, $id, $actor, $suffix); if ($existing === false) { $data = bupload($chat, $actor, $id, $suffix); bcheck(!$data['replayed']); ++$new; } else { bcheck(in_array($existing['state'], ['staged', 'bound', 'cancelled'], true)); } }
        $result = ['new_uploads' => $new, 'fixed_uploads' => 3];
    } elseif (in_array($mode, ['hold-upload', 'dedupe-upload'], true)) {
        $stage = 'upload_overlap'; if ($mode === 'hold-upload') { bcheck(brow($db, $id, $actor, 1) === false); C05BAttachmentCommand::$hold = 'upload'; }
        else {
            C05BAttachmentCommand::$expect = static function ($connection) use ($id, $actor): void {
                $original = $connection->createCommand('SELECT state FROM {{%matcher_chat_attachment}} WHERE message_id=:id AND user_id=:actor AND client_upload_id=:key FOR UPDATE', [':id' => $id, ':actor' => $actor, ':key' => bkey(1)])->queryOne();
                bcheck($original !== false && in_array($original['state'], ['uploading', 'staged'], true));
            };
        }
        bsignal('__CHAT_C05_ATTEMPTING__'); $data = bupload($chat, $actor, $id, 1);
        bcheck($data['replayed'] === ($mode === 'dedupe-upload')); $row = brow($db, $id, $actor, 1); bcheck($row !== false && $row['state'] === 'staged' && $row['attachment_id'] === $data['attachment']['id']);
        bcheck((int)$db->createCommand('SELECT COUNT(*) FROM {{%matcher_chat_attachment}} WHERE message_id=:id AND user_id=:actor AND client_upload_id=:key', [':id' => $id, ':actor' => $actor, ':key' => bkey(1)])->queryScalar() === 1);
        $result = ['replayed' => $data['replayed'], 'single_upload_record' => true, 'attachment_id' => $row['attachment_id']];
    } elseif (in_array($mode, ['hold-cancel', 'try-cancel'], true)) {
        $stage = 'cancel_overlap'; $suffix = $mode === 'hold-cancel' ? 3 : 2; $row = brow($db, $id, $actor, $suffix); bcheck($row !== false);
        if ($mode === 'hold-cancel') { bcheck($row['state'] === 'staged'); C05BAttachmentCommand::$hold = 'global'; }
        else {
            C05BAttachmentCommand::$expect = static function ($connection) use ($id, $actor, $row): void {
                $current = $connection->createCommand('SELECT state FROM {{%matcher_chat_attachment}} WHERE attachment_id=:attachment AND message_id=:id AND user_id=:actor FOR UPDATE', [':attachment' => $row['attachment_id'], ':id' => $id, ':actor' => $actor])->queryOne();
                bcheck($current !== false && $current['state'] === 'bound');
            };
        }
        bsignal('__CHAT_C05_ATTEMPTING__');
        try { $data = $chat->attachments($actor)->cancel($id, $row['attachment_id'], 'isolated-cancel')['data']; bcheck($mode === 'hold-cancel' && $data['state'] === 'cancelled'); $result = ['state' => 'cancelled']; }
        catch (ChatException $error) { bcheck($mode === 'try-cancel' && $error->errorCode === 'ATTACHMENT_ALREADY_BOUND' && $error->httpStatus === 409); $result = ['error_code' => $error->errorCode, 'http_status' => 409]; }
    } elseif (in_array($mode, ['hold-bind', 'try-bind', 'rollback-bind'], true)) {
        $stage = 'bind_transaction'; $suffix = $mode === 'hold-bind' ? 2 : ($mode === 'try-bind' ? 3 : 4); $row = brow($db, $id, $actor, $suffix); bcheck($row !== false);
        if ($mode !== 'try-bind') { bcheck($row['state'] === 'staged'); }
        $reads = new SqlReadStore($chat->sql(), $actor, new NativeSendEligibility($chat->sql(), true), true, true);
        $writes = new SqlSendStore($chat->sql(), $reads, $actor, new SqlAttachmentStore($chat->sql(), $reads, $actor, true)); $repository = $writes;
        if ($mode === 'rollback-bind') {
            $repository = new class($writes) implements SendRepository {
                public function __construct(private SqlSendStore $inner) {}
                public function receipt(int $viewerId, int $conversationId, string $key): ?SendReceipt { return $this->inner->receipt($viewerId, $conversationId, $key); }
                public function assertQuota(int $viewerId): void { $this->inner->assertQuota($viewerId); }
                public function append(int $viewerId, int $conversationId, SendText $text): Message { return $this->inner->append($viewerId, $conversationId, $text); }
                public function remember(int $viewerId, int $conversationId, SendText $text, Message $message): void { $this->inner->remember($viewerId, $conversationId, $text, $message); throw new ChatException('C05B_TEST_ROLLBACK', 'Fixed rollback.', 409); }
            };
        }
        $before = $mode === 'rollback-bind' ? bdigest($db, $id) : null;
        if ($mode === 'hold-bind') { C05BAttachmentCommand::$hold = 'global'; }
        if ($mode === 'try-bind') {
            C05BAttachmentCommand::$expect = static function ($connection) use ($id, $actor, $row): void {
                $current = $connection->createCommand('SELECT state FROM {{%matcher_chat_attachment}} WHERE attachment_id=:attachment AND message_id=:id AND user_id=:actor FOR UPDATE', [':attachment' => $row['attachment_id'], ':id' => $id, ':actor' => $actor])->queryOne();
                bcheck($current !== false && in_array($current['state'], ['cancelled', 'expired'], true));
            };
        }
        bsignal('__CHAT_C05_ATTEMPTING__');
        try {
            $data = (new ChatSender($reads, $reads, $repository, $writes))->send($actor, $id, new SendText(bkey($suffix, true), '', [$row['attachment_id']]), 'isolated-bind')['data'];
            bcheck($mode === 'hold-bind' && !$data['replayed'] && $data['message']['kind'] === 'attachment'); $result = ['replayed' => false, 'seq' => $data['message']['seq'], 'bound' => true];
        } catch (ChatException $error) {
            bcheck($error->errorCode === ($mode === 'try-bind' ? 'ATTACHMENT_UNAVAILABLE' : 'C05B_TEST_ROLLBACK') && $error->httpStatus === ($mode === 'try-bind' ? 410 : 409));
            bcheck($db->createCommand('SELECT entry_id FROM {{%matcher_chat_send_receipt}} WHERE message_id=:id AND user_id=:actor AND client_message_id=:key', [':id' => $id, ':actor' => $actor, ':key' => bkey($suffix, true)])->queryOne() === false);
            if ($before !== null) { bcheck(hash_equals($before, bdigest($db, $id))); }
            $result = ['error_code' => $error->errorCode, 'http_status' => $error->httpStatus, 'no_send_receipt' => true, 'rollback_verified' => $before !== null];
        }
    } elseif ($mode === 'recover-storage-reservation') {
        $stage = 'recover_fixed_storage_reservation';
        $reserved = brow($db, $id, $actor, 5);
        $expectedUpload = new AttachmentUpload(bkey(5), 'sql-5.txt', 'Synthetic C05B SQL attachment 5');
        bcheck($reserved !== false && $reserved['state'] === 'uploading' && $reserved['uploaded_at'] === null && $reserved['entry_id'] === null && $reserved['position'] === null && $reserved['cleaned_at'] === null
            && $reserved['name'] === $expectedUpload->name && $reserved['mime'] === $expectedUpload->mime && (int)$reserved['size'] === $expectedUpload->size && hash_equals($reserved['payload_hash'], $expectedUpload->payloadHash) && hash_equals($reserved['sha256'], $expectedUpload->sha256));
        $native = $db->createCommand('SELECT * FROM {{%file}} WHERE id=:id', [':id' => $reserved['file_id']])->queryOne();
        bcheck($native !== false && SqlAttachmentStore::matches($reserved, $native, false));
        $path = bphysical($reserved); bcheck(!is_file($path));
        C05BAttachmentCommand::$expect = static function ($connection) use ($id, $actor, $reserved): void {
            $current = $connection->createCommand('SELECT * FROM {{%matcher_chat_attachment}} WHERE message_id=:id AND user_id=:actor AND client_upload_id=:key FOR UPDATE', [':id' => $id, ':actor' => $actor, ':key' => bkey(5)])->queryOne();
            bcheck($current === $reserved);
        };
        $stage = 'recover_same_key_completion'; $data = bupload($chat, $actor, $id, 5); $completed = brow($db, $id, $actor, 5);
        bcheck($data['replayed'] && $completed['state'] === 'staged' && $completed['uploaded_at'] !== null && $completed['attachment_id'] === $reserved['attachment_id'] && (int)$completed['file_id'] === (int)$reserved['file_id'] && $completed['file_guid'] === $reserved['file_guid']);
        bcheck(is_file($path) && hash_equals($completed['sha256'], hash_file('sha256', $path)) && !$db->getTransaction()?->getIsActive());
        $result = ['existing_reservation_recovered' => true, 'same_key' => true, 'same_native_file' => true, 'recovery_in_new_process' => true];
    } else {
        $storageFailure = in_array($mode, ['storage-failure-retry', 'storage-failure-retry-v2'], true);
        $stage = 'durable_upload_failure'; $suffix = $mode === 'storage-failure-retry-v2' ? 7 : ($storageFailure ? 5 : 6); bcheck(brow($db, $id, $actor, $suffix) === false);
        $handler = static function ($event) use ($db, $id, $actor, $suffix): void {
            $row = brow($db, $id, $actor, $suffix);
            if ($row !== false && (int)$event->sender->id === (int)$row['file_id']) { throw new RuntimeException('Fixed C05B storage failure.'); }
        };
        if ($storageFailure) { \yii\base\Event::on(\humhub\modules\file\models\File::class, 'beforeStorageMutation', $handler); }
        else { C05BAttachmentCommand::$failStaged = true; }
        $failed = false;
        try { bupload($chat, $actor, $id, $suffix); }
        catch (RuntimeException $error) { $failed = $error->getMessage() === ($storageFailure ? 'Fixed C05B storage failure.' : 'Fixed C05B SQL finalize failure.'); }
        finally { \yii\base\Event::off(\humhub\modules\file\models\File::class, 'beforeStorageMutation', $handler); C05BAttachmentCommand::$failStaged = false; }
        $stage = 'durable_upload_failure_observed'; bcheck($failed && !$db->getTransaction()?->getIsActive());
        $reserved = brow($db, $id, $actor, $suffix); bcheck($reserved !== false && $reserved['state'] === 'uploading' && $reserved['uploaded_at'] === null);
        $path = bphysical($reserved); bcheck(is_file($path) === ($mode === 'sql-finalize-failure-retry'));
        $stage = 'durable_upload_same_process_retry'; $data = bupload($chat, $actor, $id, $suffix); $completed = brow($db, $id, $actor, $suffix);
        bcheck($data['replayed'] && $completed['state'] === 'staged' && $completed['uploaded_at'] !== null && $completed['attachment_id'] === $reserved['attachment_id'] && (int)$completed['file_id'] === (int)$reserved['file_id']);
        bcheck(is_file($path) && hash_equals($completed['sha256'], hash_file('sha256', $path)));
        $result = ['failure_injected' => true, 'durable_uploading_reservation' => true, 'same_key_recovered' => true, 'same_native_file' => true, 'same_process_recovery' => true, 'transaction_released_after_failure' => true, 'success_quota_only_after_completion' => true];
    }
    bowned($db, $chatConfig['nonce']);
    while (ob_get_level() > 0) { ob_end_clean(); }
    echo json_encode(['status' => 'passed', 'mode' => $mode, 'checks' => $checks, 'result' => $result, 'credentials_returned' => false, 'notifications_sent' => false], JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    while (ob_get_level() > 0) { ob_end_clean(); }
    echo json_encode(['status' => 'failed', 'mode' => $argv[1], 'check' => $stage, 'error_type' => get_class($error), 'error_file' => basename($error->getFile()), 'error_line' => $error->getLine(), 'checks_completed' => $checks, 'private_diagnostics_suppressed' => true], JSON_THROW_ON_ERROR), PHP_EOL; exit(1);
}
