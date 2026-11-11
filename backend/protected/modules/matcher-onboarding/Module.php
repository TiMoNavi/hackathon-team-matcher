<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboarding;

use humhub\modules\matcherOnboarding\application\OnboardingService;
use humhub\modules\matcherOnboarding\adapters\persistence\SqlOnboardingRepository;
use humhub\modules\matcherOnboarding\domain\ports\OnboardingRepository;
use humhub\modules\matcherProfile\Module as ProfileModule;
use humhub\services\ModuleService;
use Yii;

/** The rules flow has no model client, gateway credentials or external-network adapter. */
final class Module extends \humhub\components\Module
{
    public array $aiTaskLimits = [];
    private ?OnboardingRepository $repository = null;
    private ?OnboardingService $service = null;
    public function init()
    {
        parent::init();
        Yii::setAlias('@matcherOnboarding', $this->getBasePath());
        if(Yii::$app instanceof \yii\console\Application)$this->controllerNamespace='humhub\\modules\\matcherOnboarding\\commands';
    }
    public function getOnboardingRepository(): OnboardingRepository { return $this->repository ??= new SqlOnboardingRepository(Yii::$app->db); }
    public function getOnboardingService(): OnboardingService
    {
        $profile = $this->profileModule();
        return $this->service ??= new OnboardingService(
            $this->getOnboardingRepository(), $profile->getProfileWorkflow(), $profile->getQuestionService(), null,
            fn(int $ownerId, string $sessionId): array => $this->getAiJobService()->progressForSession($ownerId, $sessionId),
            fn(int $ownerId, string $batchId, int $questionIndex): array => $profile->getQuestionService()->getProgressCounts($ownerId, $batchId, $questionIndex),
        );
    }
    public function getAiJobService(): \humhub\modules\matcherProfile\application\ProfileAiJobService
    {
        $profile=$this->profileModule();
        return new \humhub\modules\matcherProfile\application\ProfileAiJobService(
            $profile->getAiJobRepository(),
            new \humhub\modules\matcherOnboarding\application\OnboardingAiWorkflow($profile->getProfileWorkflow(),$this->getOnboardingRepository(),$profile->getQuestionRepository(),$profile->getSourceRepository()),
            static function(): ?\humhub\modules\matcherProfile\domain\ports\ProfileAiEngine {
                if(!Yii::$app->hasModule('matcher-onboarding-ai'))return null;
                $module=Yii::$app->getModule('matcher-onboarding-ai');
                return $module!==null&&$module->isEnabled&&method_exists($module,'getAiEngine')?$module->getAiEngine():null;
            },
            null,$this->aiTaskLimits,
        );
    }
    public function profileModule(): ProfileModule
    {
        $module = Yii::$app->getModule('matcher-user-profile');
        if (!$module instanceof ProfileModule || !$module->isEnabled || version_compare($module->version, '0.10.0', '<')) { throw new \RuntimeException('Enable matcher-user-profile 0.10.0 or later before using onboarding.'); }
        return $module;
    }
    /** Close the optional flow without running HumHub's destructive uninstall step. */
    public function disable()
    {
        $this->getModuleService()->disable();
        return true;
    }
    public function getModuleService(): ModuleService { return new RetainedOnboardingModuleService($this); }
}

final class RetainedOnboardingModuleService extends ModuleService
{
    public function canRemove(): bool { return false; }
    public function remove(bool $disableBeforeRemove = true): ?string { throw new \LogicException('Onboarding removal requires a reviewed data handover.'); }
}
