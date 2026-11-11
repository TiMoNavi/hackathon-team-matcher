<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy;

use humhub\modules\matcherPrivacy\application\ProfileReadPolicy;
use humhub\modules\matcherPrivacy\application\PrivacyService;
use humhub\modules\matcherPrivacy\adapters\native\NativeProfileRelations;
use humhub\modules\matcherProfile\Module as ProfileModule;
use humhub\services\ModuleService;
use Yii;
use yii\base\Event;

/** Field data stays in the ordinary profile module; privacy has an independent lifecycle. */
final class Module extends \humhub\components\Module
{
    private ?ProfileReadPolicy $readPolicy = null;
    private ?PrivacyService $privacyService = null;
    private ?\humhub\modules\matcherPrivacy\application\DiscoveryBatchService $discoveryBatchService = null;

    public function init()
    {
        parent::init();
        Yii::setAlias('@matcherPrivacy', $this->getBasePath());
    }
    public static function bootstrapNative(Event $event): void
    {
        $module = Yii::$app->getModule('matcher-profile-privacy');
        if ($module instanceof self && $module->isEnabled) {
            \humhub\modules\matcherPrivacy\adapters\native\NativePrivacyHooks::install();
        }
    }
    public function getReadPolicy(): ProfileReadPolicy
    {
        return $this->readPolicy ??= new ProfileReadPolicy(new NativeProfileRelations(Yii::$app->db), $this->profileModule()->getProfileRepository());
    }
    public function getPrivacyService(): PrivacyService
    {
        return $this->privacyService ??= new PrivacyService($this->profileModule()->getProfileService(), $this->getReadPolicy(), $this->profileModule()->getProfileRepository());
    }
    public function getCurrentProfileEntry(): \humhub\modules\matcherPrivacy\domain\ports\CurrentProfileEntry
    {
        $profile = $this->profileModule();
        if (!method_exists($profile, 'getConfirmedIdentityBatchReader')) {
            throw new \humhub\modules\matcherProfile\domain\ProfileException('PROFILE_DEPENDENCY_UNAVAILABLE', 'The installed profile module does not provide confirmed identity reads.', 503);
        }
        return new \humhub\modules\matcherPrivacy\adapters\native\NativeCurrentProfileEntry(Yii::$app->db, static function (int $viewerId, int $spaceId): array {
            $module = Yii::$app->getModule('matcher-recommendation');
            if ($module === null || !$module->isEnabled || !method_exists($module, 'getCurrentEventAccess')) {
                throw new \humhub\modules\matcherProfile\domain\ProfileException('PROFILE_ENTRY_UNAVAILABLE', 'The server current activity capability is unavailable.', 503);
            }
            $context = $module->getCurrentEventAccess()->resolve($viewerId, $spaceId);
            return ['viewer_id' => $context->viewerId, 'space_id' => $context->spaceId, 'access_version' => $context->accessVersion, 'policy_version' => $context->policyVersion];
        }, $profile->getConfirmedIdentityBatchReader()->read(...));
    }
    public function getOverviewService(): \humhub\modules\matcherPrivacy\application\ProfileOverviewService
    {
        $profile = $this->profileModule();
        if (!method_exists($profile, 'getPresentationRepository')) {
            throw new \humhub\modules\matcherProfile\domain\ProfileException('PROFILE_DEPENDENCY_UNAVAILABLE', 'The installed profile module does not provide presentation settings.', 503);
        }
        return new \humhub\modules\matcherPrivacy\application\ProfileOverviewService($this->getPrivacyService(), $profile->getPresentationRepository(), $this->getCurrentProfileEntry());
    }
    public function getPresentationService(): \humhub\modules\matcherProfile\application\ProfilePresentationService
    {
        $profile = $this->profileModule();
        if (!method_exists($profile, 'getPresentationService')) {
            throw new \humhub\modules\matcherProfile\domain\ProfileException('PROFILE_DEPENDENCY_UNAVAILABLE', 'The installed profile module does not provide presentation settings.', 503);
        }
        return $profile->getPresentationService();
    }
    public function getRelationReader(): \humhub\modules\matcherPrivacy\application\ProfileRelationService
    {
        $secret = Yii::$app->request->cookieValidationKey ?? null;
        if (!is_string($secret) || $secret === '') { throw new \humhub\modules\matcherProfile\domain\ProfileException('RELATION_SOURCE_UNAVAILABLE', 'Relation cursor signing is not configured.', 503); }
        return new \humhub\modules\matcherPrivacy\application\ProfileRelationService(
            $this->getCurrentProfileEntry(),
            new \humhub\modules\matcherPrivacy\adapters\native\NativeRelationCandidateSource(Yii::$app->db, static function (): ?object {
                $module = Yii::$app->getModule('matcher-ideas');
                return $module !== null && $module->isEnabled && method_exists($module, 'getRelationSource') ? $module->getRelationSource() : null;
            }, (bool)(Yii::$app->getModule('space')->hideMembers ?? false)),
            new \humhub\modules\matcherPrivacy\adapters\persistence\SqlRelationSharingRepository(Yii::$app->db),
            new \humhub\modules\matcherPrivacy\domain\RelationCursor(hash('sha256', 'matcher-profile-relations-v1:' . $secret, true)),
        );
    }
    /** Internal batch service; HTTP callers must first bind the current server-selected activity. */
    public function getDiscoveryBatchService(): \humhub\modules\matcherPrivacy\application\DiscoveryBatchService
    {
        $profile = $this->profileModule();
        if (!method_exists($profile, 'getDiscoveryProfileBatchReader')) {
            throw new \humhub\modules\matcherProfile\domain\ProfileException('PROFILE_DEPENDENCY_UNAVAILABLE', 'The installed profile module does not provide discovery batch reads.', 503);
        }
        return $this->discoveryBatchService ??= new \humhub\modules\matcherPrivacy\application\DiscoveryBatchService(
            new \humhub\modules\matcherPrivacy\adapters\native\NativeDiscoveryRelations(Yii::$app->db),
            $profile->getDiscoveryProfileBatchReader()->read(...),
        );
    }
    public function profileModule(): ProfileModule
    {
        $module = Yii::$app->getModule('matcher-user-profile');
        if (!$module instanceof ProfileModule || !$module->isEnabled || version_compare($module->version, '0.3.0', '<')) {
            throw new \RuntimeException('Enable matcher-user-profile 0.3.0 or later before using profile privacy.');
        }
        return $module;
    }
    public function disable()
    {
        throw new \LogicException('Saved private and friends policies remain protected. Privacy retirement requires a reviewed replacement adapter.');
    }
    public function getModuleService(): ModuleService { return new RetainedPrivacyModuleService($this); }
}

final class RetainedPrivacyModuleService extends ModuleService
{
    public function canRemove(): bool { return false; }
    public function remove(bool $disableBeforeRemove = true): ?string
    {
        throw new \LogicException('Privacy removal requires a reviewed access-protection handover.');
    }
}
