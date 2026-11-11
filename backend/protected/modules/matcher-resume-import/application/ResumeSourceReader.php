<?php
declare(strict_types=1);
namespace humhub\modules\matcherResumeImport\application;

use humhub\modules\matcherProfile\domain\ports\ProfileSourceReader;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherResumeImport\domain\ports\DocumentParser;
use humhub\modules\matcherResumeImport\domain\ResumeCandidateMapper;

final class ResumeSourceReader implements ProfileSourceReader
{
    public const MAX_BYTES = 5 * 1024 * 1024;
    public function __construct(private DocumentParser $parser, private ?ResumeCandidateMapper $mapper = null) { $this->mapper ??= new ResumeCandidateMapper(); }
    public function kind(): string { return 'resume'; }
    public function status(int $ownerId): array
    {
        $this->owner($ownerId); $available = $this->parser->available();
        return ['kind' => 'resume', 'available' => $available, 'reason' => $available ? null : 'RESUME_PARSER_UNAVAILABLE', 'formats' => ['pdf', 'docx', 'md', 'txt'], 'max_bytes' => self::MAX_BYTES, 'max_pages' => 30, 'generation_mode' => 'rules', 'llm_calls' => 0];
    }
    public function read(int $ownerId, array $input): array
    {
        $this->owner($ownerId);
        if (array_diff(array_keys($input), ['tmp_path', 'filename', 'mime', 'size']) !== [] || !is_string($input['tmp_path'] ?? null) || !is_string($input['filename'] ?? null) || !is_string($input['mime'] ?? null) || !is_int($input['size'] ?? null)) { throw new ProfileException('INVALID_RESUME_UPLOAD', 'Provide a valid server-side uploaded document.'); }
        $path = $input['tmp_path'];
        if (str_contains($path, '://') || str_contains($path, chr(0)) || !is_file($path) || is_link($path) || !is_readable($path)) { throw new ProfileException('INVALID_RESUME_UPLOAD', 'The uploaded document is unavailable.'); }
        $bytes = filesize($path);
        if ($bytes === false || $bytes !== $input['size'] || $bytes < 1) { throw new ProfileException('INVALID_RESUME_UPLOAD', 'The uploaded document is empty or incomplete.'); }
        if ($bytes > self::MAX_BYTES) { throw new ProfileException('RESUME_UPLOAD_TOO_LARGE', 'The resume must be no larger than 5 MiB.', 413); }
        $filename = basename(str_replace(chr(92), '/', $input['filename']));
        $filename = mb_substr(preg_replace('/[\x00-\x1F\x7F]/u', '', $filename) ?? 'resume', 0, 160, 'UTF-8');
        $format = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        if (!in_array($format, ['pdf', 'docx', 'md', 'txt'], true)) { throw new ProfileException('RESUME_UNSUPPORTED_FORMAT', 'Choose a PDF, DOCX, Markdown or text file.'); }
        $hash = hash_file('sha256', $path);
        $parsed = $this->parser->parse($path, $format);
        if (!is_string($parsed['raw_text'] ?? null) || !is_array($parsed['sections'] ?? null) || !is_array($parsed['metadata'] ?? null) || strlen($parsed['raw_text']) > 1048576 || count($parsed['sections']) > 2000 || !mb_check_encoding($parsed['raw_text'], 'UTF-8')) { throw new ProfileException('RESUME_INVALID_DOCUMENT', 'The parser returned an invalid document structure.'); }
        if (trim($parsed['raw_text']) === '' || $parsed['sections'] === []) { throw new ProfileException('RESUME_NO_TEXT', 'No readable text was found. Upload a text-based document or use direct entry.'); }
        $candidates = $this->mapper->map($parsed['sections']);
        $result = ['external_id' => 'sha256:' . $hash, 'label' => $filename, 'canonical_url' => null, 'raw_text' => $parsed['raw_text'], 'sections' => $parsed['sections'], 'candidates' => $candidates,
            'metadata' => $parsed['metadata'] + ['format' => $format, 'uploaded_bytes' => $bytes, 'content_sha256' => $hash, 'mapping_version' => 'resume-rules-v1', 'mapping_method' => 'explicit_labels', 'generation_mode' => 'rules', 'llm_calls' => 0, 'binary_retained' => false, 'source_retained' => 'extracted_text_and_sections']];
        if (strlen(json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)) > 2 * 1024 * 1024) { throw new ProfileException('RESUME_LIMIT_EXCEEDED', 'This document exceeds the structured source limit.', 413); }
        return $result;
    }
    private function owner(int $id): void { if ($id < 1) { throw new ProfileException('AUTHENTICATION_REQUIRED', 'Sign in before importing a resume.', 401); } }
}
