<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebImport\application;

use humhub\modules\matcherProfile\domain\ExplicitTextCandidateMapper;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ports\IdentifiedProfileSourceReader;
use humhub\modules\matcherWebImport\domain\TextStructure;
use humhub\modules\matcherWebImport\domain\WebLimits;

final class TextSourceReader implements IdentifiedProfileSourceReader
{
    public function __construct(private ?ExplicitTextCandidateMapper $mapper = null) { $this->mapper ??= new ExplicitTextCandidateMapper(); }
    public function kind(): string { return 'text'; }
    public function status(int $ownerId): array
    {
        $this->owner($ownerId); $available = extension_loaded('mbstring');
        return ['kind' => 'text', 'available' => $available, 'reason' => $available ? null : 'TEXT_RUNTIME_UNAVAILABLE',
            'ownership_required' => 'self', 'ownership_basis' => 'self_declared', 'max_text_bytes' => WebLimits::PASTE_BYTES,
            'generation_mode' => 'rules', 'llm_calls' => 0, 'network_requests' => 0];
    }
    public function identify(int $ownerId, array $input): array
    {
        $this->owner($ownerId);
        if (array_diff(array_keys($input), ['text','label','ownership']) !== [] || !is_string($input['text'] ?? null)) { throw new ProfileException('INVALID_TEXT_INPUT', 'Provide a plain text source.'); }
        if (($input['ownership'] ?? null) !== 'self') { throw new ProfileException('SOURCE_OWNERSHIP_REQUIRED', 'Confirm that the submitted source describes you.'); }
        if (!$this->status($ownerId)['available']) { throw new ProfileException('TEXT_RUNTIME_UNAVAILABLE', 'The text importer is unavailable.', 503); }
        $text = TextStructure::normalize($input['text'], WebLimits::PASTE_BYTES);
        $label = $input['label'] ?? '本人补充文字';
        if (!is_string($label) || !mb_check_encoding($label, 'UTF-8') || mb_strlen($label, 'UTF-8') > 160
            || preg_match('/[\x00-\x1F\x7F]/', $label) || trim($label) === '') { throw new ProfileException('INVALID_TEXT_LABEL', 'Provide a short readable source label.'); }
        return ['external_id' => 'text:' . hash('sha256', $text), 'canonical_url' => null, 'label' => trim($label), 'ownership_basis' => 'self_declared'];
    }
    public function read(int $ownerId, array $input): array
    {
        $identity = $this->identify($ownerId, $input); $text = TextStructure::normalize($input['text'], WebLimits::PASTE_BYTES);
        $parsed = TextStructure::build($text, 'text');
        return ['external_id' => $identity['external_id'], 'canonical_url' => null, 'label' => $identity['label'],
            'raw_text' => $parsed['raw_text'], 'sections' => $parsed['sections'], 'candidates' => $this->mapper->map($parsed['sections']),
            'metadata' => ['format' => 'text', 'charset' => 'UTF-8', 'ownership_basis' => 'self_declared',
                'content_sha256' => hash('sha256', $text), 'mapping_method' => 'explicit_labels', 'mapping_version' => 'explicit-text-v1',
                'generation_mode' => 'rules', 'llm_calls' => 0, 'network_requests' => 0, 'source_retained' => 'original_text_and_sections']];
    }
    private function owner(int $id): void
    { if ($id < 1) { throw new ProfileException('AUTHENTICATION_REQUIRED', 'Sign in before importing text.', 401); } }
}
