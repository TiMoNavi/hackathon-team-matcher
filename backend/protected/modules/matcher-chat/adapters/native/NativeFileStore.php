<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\native;

use humhub\modules\file\models\File;
use humhub\modules\file\components\StorageManager;
use humhub\components\fs\LocalMountConfig;
use humhub\modules\matcherChat\adapters\persistence\SqlState;
use humhub\modules\matcherChat\domain\ChatException;
use Yii;

/** Reuses native private storage. No temporary URLs, variants, public roots or AR effects. */
final class NativeFileStore
{
    private static ?array $mutation = null;
    private static ?array $reading = null;
    public function __construct(private readonly SqlState $sql) {}
    public static function ready(): bool
    {
        try {
            $storageClass = Yii::$app->getModule('file')->storageManagerClass;
            if (!method_exists(File::class, 'assertStorageMutationAllowed') || !method_exists(File::class, 'assertStorageReadAllowed') || !is_string($storageClass) || ltrim($storageClass, '\\') !== StorageManager::class) { return false; }
            $mount = Yii::$app->fs->getDataMountConfig();
            if (!$mount instanceof LocalMountConfig || $mount->useTemporaryUrls() || $mount->getBaseUrl() !== '') { return false; }
            $root = realpath(Yii::getAlias($mount->path)); $web = realpath(Yii::getAlias('@webroot'));
            return $root !== false && $web !== false && is_dir($root) && $root !== $web && !str_starts_with($root . DIRECTORY_SEPARATOR, $web . DIRECTORY_SEPARATOR);
        } catch (\Throwable) { return false; }
    }
    public static function permits(File $file): bool
    {
        return self::$mutation !== null && (int)$file->id === self::$mutation['file_id'] && $file->guid === self::$mutation['file_guid']
            && Yii::$app->db->getTransaction()?->getIsActive();
    }
    public static function permitsRead(File $file): bool
    {
        return self::permits($file) || (self::$reading !== null && (int)$file->id === self::$reading['file_id'] && $file->guid === self::$reading['file_guid'] && Yii::$app->db->getTransaction()?->getIsActive());
    }
    private function file(array $row): File
    {
        if (!self::ready() || !$this->sql->db->getTransaction()?->getIsActive()) { throw new ChatException('CHAT_ATTACHMENTS_UNAVAILABLE', 'Private attachment storage is unavailable.', 503); }
        $file = File::findOne(['id' => $row['file_id'], 'guid' => $row['file_guid']]);
        if (!$file instanceof File || (int)$file->public !== 0 || (int)$file->standalone !== 1 || (int)$file->created_by !== (int)$row['user_id']) { throw new ChatException('ATTACHMENT_UNAVAILABLE', 'The attachment is unavailable.', 404); }
        return $file;
    }
    private function mutate(array $row, callable $operation): mixed
    {
        if (self::$mutation !== null) { throw new \LogicException('Nested native file mutation.'); }
        $file = $this->file($row);
        self::$mutation = ['file_id' => (int)$row['file_id'], 'file_guid' => $row['file_guid']];
        try { return $operation($file->getStore()); } finally { self::$mutation = null; }
    }
    public function write(array $row, string $path): void
    {
        if ($row['state'] !== 'uploading' || !is_file($path) || filesize($path) !== (int)$row['size'] || !hash_equals($row['sha256'], (string)hash_file('sha256', $path))) { throw new ChatException('INVALID_ATTACHMENT_UPLOAD', 'The upload bytes changed.'); }
        $this->mutate($row, function ($store) use ($path, $row): void {
            // A failed final SQL commit can leave the expected bytes at this durable reservation.
            if (!$store->has() || $store->fileSize() !== (int)$row['size'] || !hash_equals($row['sha256'], $store->checksum(null, 'sha256'))) { $store->setByPath($path); }
            if (!$store->has() || $store->fileSize() !== (int)$row['size'] || !hash_equals($row['sha256'], $store->checksum(null, 'sha256'))) { throw new ChatException('ATTACHMENT_STORAGE_FAILED', 'The private file could not be verified.', 503); }
        });
    }
    public function delete(array $row): void
    {
        if (!in_array($row['state'], ['cancelled', 'expired', 'failed'], true)) { throw new \LogicException('Only terminal unbound files can be reclaimed.'); }
        $this->mutate($row, static fn ($store) => $store->delete());
    }
    public function read(array $row): string
    {
        if (self::$reading !== null) { throw new \LogicException('Nested native file read.'); }
        $file = $this->file($row);
        self::$reading = ['file_id' => (int)$row['file_id'], 'file_guid' => $row['file_guid']];
        try {
            $store = $file->getStore();
            if (!$store->has() || $store->fileSize() !== (int)$row['size']) { throw new ChatException('ATTACHMENT_UNAVAILABLE', 'The attachment is unavailable.', 404); }
            $bytes = $store->getContent();
            if (strlen($bytes) !== (int)$row['size'] || !hash_equals($row['sha256'], hash('sha256', $bytes))) { throw new ChatException('ATTACHMENT_UNAVAILABLE', 'The attachment is unavailable.', 404); }
            return $bytes;
        } finally { self::$reading = null; }
    }
}
