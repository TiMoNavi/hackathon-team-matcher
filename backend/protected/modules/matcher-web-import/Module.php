<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebImport;

use humhub\modules\matcherProfile\domain\ports\IdentifiedProfileSourceReader;
use humhub\modules\matcherWebImport\adapters\network\CurlHttpTransport;
use humhub\modules\matcherWebImport\adapters\network\ProcessDnsResolver;
use humhub\modules\matcherWebImport\adapters\parser\NativeWebDocumentParser;
use humhub\modules\matcherWebImport\application\BoundedWebFetcher;
use humhub\modules\matcherWebImport\application\TextSourceReader;
use humhub\modules\matcherWebImport\application\WebSourceReader;
use humhub\services\ModuleService;

final class Module extends \humhub\components\Module
{
    /** Optional server CLI path for PHP-FPM deployments; never accepted in source input. */
    public ?string $dnsPhpBinary = null;
    private array $readers = [];
    public function getSourceReader(string $kind = 'web'): IdentifiedProfileSourceReader
    {
        if (!in_array($kind, ['web', 'text'], true)) { throw new \InvalidArgumentException('Unknown website source reader.'); }
        if (!isset($this->readers[$kind])) {
            if ($kind === 'text') { $this->readers[$kind] = new TextSourceReader(); }
            else {
                $dns = new ProcessDnsResolver($this->dnsPhpBinary);
                $this->readers[$kind] = new WebSourceReader(new BoundedWebFetcher($dns, new CurlHttpTransport()), new NativeWebDocumentParser(), null,
                    static fn(): bool => extension_loaded('curl') && extension_loaded('dom') && extension_loaded('mbstring') && $dns->available());
            }
        }
        return $this->readers[$kind];
    }
    /** Server-side composition seam for isolated integration fixtures. No user-facing setting. */
    public function setSourceReader(string $kind, IdentifiedProfileSourceReader $reader): void
    {
        if (!in_array($kind, ['web', 'text'], true) || $reader->kind() !== $kind) { throw new \InvalidArgumentException('Source reader kind mismatch.'); }
        $this->readers[$kind] = $reader;
    }
    public function disable() { $this->getModuleService()->disable(); return true; }
    public function getModuleService(): ModuleService { return new WebImportModuleService($this); }
}

final class WebImportModuleService extends ModuleService
{
    public function canRemove(): bool { return false; }
    public function remove(bool $disableBeforeRemove = true): ?string
    { throw new \LogicException('Website sources are retained in the profile module. Removal requires a reviewed data handover.'); }
}
