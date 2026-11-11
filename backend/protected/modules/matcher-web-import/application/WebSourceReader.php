<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebImport\application;

use humhub\modules\matcherProfile\domain\ExplicitTextCandidateMapper;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ports\IdentifiedProfileSourceReader;
use humhub\modules\matcherWebImport\domain\WebLimits;
use humhub\modules\matcherWebImport\domain\WebUrl;
use humhub\modules\matcherWebImport\domain\ports\WebDocumentParser;

final class WebSourceReader implements IdentifiedProfileSourceReader
{
    public function __construct(private BoundedWebFetcher $fetcher, private WebDocumentParser $parser, private ?ExplicitTextCandidateMapper $mapper = null, private ?\Closure $runtimeCheck = null)
    { $this->mapper ??= new ExplicitTextCandidateMapper(); }
    public function kind(): string { return 'web'; }
    public function status(int $ownerId): array
    {
        $this->owner($ownerId);
        $available = $this->runtimeCheck ? (bool)($this->runtimeCheck)() : (extension_loaded('curl') && extension_loaded('dom') && extension_loaded('mbstring') && function_exists('proc_open'));
        return ['kind' => 'web', 'available' => $available, 'reason' => $available ? null : 'WEB_RUNTIME_UNAVAILABLE',
            'formats' => ['static_html', 'plain_text'], 'ownership_required' => 'self', 'ownership_basis' => 'self_declared',
            'max_download_bytes' => WebLimits::BODY_BYTES, 'max_text_bytes' => WebLimits::TEXT_BYTES,
            'max_redirects' => WebLimits::REDIRECTS, 'total_timeout_ms' => WebLimits::TOTAL_MS,
            'generation_mode' => 'rules', 'llm_calls' => 0];
    }
    public function identify(int $ownerId, array $input): array
    {
        $this->owner($ownerId);
        if (array_diff(array_keys($input), ['url', 'ownership']) !== [] || !is_string($input['url'] ?? null)) { throw new ProfileException('INVALID_WEB_INPUT', 'Provide the URL of your own website.'); }
        if (($input['ownership'] ?? null) !== 'self') { throw new ProfileException('SOURCE_OWNERSHIP_REQUIRED', 'Confirm that the submitted source describes you.'); }
        $url = WebUrl::normalize($input['url']);
        return ['external_id' => 'web:' . hash('sha256', $url), 'canonical_url' => $url,
            'label' => parse_url($url, PHP_URL_HOST), 'ownership_basis' => 'self_declared'];
    }
    public function read(int $ownerId, array $input): array
    {
        $identity = $this->identify($ownerId, $input);
        if (!$this->status($ownerId)['available']) { throw new ProfileException('WEB_RUNTIME_UNAVAILABLE', 'The bounded website importer is unavailable.', 503); }
        $download = $this->fetcher->fetch($identity['canonical_url']);
        $parsed = $this->parser->parse($download['body'], $download['content_type']);
        $candidates = $this->mapper->map($parsed['sections']);
        $title = $parsed['metadata']['title'] ?? '';
        $result = ['external_id' => $identity['external_id'], 'canonical_url' => $identity['canonical_url'],
            'label' => is_string($title) && $title !== '' ? $title : $identity['label'],
            'raw_text' => $parsed['raw_text'], 'sections' => $parsed['sections'], 'candidates' => $candidates,
            'metadata' => $parsed['metadata'] + ['ownership_basis' => 'self_declared', 'final_url' => $download['final_url'],
                'network_requests' => $download['network_requests'], 'redirects' => $download['redirects'], 'downloaded_bytes' => $download['downloaded_bytes'],
                'elapsed_ms' => $download['elapsed_ms'], 'content_sha256' => hash('sha256', $parsed['raw_text']),
                'mapping_method' => 'explicit_labels', 'mapping_version' => 'explicit-text-v1', 'generation_mode' => 'rules', 'llm_calls' => 0,
                'source_retained' => 'extracted_text_and_sections', 'html_retained' => false]];
        if (strlen(json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)) > 2 * 1024 * 1024) { throw new ProfileException('SOURCE_STRUCTURE_TOO_LARGE', 'The structured source exceeds the supported size.', 413); }
        return $result;
    }
    private function owner(int $id): void
    { if ($id < 1) { throw new ProfileException('AUTHENTICATION_REQUIRED', 'Sign in before importing a website.', 401); } }
}
