<?php
declare(strict_types=1);

namespace humhub\modules\matcherProfile;

use humhub\modules\matcherProfile\adapters\identity\NativeDisplayName;
use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\services\ModuleService;
use Yii;
use yii\base\Event;

/** Ordinary profile use cases with an optional, independently installed privacy capability. */
final class Module extends \humhub\components\Module
{
    private ?\humhub\modules\matcherProfile\domain\ports\ProfileRepository $profileRepository = null;
    private ?\humhub\modules\matcherProfile\domain\ports\ProfileAccessPolicy $profileAccessPolicy = null;
    private ?\humhub\modules\matcherProfile\application\IdentityService $identityService = null;
    private ?\humhub\modules\matcherProfile\application\ProfileService $profileService = null;
    private ?\humhub\modules\matcherProfile\domain\ports\ProfileWorkflow $profileWorkflow = null;
    private ?\humhub\modules\matcherProfile\domain\ports\QuestionRepository $questionRepository = null;
    private ?\humhub\modules\matcherProfile\application\QuestionService $questionService = null;
    public ?string $mediaStoragePath = null;

    public function init()
    {
        parent::init();
        Yii::setAlias('@matcherProfile', $this->getBasePath());
        if (Yii::$app->hasModule($this->id)) {
            $this->installIdentityAdapter();
        }
    }

    public static function bootstrapIdentity(Event $event): void
    {
        $module = Yii::$app->getModule('matcher-user-profile');
        if ($module instanceof self) {
            $module->installIdentityAdapter();
        }
    }

    public function installIdentityAdapter(): void
    {
        $userModule = Yii::$app->getModule('user');
        if ($userModule !== null) {
            $userModule->displayNameCallback = [NativeDisplayName::class, 'resolve'];
            $userModule->controllerMap['account'] = \humhub\modules\matcherProfile\adapters\native\AccountController::class;
            $userModule->controllerMap['image'] = \humhub\modules\matcherProfile\controllers\NativeImageController::class;
        }
        $adminModule = Yii::$app->getModule('admin');
        if ($adminModule !== null) { $adminModule->controllerMap['user'] = \humhub\modules\matcherProfile\adapters\native\AdminUserController::class; }
    }

    public function getProfileRepository(): \humhub\modules\matcherProfile\domain\ports\ProfileRepository
    {
        return $this->profileRepository ??= new \humhub\modules\matcherProfile\adapters\persistence\SqlProfileRepository(Yii::$app->db);
    }

    public function getPresentationRepository(): \humhub\modules\matcherProfile\domain\ports\ProfilePresentationRepository
    { return new \humhub\modules\matcherProfile\adapters\persistence\SqlProfilePresentationRepository(Yii::$app->db); }

    public function getPresentationService(): \humhub\modules\matcherProfile\application\ProfilePresentationService
    { return new \humhub\modules\matcherProfile\application\ProfilePresentationService($this->getProfileRepository(), $this->getPresentationRepository(), $this->getAccessPolicy()); }

    /** Optional external relation capability; P1 never queries social objects or stores their content. */
    public function getProfileRelationReader(): \humhub\modules\matcherProfile\domain\ports\ProfileRelationReader
    {
        $privacy = Yii::$app->getModule('matcher-profile-privacy');
        if ($privacy === null || !$privacy->isEnabled || !method_exists($privacy, 'getRelationReader')) {
            throw new \humhub\modules\matcherProfile\domain\ProfileException('RELATION_SOURCE_UNAVAILABLE', 'Enable the reviewed profile relation privacy capability.', 503);
        }
        return $privacy->getRelationReader();
    }

    public function getAccessPolicy(): \humhub\modules\matcherProfile\domain\ports\ProfileAccessPolicy
    {
        return $this->profileAccessPolicy ??= new \humhub\modules\matcherProfile\adapters\persistence\NativeProfileAccessPolicy(Yii::$app->db, fn() => $this->isInMaintenance());
    }

    public function getIdentityService(): \humhub\modules\matcherProfile\application\IdentityService
    {
        return $this->identityService ??= new \humhub\modules\matcherProfile\application\IdentityService(
            new \humhub\modules\matcherProfile\adapters\media\SqlIdentityStore(Yii::$app->db, $this->getProfileRepository()),
            $this->getAccessPolicy(),
            new \humhub\modules\matcherProfile\adapters\media\LocalProfileMediaStore($this->mediaStoragePath ?? Yii::getAlias('@runtime/matcher-profile-media')),
            $this->getReadPolicy(),
        );
    }

    public function getProfileService(): \humhub\modules\matcherProfile\application\ProfileService
    {
        return $this->profileService ??= new \humhub\modules\matcherProfile\application\ProfileService($this->getProfileRepository(), $this->getAccessPolicy(), $this->getIdentityService(), null, $this->getReadPolicy());
    }

    /** Internal confirmed-data source; callers must use P8's batch authorization boundary. */
    public function getConfirmedIdentityBatchReader(): \humhub\modules\matcherProfile\application\ConfirmedIdentityBatchReader
    {
        return new \humhub\modules\matcherProfile\application\ConfirmedIdentityBatchReader(
            new \humhub\modules\matcherProfile\adapters\identity\SqlConfirmedIdentityBatchSource(Yii::$app->db),
        );
    }
    public function getDiscoveryProfileBatchReader(): \humhub\modules\matcherProfile\application\DiscoveryProfileBatchReader
    {
        return new \humhub\modules\matcherProfile\application\DiscoveryProfileBatchReader(
            new \humhub\modules\matcherProfile\adapters\persistence\SqlDiscoveryProfileBatchSource(Yii::$app->db),
        );
    }

    /** Explicit owner-authorized minimal analysis reads; never the full editor profile. */
    public function getSelectedSelfProfileReader(): \humhub\modules\matcherProfile\application\SelectedSelfProfileReader
    {
        return new \humhub\modules\matcherProfile\application\SelectedSelfProfileReader(
            $this->getAccessPolicy(), $this->getDiscoveryProfileBatchReader(),
        );
    }

    public function getReadPolicy(): ?\humhub\modules\matcherProfile\domain\ports\ProfileReadPolicy
    {
        if (!Yii::$app->hasModule('matcher-profile-privacy')) { return null; }
        $privacy = Yii::$app->getModule('matcher-profile-privacy');
        return $privacy instanceof \humhub\modules\matcherPrivacy\Module && $privacy->isEnabled ? $privacy->getReadPolicy() : null;
    }

    public function getProfileWorkflow(): \humhub\modules\matcherProfile\domain\ports\ProfileWorkflow
    {
        return $this->profileWorkflow ??= new \humhub\modules\matcherProfile\adapters\persistence\NativeProfileWorkflow($this, Yii::$app->db);
    }

    public function getQuestionRepository(): \humhub\modules\matcherProfile\domain\ports\QuestionRepository
    {
        return $this->questionRepository ??= new \humhub\modules\matcherProfile\adapters\persistence\SqlQuestionRepository(Yii::$app->db);
    }

    public function getQuestionService(): \humhub\modules\matcherProfile\application\QuestionService
    {
        return $this->questionService ??= new \humhub\modules\matcherProfile\application\QuestionService($this->getQuestionRepository(), $this->getProfileWorkflow());
    }

    public function getAiJobRepository(): \humhub\modules\matcherProfile\domain\ports\ProfileAiJobRepository
    { return new \humhub\modules\matcherProfile\adapters\persistence\SqlProfileAiJobRepository(Yii::$app->db); }

    public function getSourceRepository(): \humhub\modules\matcherProfile\domain\ports\ProfileSourceRepository
    { return new \humhub\modules\matcherProfile\adapters\persistence\SqlProfileSourceRepository(Yii::$app->db); }

    public function getSourceService(): \humhub\modules\matcherProfile\application\ProfileSourceService
    {
        return new \humhub\modules\matcherProfile\application\ProfileSourceService(
            
            $this->getSourceRepository(),
            $this->getProfileWorkflow(), $this->getAccessPolicy(),
            function (string $kind): ?\humhub\modules\matcherProfile\domain\ports\ProfileSourceReader {
                $id = ['github' => 'matcher-github-import', 'resume' => 'matcher-resume-import', 'web' => 'matcher-web-import', 'text' => 'matcher-web-import'][$kind] ?? null;
                if ($id === null || !Yii::$app->hasModule($id)) { return null; }
                $module = Yii::$app->getModule($id);
                if ($module === null || !$module->isEnabled || !method_exists($module, 'getSourceReader')) { return null; }
                return in_array($kind, ['web', 'text'], true) ? $module->getSourceReader($kind) : $module->getSourceReader();
            },
            fn(string $sourceId) => $this->getAiJobRepository()->revokeSource($sourceId),
        );
    }

    public function getIdempotencyGuard(): \humhub\modules\matcherProfile\adapters\http\IdempotencyGuard
    {
        return new \humhub\modules\matcherProfile\adapters\http\IdempotencyGuard(Yii::$app->db, $this->getProfileRepository());
    }

    public function mediaUrl(string $ref, string $variant = 'main', bool $scheme = false): string
    {
        return \yii\helpers\Url::to(['/matcher-user-profile/api/media', 'ref' => $ref, 'variant' => $variant], $scheme);
    }

    public function getFieldCatalog(): array
    {
        return ['schema_version' => FieldCatalog::VERSION, 'fields' => FieldCatalog::definitions(), 'identities' => FieldCatalog::identities(), 'relations' => FieldCatalog::relations()];
    }

    /** Keep the module, identity hook and future access guard loaded while writes are paused. */
    public function enterMaintenance(): void
    {
        $this->settings->set('maintenanceMode', '1');
    }

    public function leaveMaintenance(): void
    {
        $this->settings->set('maintenanceMode', '0');
    }

    public function isInMaintenance(): bool
    {
        return (string) $this->settings->get('maintenanceMode', '0') === '1';
    }

    /** Native disable uninstalls data; profile retirement requires an explicit replacement adapter. */
    public function disable()
    {
        throw new \LogicException('Profile data is retained. Use enterMaintenance(); disabling requires a reviewed access-protection handover.');
    }

    public function getModuleService(): ModuleService
    {
        return new RetainedProfileModuleService($this);
    }
}

/** Tightens public removal only; the native enable/registration mechanics remain intact. */
final class RetainedProfileModuleService extends ModuleService
{
    public function canRemove(): bool { return false; }

    public function remove(bool $disableBeforeRemove = true): ?string
    {
        throw new \LogicException('Profile module removal requires a reviewed migration and access-protection handover.');
    }
}
