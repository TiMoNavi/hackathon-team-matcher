<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\media;

use humhub\modules\matcherProfile\application\interfaces\ProfileMediaStore;
use humhub\modules\matcherProfile\domain\ProfileException;

/** Files remain outside the public web root; every read goes through authorization. */
final class LocalProfileMediaStore implements ProfileMediaStore
{
    public const MAX_BYTES = 5 * 1024 * 1024;
    public function __construct(private string $root) {}

    public function stage(string $temporaryPath, string $kind, string $id): array
    {
        $this->validateId($id);
        if (!is_file($temporaryPath) || filesize($temporaryPath) < 1 || filesize($temporaryPath) > self::MAX_BYTES) {
            throw new ProfileException('INVALID_IMAGE_SIZE', 'Images must be nonempty and at most 5 MiB.');
        }
        $info = @getimagesize($temporaryPath);
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($temporaryPath);
        if (!$info || !in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true) || ($info['mime'] ?? null) !== $mime) {
            throw new ProfileException('INVALID_IMAGE_TYPE', 'Upload a valid JPEG, PNG or WebP image.');
        }
        [$width, $height] = $info;
        if ($width < 1 || $height < 1 || $width > 8192 || $height > 8192 || $width * $height > 20000000) {
            throw new ProfileException('INVALID_IMAGE_DIMENSIONS', 'Image dimensions exceed the supported limit.');
        }
        $image = @imagecreatefromstring(file_get_contents($temporaryPath));
        if (!$image) { throw new ProfileException('INVALID_IMAGE_TYPE', 'The image could not be decoded.'); }
        $directory = $this->root . '/' . $id;
        if (!is_dir($directory) && !@mkdir($directory, 0700, true)) { throw new ProfileException('MEDIA_UNAVAILABLE', 'Image storage is temporarily unavailable.', 503); }
        try {
            [$mainWidth, $mainHeight] = $this->encode($image, $directory . '/main.png', $kind === 'avatar' ? 1024 : 4096);
            $this->encode($image, $directory . '/thumbnail.png', $kind === 'avatar' ? 256 : 512);
            return ['storage_id' => $id, 'width' => $mainWidth, 'height' => $mainHeight, 'mime' => 'image/png', 'sha256' => hash_file('sha256', $directory . '/main.png'), 'thumbnail_sha256' => hash_file('sha256', $directory . '/thumbnail.png')];
        } catch (\Throwable $error) { $this->discard($id); throw $error; }
    }

    private function encode(\GdImage $image, string $destination, int $maximum): array
    {
        $ratio = min(1, $maximum / max(imagesx($image), imagesy($image)));
        $width = max(1, (int)round(imagesx($image) * $ratio));
        $height = max(1, (int)round(imagesy($image) * $ratio));
        $output = imagecreatetruecolor($width, $height);
        imagealphablending($output, false); imagesavealpha($output, true);
        imagefill($output, 0, 0, imagecolorallocatealpha($output, 255, 255, 255, 127));
        imagecopyresampled($output, $image, 0, 0, 0, 0, $width, $height, imagesx($image), imagesy($image));
        $temporary = $destination . '.tmp';
        if (!imagepng($output, $temporary, 6) || !chmod($temporary, 0600) || !rename($temporary, $destination)) {
            @unlink($temporary); throw new ProfileException('MEDIA_UNAVAILABLE', 'Image storage is temporarily unavailable.', 503);
        }
        return [$width, $height];
    }

    public function discard(string $id): void
    {
        $this->validateId($id);
        foreach (['main.png', 'thumbnail.png', 'main.png.tmp', 'thumbnail.png.tmp'] as $file) { @unlink($this->root . '/' . $id . '/' . $file); }
        @rmdir($this->root . '/' . $id);
    }

    public function assertReady(array $metadata): void
    {
        foreach (['main' => 'sha256', 'thumbnail' => 'thumbnail_sha256'] as $variant => $hashKey) {
            $path = $this->path($metadata, $variant);
            if (!is_file($path) || !is_readable($path) || !isset($metadata[$hashKey]) || !hash_equals($metadata[$hashKey], hash_file('sha256', $path))) {
                throw new ProfileException('MEDIA_UNAVAILABLE', 'Image files are unavailable; restore the resource or upload it again.', 503);
            }
        }
    }

    public function path(array $metadata, string $variant): string
    {
        if (!in_array($variant, ['main', 'thumbnail'], true)) { throw new ProfileException('INVALID_MEDIA_VARIANT', 'Unknown image variant.'); }
        $id = (string)($metadata['storage_id'] ?? ''); $this->validateId($id);
        return $this->root . '/' . $id . '/' . $variant . '.png';
    }

    private function validateId(string $id): void
    {
        if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/D', $id)) { throw new ProfileException('INVALID_MEDIA_REFERENCE', 'Invalid image reference.'); }
    }
}
