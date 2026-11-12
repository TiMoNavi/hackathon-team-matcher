<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

/** A current authorized file summary. It never contains a native GUID or token. */
final class Attachment
{
    public const MAX_BYTES = 5242880;
    public const MAX_FILES = 3;
    public const TTL = 86400;
    public const MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain'];
    public function __construct(public readonly string $id, public readonly int $conversationId, public readonly string $name, public readonly string $mime, public readonly int $size)
    {
        self::uuid($id); SafeInteger::positive($conversationId, 'conversation_id');
        self::filename($name);
        if (!in_array($mime, self::MIME_TYPES, true) || $size < 1 || $size > self::MAX_BYTES) { throw new ChatException('INVALID_ATTACHMENT_PROJECTION', 'The attachment projection is invalid.', 503); }
    }
    public static function uuid(mixed $value): string
    {
        if (!is_string($value) || preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $value) !== 1) { throw new ChatException('INVALID_ATTACHMENT_ID', 'Use a lowercase UUID version 4.'); }
        return $value;
    }
    public static function filename(mixed $name): string
    {
        if (!is_string($name) || $name === '' || strlen($name) > 180 || preg_match('//u', $name) !== 1 || preg_match('~[\\\\/\p{Cc}\p{Cf}]~u', $name) || preg_match('/[^\p{Z}\s]/u', $name) !== 1 || in_array($name, ['.', '..'], true)) { throw new ChatException('INVALID_ATTACHMENT_NAME', 'Use a plain UTF-8 filename of at most 180 bytes.'); }
        return $name;
    }
    public function dto(): array { return ['id' => $this->id, 'name' => $this->name, 'mime' => $this->mime, 'size' => $this->size, 'download_path' => '/api/v1/conversations/' . $this->conversationId . '/attachments/' . $this->id . '/download']; }
    public static function capability(bool $upload, bool $download): array { return ['upload_enabled' => $upload, 'download_enabled' => $download, 'max_file_bytes' => self::MAX_BYTES, 'max_files_per_message' => self::MAX_FILES, 'allowed_mime_types' => self::MIME_TYPES, 'staging_ttl_seconds' => self::TTL]; }
}
