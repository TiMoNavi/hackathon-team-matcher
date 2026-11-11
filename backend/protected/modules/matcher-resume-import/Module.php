<?php
declare(strict_types=1);
namespace humhub\modules\matcherResumeImport;

use humhub\modules\matcherProfile\domain\ports\ProfileSourceReader;
use humhub\modules\matcherResumeImport\application\ResumeSourceReader;
use humhub\modules\matcherResumeImport\adapters\parser\PythonDocumentParser;
use humhub\services\ModuleService;

final class Module extends \humhub\components\Module
{
    public ?string $pythonBinary = null;
    private ?ProfileSourceReader $reader = null;

    public function getSourceReader(): ProfileSourceReader
    {
        return $this->reader ??= new ResumeSourceReader(new PythonDocumentParser(
            $this->pythonBinary ?? dirname(__DIR__, 3) . '/.runtime/resume-python/bin/python3',
            __DIR__ . '/runtime/parse_document.py',
        ));
    }

    public function disable() { $this->getModuleService()->disable(); return true; }
    public function getModuleService(): ModuleService { return new ResumeImportModuleService($this); }
}

final class ResumeImportModuleService extends ModuleService
{
    public function canRemove(): bool { return false; }
    public function remove(bool $disableBeforeRemove = true): ?string { throw new \LogicException('Resume source data is retained in the profile module. Removal requires a reviewed data handover.'); }
}
