<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

/** Validated metadata only; original bytes remain exclusively in native File storage. */
final class AttachmentUpload
{
    public readonly string $clientUploadId;
    public readonly string $name;
    public readonly string $mime;
    public readonly int $size;
    public readonly string $sha256;
    public readonly string $sha1;
    public readonly string $payloadHash;
    public function __construct(mixed $clientUploadId, mixed $name, string $bytes)
    {
        $this->clientUploadId = Attachment::uuid($clientUploadId);
        $this->name = Attachment::filename($name);
        $this->size = strlen($bytes);
        if ($this->size > Attachment::MAX_BYTES) { throw new ChatException('ATTACHMENT_TOO_LARGE', 'The file exceeds 5 MiB.', 413); }
        if ($this->size === 0) { throw new ChatException('INVALID_ATTACHMENT_UPLOAD', 'Empty files are unsupported.'); }
        $extension = strtolower(pathinfo($this->name, PATHINFO_EXTENSION));
        $mime = null;
        if (in_array($extension, ['jpg', 'jpeg', 'png'], true)) {
            $image = @getimagesizefromstring($bytes);
            if (is_array($image) && $image[0] > 0 && $image[1] > 0 && $image[0] <= 20000 && $image[1] <= 20000 && $image[0] * $image[1] <= 40000000) {
                if ($image[2] === IMAGETYPE_JPEG && in_array($extension, ['jpg', 'jpeg'], true) && str_starts_with($bytes, "\xff\xd8\xff") && str_ends_with($bytes, "\xff\xd9")) { $mime = 'image/jpeg'; }
                if ($image[2] === IMAGETYPE_PNG && $extension === 'png' && str_starts_with($bytes, "\x89PNG\r\n\x1a\n") && str_ends_with($bytes, "\x00\x00\x00\x00IEND\xae\x42\x60\x82")) { $mime = 'image/png'; }
            }
        } elseif ($extension === 'pdf' && preg_match('/\A%PDF-(?:1\.[0-7]|2\.0)(?:\r\n|\r|\n)/D', $bytes) && preg_match('/%%EOF\s*\z/D', substr($bytes, -1024))) { $mime = 'application/pdf'; }
        elseif ($extension === 'txt' && preg_match('//u', $bytes) === 1 && preg_match('/[\x{0000}-\x{0008}\x{000B}\x{000C}\x{000E}-\x{001F}\x{007F}-\x{009F}]/u', $bytes) === 0) { $mime = 'text/plain'; }
        if ($mime === null || ($mime !== 'text/plain' && (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes) !== $mime)) { throw new ChatException('ATTACHMENT_TYPE_UNSUPPORTED', 'Use a valid JPEG, PNG, PDF or UTF-8 text file with a matching extension.', 415); }
        $this->mime = $mime; $this->sha256 = hash('sha256', $bytes); $this->sha1 = hash('sha1', $bytes);
        $this->payloadHash = hash('sha256', json_encode([$this->name, $this->mime, $this->size, $this->sha256], JSON_THROW_ON_ERROR));
    }
}
