<?php
declare(strict_types=1);
ob_start(); require __DIR__ . '/native.php'; $base = json_decode(trim(ob_get_clean()), true, 8, JSON_THROW_ON_ERROR); $checks = 0;
use humhub\modules\matcherChat\adapters\persistence\{SqlAttachmentStore, SqlState};
use humhub\modules\matcherChat\adapters\native\NativeGuard;

/** No app, DB or filesystem. Executes actual SQL-selection and matching adapters. */
final class AttachmentSqlSeam extends \yii\db\Connection
{
    public bool $schemaReady = true;
    public array $files = [];
    public array $attachments = [];
    public function getSchema()
    {
        return new class(['db' => $this]) extends \yii\db\Schema {
            protected function loadTableSchema($name) { if (!$this->db->schemaReady) { return null; } $table = new \yii\db\TableSchema(); $table->primaryKey = ['attachment_id']; return $table; }
        };
    }
    public function createCommand($sql = null, $params = [])
    {
        return new class($this, (string)$sql, $params) {
            public function __construct(private AttachmentSqlSeam $db, private string $sql, private array $params) {}
            public function queryOne($mode = null)
            {
                if (str_contains($this->sql, 'information_schema')) { return ['ENGINE' => 'InnoDB']; }
                if (str_contains($this->sql, 'FROM {{%file}}')) {
                    foreach ($this->db->files as $file) { if ((isset($this->params[':guid']) && $file['guid'] === $this->params[':guid']) || (isset($this->params[':id']) && (int)$file['id'] === $this->params[':id'])) { return $file; } } return false;
                }
                if (str_contains($this->sql, 'FROM {{%matcher_chat_attachment}}')) {
                    foreach ($this->db->attachments as $row) { if ((isset($this->params[':guid']) && $row['file_guid'] === $this->params[':guid']) || (isset($this->params[':id']) && (int)$row['file_id'] === $this->params[':id'])) { return ['attachment_id' => $row['attachment_id']]; } } return false;
                }
                if (str_contains($this->sql, 'INNER JOIN {{%message_entry}}') || str_contains($this->sql, 'FROM {{%matcher_chat_entry_sequence}}')) { return ($this->params[':id'] ?? null) === 100 ? ['message_id' => 10] : false; }
                throw new LogicException('Unexpected attachment SQL seam query.');
            }
            public function queryAll($mode = null)
            {
                if (str_contains($this->sql, 'FROM {{%file}} f')) { return $this->db->files; }
                if (str_contains($this->sql, 'FROM {{%matcher_chat_attachment}}')) { return $this->db->attachments; }
                throw new LogicException('Unexpected attachment SQL seam list.');
            }
        };
    }
}
$id = '12345678-1234-4234-8234-123456789012'; $guid = '12345678-1234-4234-8234-123456789013';
$row = ['attachment_id' => $id, 'message_id' => 10, 'user_id' => 1, 'file_id' => 50, 'file_guid' => $guid, 'state' => 'bound', 'name' => 'safe.txt', 'mime' => 'text/plain', 'size' => 4, 'sha256' => hash('sha256', 'safe'), 'entry_id' => 100, 'position' => 0, 'uploaded_at' => 1000];
$file = ['id' => 50, 'guid' => $guid, 'public' => 0, 'standalone' => 1, 'created_by' => 1, 'file_name' => 'safe.txt', 'mime_type' => 'text/plain', 'size' => 4, 'object_model' => SqlAttachmentStore::NATIVE_MODEL, 'object_id' => 100, 'sort_order' => 0];
check(SqlAttachmentStore::matches($row, $file, true), 'exact bound native association');
foreach (['id' => 51, 'guid' => 'changed', 'public' => 1, 'standalone' => 0, 'created_by' => 2, 'file_name' => 'other.txt', 'mime_type' => 'application/pdf', 'size' => 5, 'object_model' => 'other', 'object_id' => 101, 'sort_order' => 1] as $key => $value) { check(!SqlAttachmentStore::matches($row, array_replace($file, [$key => $value]), true), 'native field mismatch denied ' . $key); }
$staged = array_replace($file, ['object_model' => SqlAttachmentStore::STAGED_MODEL, 'object_id' => 50]);
check(SqlAttachmentStore::matches($row, $staged, false), 'protected standalone staged association');
check(!SqlAttachmentStore::matches($row, array_replace($staged, ['object_model' => null, 'object_id' => null]), false), 'unassigned native file is not a valid staged reference');
$db = new AttachmentSqlSeam(); $db->files = [$file]; $db->attachments = [$row]; $sql = new SqlState($db);
$method = new ReflectionMethod(SqlState::class, 'attachmentRows');
check($method->invoke($sql, 10) === [100 => [$row]], 'registered native file preserves conversation');
$db->attachments = []; check($method->invoke($sql, 10) === null, 'unknown native file still revokes');
$db->attachments = [$row]; $db->files = []; check($method->invoke($sql, 10) === null, 'missing registered native file revokes');
$db->files = [$file, array_replace($file, ['id' => 51])]; check($method->invoke($sql, 10) === null, 'additional unknown file cannot sneak into conversation');
$db->files = [$file];
foreach ([-1, 1, 3] as $position) { $db->attachments = [array_replace($row, ['position' => $position])]; check($method->invoke($sql, 10) === null, 'invalid position or gap revokes'); }
$db->attachments = [array_replace($row, ['uploaded_at' => null])]; check($method->invoke($sql, 10) === null, 'uncompleted upload cannot become known bound');
$db->attachments = [$row]; $guard = new NativeGuard($sql);
check($guard->fileManaged($guid) && $guard->fileIdManaged(50), 'registered guid and native numeric id protected');
denied(fn () => $guard->request('rest/file/file/download', ['id' => '50'], [], null), 'REST numeric native download denied');
denied(fn () => $guard->request('file/share-intend/index', ['fileList' => [$guid]], [], 1), 'share-intend registry selection denied');
denied(fn () => $guard->request('file/file/download', ['guid' => $guid, 'token' => 'synthetic-token'], [], null), 'native token download denied');
$db->attachments[0]['state'] = 'cancelled'; $db->files = [];
check($guard->fileManaged($guid) && $guard->fileIdManaged(50), 'cancelled cleaned upload remains permanently guarded by tombstone');
check(!$guard->fileIdManaged(51) && !$guard->fileManaged('12345678-1234-4234-8234-123456789099'), 'unrelated native files unchanged');
$missing = new AttachmentSqlSeam(); $missing->schemaReady = false; $missing->files = [$file];
check($method->invoke(new SqlState($missing), 10) === null, 'missing attachment schema never whitelists native files');
$missing = new AttachmentSqlSeam(); $missing->schemaReady = false;
check($method->invoke(new SqlState($missing), 10) === [], 'old text-only schema remains compatible');
$config = require dirname(__DIR__) . '/config.php';
$events = array_column($config['events'], 1);
check(in_array('beforeStorageMutation', $events, true) && in_array('beforeStorageRead', $events, true), 'native scopes registered as class-level events');
check(isset($config['consoleControllerMap']['chat-attachment']), 'explicit bounded console cleanup registered');
$controller = file_get_contents(dirname(__DIR__) . '/controllers/ApiController.php');
check(str_contains($controller, "property_exists(\$body, 'attachment_ids') ? \$body->attachment_ids : []"), 'HTTP parser distinguishes explicit null from absent attachment_ids');
$source = file_get_contents(dirname(__DIR__) . '/adapters/persistence/SqlAttachmentStore.php');
foreach (['->notify(', 'temporaryUrl(', 'getFileInfos(', 'setStoredFile(', '->off(', 'fileList'] as $forbidden) { check(!str_contains($source, $forbidden), 'adapter avoids unsafe native helper ' . $forbidden); }
echo json_encode(['status' => 'passed', 'checks' => $checks, 'native_checks' => $base['checks'], 'database_connections' => 0, 'http_requests' => 0, 'scope' => 'actual adapter SQL seams, known-file matching and native route registry guards; no DB/storage race acceptance'], JSON_THROW_ON_ERROR), PHP_EOL;
