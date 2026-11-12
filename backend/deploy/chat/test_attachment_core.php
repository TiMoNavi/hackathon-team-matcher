<?php
declare(strict_types=1);

/**
 * Real Yii + HumHub core-hook regression, with in-memory AR/FS boundaries.
 * No application bootstrap, configuration, credentials, database, HTTP or disk writes.
 * These tests prove hook ordering, not matcher-chat's authorization policy.
 */
$backend = dirname(__DIR__, 2);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');

use humhub\modules\file\components\StorageManager;
use humhub\modules\file\models\File;
use League\Flysystem\{DirectoryAttributes, DirectoryListing, FileAttributes, Filesystem};
use yii\base\Event;

final class AttachmentHookVeto extends RuntimeException {}

final class AttachmentHookFilesystem extends Filesystem
{
    public array $calls = [];
    public array $bytes = [];
    public bool $failMime = false;
    public function __construct() {}
    public function read(string $location): string
    { $this->calls[] = ['read', $location]; return $this->bytes[$location]; }
    public function readStream(string $location)
    {
        $this->calls[] = ['readStream', $location];
        $stream = fopen('php://memory', 'w+');
        fwrite($stream, $this->bytes[$location]); rewind($stream); return $stream;
    }
    public function fileSize(string $path): int
    { $this->calls[] = ['fileSize', $path]; return strlen($this->bytes[$path]); }
    public function mimeType(string $path): string
    {
        $this->calls[] = ['mimeType', $path];
        if ($this->failMime) { throw new RuntimeException('synthetic MIME failure'); }
        return 'text/plain';
    }
    public function checksum(string $path, array $config = []): string
    { $this->calls[] = ['checksum', $path]; return hash($config['checksum_algo'] ?? 'sha1', $this->bytes[$path]); }
    public function write(string $location, string $contents, array $config = []): void
    {
        $this->calls[] = ['write', $location, $config];
        $this->bytes[$location] = $contents;
    }
    public function writeStream(string $location, $contents, array $config = []): void
    {
        $this->calls[] = ['writeStream', $location, $config];
        $this->bytes[$location] = stream_get_contents($contents);
        fclose($contents);
    }
    public function fileExists(string $location): bool
    {
        $this->calls[] = ['fileExists', $location];
        return array_key_exists($location, $this->bytes);
    }
    public function listContents(string $location, bool $deep = self::LIST_SHALLOW): DirectoryListing
    {
        $this->calls[] = ['listContents', $location, $deep];
        $items = [new DirectoryAttributes($location . '/nested')];
        foreach (array_keys($this->bytes) as $path) {
            if (str_starts_with($path, $location . '/')) { $items[] = new FileAttributes($path); }
        }
        return new DirectoryListing($items);
    }
    public function delete(string $location): void
    {
        $this->calls[] = ['delete', $location];
        unset($this->bytes[$location]);
    }
    public function deleteDirectory(string $location): void
    {
        $this->calls[] = ['deleteDirectory', $location];
    }
}

final class AttachmentHookFile extends File
{
    public static array $updates = [];
    public int $storeReads = 0;
    public ?StorageManager $testStore = null;
    public function attributes()
    {
        return ['id', 'guid', 'object_model', 'object_id', 'file_name', 'mime_type', 'created_by', 'standalone', 'size'];
    }
    public function behaviors() { return []; }
    public static function primaryKey() { return ['id']; }
    public static function updateAll($attributes, $condition = '', $params = [])
    {
        self::$updates[] = [$attributes, $condition, $params];
        return 1;
    }
    public function getStore()
    {
        $this->storeReads++;
        if ($this->testStore === null) { throw new RuntimeException('Unexpected getStore call'); }
        return $this->testStore;
    }
}

// The actual FileHistory::deleteAll path reaches only this in-memory command.
$historyBoundary = new class {
    public array $calls = [];
    public function getDb() { $this->calls[] = ['getDb']; return $this; }
    public function createCommand() { $this->calls[] = ['createCommand']; return $this; }
    public function delete($table, $condition, $params)
    { $this->calls[] = ['delete', $table, $condition, $params]; return $this; }
    public function execute() { $this->calls[] = ['execute']; return 1; }
};
Yii::$app = $historyBoundary;
$checks = 0;
$check = static function (bool $condition, string $label) use (&$checks): void {
    $checks++;
    if (!$condition) { throw new RuntimeException($label); }
};
$vetoed = static function (callable $operation, string $label) use ($check): void {
    try { $operation(); } catch (AttachmentHookVeto $error) {
        $check($error->getMessage() === 'synthetic mutation veto', $label . ': exact exception propagated');
        return;
    }
    throw new RuntimeException($label . ': operation was not vetoed');
};
$file = static function (?string $model = null, bool $saved = true): AttachmentHookFile {
    $record = new AttachmentHookFile();
    $attributes = [
        'id' => 71, 'guid' => 'ab000000-0000-4000-8000-000000000071',
        'object_model' => $model, 'object_id' => $model === null ? null : 91,
        'file_name' => 'synthetic.txt', 'mime_type' => 'text/plain', 'created_by' => 11, 'standalone' => 0, 'size' => 0,
    ];
    foreach ($attributes as $name => $value) { $record->setAttribute($name, $value); }
    if ($saved) { $record->setOldAttributes($record->getAttributes()); }
    return $record;
};
$store = static function (AttachmentHookFile $record): array {
    $manager = (new ReflectionClass(StorageManager::class))->newInstanceWithoutConstructor();
    $manager->fs = new AttachmentHookFilesystem();
    $manager->setFile($record);
    $record->testStore = $manager;
    return [$manager, $manager->fs];
};
$seen = [];
$deny = static function (Event $event) use (&$seen): void {
    $record = $event->sender;
    $seen[] = [$record, $record->getAttributes(), $record->getOldAttributes()];
    throw new AttachmentHookVeto('synthetic mutation veto');
};

try {
    Event::on(File::class, File::EVENT_BEFORE_STORAGE_MUTATION, $deny);
    $record = $file('managed');
    $vetoed(static fn() => $record->beforeDelete(), 'delete veto before store/history');
    $check($record->storeReads === 0, 'delete never requests storage');
    $check($historyBoundary->calls === [], 'delete never reaches FileHistory persistence');

    foreach ([true, false] as $saved) {
        foreach ([true, false] as $skipHistory) {
            foreach (['content', 'file'] as $operation) {
                $record = $file('managed', $saved);
                $vetoed(static function () use ($record, $operation, $skipHistory): void {
                    if ($operation === 'content') { $record->setStoredFileContent('synthetic', $skipHistory); }
                    else { $record->setStoredFile('synthetic-absent-path', $skipHistory); }
                }, 'beforeNewStoredFile ' . $operation);
                $check($record->storeReads === 0, 'new-content veto precedes store/history/variants');
                $check($historyBoundary->calls === [], 'new-content veto never reaches history persistence');
            }
        }
    }

    foreach (['setContent', 'setByPath', 'delete'] as $operation) {
        $record = $file('managed');
        [$manager, $fs] = $store($record);
        $vetoed(static function () use ($manager, $operation): void {
            if ($operation === 'setContent') { $manager->setContent('synthetic'); }
            elseif ($operation === 'setByPath') { $manager->setByPath('not-a-real-file://must-never-open'); }
            else { $manager->delete(null, ['old-*']); }
        }, 'storage ' . $operation);
        $check($fs->calls === [], 'storage veto precedes all FS operations');
        $check($fs->bytes === [], 'storage veto does not change bytes');
    }
    Event::off(File::class, File::EVENT_BEFORE_STORAGE_MUTATION, $deny);

    Event::on(File::class, File::EVENT_BEFORE_STORAGE_READ, $deny);
    foreach (['getPath', 'get', 'variant', 'has', 'fileSize', 'mimeType', 'getContent', 'getContentStream', 'checksum', 'getVariants', 'setContent', 'setByPath', 'delete'] as $operation) {
        $record = $file('managed');
        [$manager, $fs] = $store($record);
        $vetoed(static function () use ($manager, $operation): void {
            if ($operation === 'getPath') { (new ReflectionMethod(StorageManager::class, 'getPath'))->invoke($manager); }
            elseif ($operation === 'variant') { $manager->get('old-1'); }
            elseif ($operation === 'setContent') { $manager->setContent('synthetic'); }
            elseif ($operation === 'setByPath') { $manager->setByPath('not-a-real-file://must-never-open'); }
            else { $manager->$operation(); }
        }, 'read authorization on ' . $operation);
        $check($fs->calls === [] && $fs->bytes === [], 'read veto prevents all storage access on ' . $operation);
    }
    $record = $file('managed'); $record->guid = '';
    [$manager] = $store($record);
    $vetoed(static fn() => $manager->get(), 'read authorization precedes GUID validation/path derivation');
    Event::off(File::class, File::EVENT_BEFORE_STORAGE_READ, $deny);

    // A synthetic class-event scope verifies hook composition only. NativeFileStore's
    // real transaction/identity permission is tested separately by matcher-chat owners.
    $scope = null;
    $scoped = static function (Event $event) use (&$scope): void {
        if ($scope === null || $event->sender->id !== $scope['id'] || $event->sender->guid !== $scope['guid']) {
            throw new AttachmentHookVeto('synthetic mutation veto');
        }
    };
    Event::on(File::class, File::EVENT_BEFORE_STORAGE_READ, $scoped);
    Event::on(File::class, File::EVENT_BEFORE_STORAGE_MUTATION, $scoped);
    $record = $file('managed'); [$manager, $fs] = $store($record);
    $vetoed(static fn() => $manager->getContent(), 'read without scope');
    $vetoed(static fn() => $manager->setContent('blocked'), 'write without scope');
    try {
        $scope = ['id' => $record->id, 'guid' => $record->guid];
        $manager->setContent('scoped');
        $check($manager->getContent() === 'scoped', 'scope permits original read/write');
        $check($manager->checksum(null, 'sha256') === hash('sha256', 'scoped'), 'scope permits integrity read');
        $manager->setByPath('data://text/plain,scoped%20variant', 'preview');
        $check($manager->getContent('preview') === 'scoped variant', 'scope permits streamed variant write/read');
        $other = $file('managed'); $other->id = 72; $other->guid = 'ab000000-0000-4000-8000-000000000072';
        [$otherStore, $otherFs] = $store($other);
        $vetoed(static fn() => $otherStore->getContent(), 'scope cannot read another native file');
        $vetoed(static fn() => $otherStore->delete(), 'scope cannot delete another native file');
        $check($otherFs->calls === [], 'wrong-file scope performs no FS operation');
        $manager->delete();
        $check($fs->bytes === [], 'scope permits cleanup with both read and mutation hooks');
    } finally { $scope = null; }
    $vetoed(static fn() => $manager->get(), 'scope cannot leak beyond finally');
    Event::off(File::class, File::EVENT_BEFORE_STORAGE_READ, $scoped);
    Event::off(File::class, File::EVENT_BEFORE_STORAGE_MUTATION, $scoped);

    // Real Yii class events survive Component::__clone; instance-only handlers do not.
    $gate = static function (Event $event) use (&$seen): void {
        $record = $event->sender;
        $seen[] = [$record, $record->getAttributes(), $record->getOldAttributes()];
        if ($record->object_model === 'managed' || $record->getOldAttribute('object_model') === 'managed') {
            throw new AttachmentHookVeto('synthetic mutation veto');
        }
    };
    Event::on(File::class, File::EVENT_BEFORE_STORAGE_MUTATION, $gate);

    $record = $file('managed');
    $before = $record->getAttributes();
    $seen = [];
    $vetoed(static fn() => $record->updateAttributes(['object_model' => null, 'object_id' => null]), 'current managed association');
    $check(count($seen) === 1 && $seen[0][0] === $record, 'current event veto stops before clone');
    $check($record->getAttributes() === $before, 'current veto retains attributes');
    $check($record->getOldAttributes() === $before, 'current veto retains old attributes');
    $check(AttachmentHookFile::$updates === [], 'current veto reaches no AR write');

    $record = $file();
    $before = $record->getAttributes();
    $seen = [];
    $vetoed(static fn() => $record->updateAttributes(['object_model' => 'managed', 'object_id' => 92]), 'proposed managed association');
    $check(count($seen) === 2, 'both current and proposed events run');
    $check($seen[0][0] === $record && $seen[1][0] !== $record, 'proposed sender is a clone');
    $check($seen[1][1]['object_model'] === 'managed' && $seen[1][1]['object_id'] === 92, 'clone exposes complete proposed association');
    $check($seen[1][2] === $before, 'clone retains persisted old attributes');
    $check($seen[1][1]['id'] === 71 && $seen[1][1]['guid'] === $before['guid'], 'clone retains file identity');
    $check($record->getAttributes() === $before && $record->getOldAttributes() === $before, 'proposed veto leaves original untouched');
    $check(AttachmentHookFile::$updates === [], 'proposed veto reaches no AR write');

    $record = $file();
    $record->object_model = 'managed';
    $record->object_id = 93;
    $seen = [];
    $vetoed(static fn() => $record->updateAttributes(['object_model', 'object_id']), 'dirty numeric attribute list');
    $check(count($seen) === 1 && $seen[0][1]['object_id'] === 93, 'current event sees dirty numeric-list attributes');
    $check($record->getOldAttribute('object_model') === null && AttachmentHookFile::$updates === [], 'dirty veto retains persisted state');

    $record = $file('managed');
    $record->object_model = null;
    $record->object_id = null;
    $vetoed(static fn() => $record->updateAttributes(['object_model', 'object_id']), 'old association still visible after dirty clear');
    $check($record->getOldAttribute('object_model') === 'managed' && AttachmentHookFile::$updates === [], 'old managed association remains inspectable');

    $record = $file();
    $seen = [];
    $check($record->updateAttributes(['object_model' => 'ordinary', 'object_id' => 94]) === 1, 'registered guard permits unrelated native file');
    $check(count($seen) === 2, 'unrelated native file still traverses both class events');
    $check(AttachmentHookFile::$updates === [[['object_model' => 'ordinary', 'object_id' => 94], ['id' => 71], []]], 'allowed AR delegates exact values and old primary key');
    $check($record->getOldAttribute('object_model') === 'ordinary' && $record->getDirtyAttributes() === [], 'allowed AR retains native dirty bookkeeping');
    Event::off(File::class, File::EVENT_BEFORE_STORAGE_MUTATION, $gate);

    // No registered handler: unchanged native AR behavior, with a fake updateAll boundary.
    AttachmentHookFile::$updates = [];
    $record = $file();
    $check($record->updateAttributes(['object_model' => 'ordinary', 'object_id' => 95]) === 1, 'no-handler association update');
    $check($record->getOldAttribute('object_id') === 95 && $record->getDirtyAttributes() === [], 'no-handler bookkeeping');
    $record->object_id = 96;
    $check($record->updateAttributes(['object_id']) === 1, 'no-handler numeric attribute list');
    $check(AttachmentHookFile::$updates[1] === [['object_id' => 96], ['id' => 71], []], 'numeric list exact delegated update');
    $check($record->updateAttributes([]) === 0, 'no-handler empty update remains no-op');
    $check($record->updateAttributes(['object_id' => 96]) === 0, 'no-handler unchanged update remains no-op');
    $check(count(AttachmentHookFile::$updates) === 2, 'no-op calls do not write');
    $record = $file(null, false);
    $check($record->updateAttributes(['object_id' => 97]) === 0, 'new record still cannot update persistence');
    $check($record->object_id === 97 && $record->getIsNewRecord() && $record->getOldAttributes() === [], 'new record preserves native in-memory assignment');

    // Actual StorageManager body against memory FS, including original variant exclusions.
    $record = $file();
    [$manager, $fs] = $store($record);
    $manager->setContent('original');
    $path = $manager->get();
    $check($fs->bytes[$path] === 'original', 'no-handler setContent writes original');
    $check($fs->calls[0][2] === ['visibility' => 'private', 'directory_visibility' => 'private'], 'no-handler preserves private storage config');
    $check($manager->getContent() === 'original', 'no-handler content read');
    $check($manager->fileSize() === 8 && $manager->has(), 'no-handler size/existence reads');
    $check($manager->mimeType() === 'text/plain', 'no-handler MIME read');
    $fs->failMime = true;
    $check($manager->mimeType() === 'text/plain', 'ordinary FS MIME failure retains native metadata fallback');
    $fs->failMime = false;
    $stream = $manager->getContentStream();
    $check(stream_get_contents($stream) === 'original', 'no-handler stream read'); fclose($stream);
    $check($manager->checksum() === sha1('original'), 'no-handler checksum read');
    $manager->setByPath('data://text/plain,synthetic%20stream', 'preview');
    $check($fs->bytes[$manager->get('preview')] === 'synthetic stream', 'no-handler setByPath reads only in-memory data URI');
    $manager->setContent('history', 'old-1');
    $check($manager->getVariants(['old-*']) === ['preview'], 'no-handler variant listing exclusions');
    $manager->delete(null, ['file', 'old-*']);
    $check($fs->bytes === [$path => 'original', $manager->get('old-1') => 'history'], 'delete preserves original/history exclusions');
    $check(!in_array('deleteDirectory', array_column($fs->calls, 0), true), 'partial variant deletion keeps parent directory');
    $manager->delete();
    $check($fs->bytes === [], 'no-handler full delete removes files');
    $check(end($fs->calls) === ['deleteDirectory', dirname($path)], 'no-handler full delete retains directory cleanup');

    // Actual File::beforeNewStoredFile executes unchanged before later save logic.
    $record = $file();
    [$manager, $fs] = $store($record);
    $manager->setContent('keep');
    $manager->setContent('old', 'old-2');
    $manager->setContent('remove', 'preview');
    $beforeNew = new ReflectionMethod(File::class, 'beforeNewStoredFile');
    $beforeNew->invoke($record, false);
    $check($fs->bytes === [$manager->get() => 'keep', $manager->get('old-2') => 'old'], 'no-handler beforeNew retains original/history and clears variants');
    $check($historyBoundary->calls === [], 'unassigned beforeNew does not create history');
    $unsaved = $file(null, false);
    try { $unsaved->setStoredFileContent('synthetic'); throw new RuntimeException('new record invariant missing'); }
    catch (Exception $error) { $check($error->getMessage() === 'File Record must be saved before setting a new file content.', 'no-handler original new-record invariant retained'); }
    $check($unsaved->storeReads === 0, 'new-record invariant precedes getStore');

    // Actual beforeDelete continues through FileHistory and parent event when allowed.
    $parentEvent = 0;
    $record->on(File::EVENT_BEFORE_DELETE, static function () use (&$parentEvent): void { $parentEvent++; });
    $check($record->beforeDelete() === true, 'no-handler native beforeDelete succeeds');
    $check($fs->bytes === [], 'no-handler beforeDelete deletes file bytes');
    $check($historyBoundary->calls === [['getDb'], ['createCommand'], ['delete', 'file_history', ['file_id' => 71], []], ['execute']], 'actual FileHistory reaches only expected in-memory command');
    $check($parentEvent === 1, 'native parent BEFORE_DELETE event remains intact');

    echo json_encode([
        'status' => 'passed', 'checks' => $checks, 'real_yii_core' => true,
        'database_access' => false, 'physical_storage_access' => false,
        'application_bootstrap' => false, 'product_authorization_tested' => false,
    ], JSON_UNESCAPED_SLASHES), PHP_EOL;
} finally {
    Event::off(File::class, File::EVENT_BEFORE_STORAGE_MUTATION);
    Event::off(File::class, File::EVENT_BEFORE_STORAGE_READ);
    Yii::$app = null;
}
