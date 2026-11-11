<?php
declare(strict_types=1);
namespace humhub\modules\matcherGithubImport;

use humhub\modules\matcherGithubImport\adapters\http\CurlGithubApi;
use humhub\modules\matcherGithubImport\adapters\native\NativeGithubIdentity;
use humhub\modules\matcherGithubImport\application\GithubSourceReader;
use humhub\modules\matcherProfile\domain\ports\ProfileSourceReader;
use humhub\services\ModuleService;
use Yii;

final class Module extends \humhub\components\Module
{
    private ?ProfileSourceReader $reader = null;
    public function init()
    {
        parent::init();
        Yii::setAlias('@matcherGithubImport', $this->getBasePath());
    }
    public function getSourceReader(): ProfileSourceReader
    {
        return $this->reader ??= new GithubSourceReader(new NativeGithubIdentity(Yii::$app->db), new CurlGithubApi());
    }
    /** Application composition seam; never exposed as an HTTP input. */
    public function setSourceReader(ProfileSourceReader $reader): void
    {
        if ($reader->kind() !== 'github') { throw new \InvalidArgumentException('A GitHub source reader is required.'); }
        $this->reader = $reader;
    }
    public function disable() { $this->getModuleService()->disable(); return true; }
    public function getModuleService(): ModuleService { return new RetainedGithubImportModuleService($this); }
}

final class RetainedGithubImportModuleService extends ModuleService
{
    public function canRemove(): bool { return false; }
    public function remove(bool $disableBeforeRemove = true): ?string
    { throw new \LogicException('Source records are retained by matcher-user-profile. Use a reviewed data handover before removal.'); }
}
