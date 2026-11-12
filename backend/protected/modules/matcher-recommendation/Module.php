<?php
declare(strict_types=1);

namespace humhub\modules\matcherRecommendation;

use humhub\modules\matcherRecommendation\application\DiscoverPeople;

/**
 * Native HumHub module. Ordinary discovery has a lazy, authorized composition root.
 * Rule recommendation remains explicitly injected; tests never become defaults.
 * Loading this module does not read profiles, open a connection or create an AI client.
 */
final class Module extends \humhub\components\Module
{
    private ?DiscoverPeople $discoveryService = null;
    private ?\humhub\modules\matcherRecommendation\adapters\native\SqlCurrentEventSelectionStore $selectionStore = null;
    private ?\humhub\modules\matcherRecommendation\contracts\ports\CurrentEventAccess $currentEvents = null;
    private ?\humhub\modules\matcherRecommendation\application\BrowsePeople $ordinaryDiscovery = null;
    private ?\humhub\modules\matcherRecommendation\application\ManageDiscoverySettings $discoverySettings = null;
    private ?\humhub\modules\matcherRecommendation\contracts\ports\ContactEligibilityReader $conversationHistory = null;
    private ?\humhub\modules\matcherRecommendation\contracts\ports\AiPlatformBudget $conversationPlatformBudget = null;

    /** Trusted host capabilities only. Never constructed from request fields or native history guesses. */
    public function setConversationDependencies(
        \humhub\modules\matcherRecommendation\contracts\ports\ContactEligibilityReader $history,
        \humhub\modules\matcherRecommendation\contracts\ports\AiPlatformBudget $platformBudget): void
    { $this->conversationHistory = $history; $this->conversationPlatformBudget = $platformBudget; }

    public function getConversationFactory(): \humhub\modules\matcherRecommendation\adapters\composition\NativeConversationFactory
    {
        return new \humhub\modules\matcherRecommendation\adapters\composition\NativeConversationFactory(
            \Yii::$app->db, $this->getCurrentEventAccess(), static fn(string $id) => \Yii::$app->getModule($id),
            $this->conversationHistory, $this->conversationPlatformBudget, fn(): bool => $this->isEnabled);
    }
    /** Native disable is retained and fail-closed; resuming requires an explicit new runtime revision. */
    public function pauseConversations(?string $providerId = null): void
    {
        try {
            // An older rules-only installation has no runtime and therefore cannot have active conversations.
            if (\Yii::$app->db->getTableSchema('{{%matcher_recommendation_runtime}}', true) === null) { return; }
        } catch (\Throwable) { throw new \humhub\modules\matcherRecommendation\adapters\conversation\ConversationReadinessException('storage_unavailable'); }
        $runtime = $this->getConversationRuntime(); $row = $runtime->read();
        if ($providerId !== null && $row['provider_id'] !== $providerId) { return; }
        $runtime->configure($row['revision'], false, $row['provider_id'], $row['provider_revision']);
    }
    /** Deployment/lifecycle access must also work in native console and queue processes without a web session. */
    public function getConversationRuntime(): \humhub\modules\matcherRecommendation\adapters\conversation\PdoConversationRuntime
    {
        try {
            $db = \Yii::$app->db;
            if ($db->getTransaction()?->isActive) { throw new \RuntimeException(); }
            return new \humhub\modules\matcherRecommendation\adapters\conversation\PdoConversationRuntime($db->getMasterPdo(), $db->tablePrefix);
        } catch (\Throwable) { throw new \humhub\modules\matcherRecommendation\adapters\conversation\ConversationReadinessException('storage_unavailable'); }
    }
    public function disable() { $this->pauseConversations(); $this->getModuleService()->disable(); return true; }

    /** Lazy production composition; module loading still performs no database or profile reads. */
    public function getCurrentEventSelectionStore(): \humhub\modules\matcherRecommendation\adapters\native\SqlCurrentEventSelectionStore
    {
        return $this->selectionStore ??= new \humhub\modules\matcherRecommendation\adapters\native\SqlCurrentEventSelectionStore(
            \Yii::$app->db, new \humhub\modules\matcherRecommendation\adapters\native\YiiActorSessionSource(\Yii::$app->user, \Yii::$app->session), 'ordinary-activity-access-v1');
    }
    public function getCurrentEventAccess(): \humhub\modules\matcherRecommendation\contracts\ports\CurrentEventAccess
    {
        return $this->currentEvents ??= new \humhub\modules\matcherRecommendation\adapters\native\NativeCurrentEventAccess(
            \Yii::$app->db, $this->getCurrentEventSelectionStore(), 'ordinary-activity-access-v1');
    }
    public function getDiscoverySettingsService(): \humhub\modules\matcherRecommendation\application\ManageDiscoverySettings
    {
        return $this->discoverySettings ??= new \humhub\modules\matcherRecommendation\application\ManageDiscoverySettings(
            $this->getCurrentEventAccess(), new \humhub\modules\matcherRecommendation\adapters\browse\SqlDiscoverySettingsStore(\Yii::$app->db, $this->getCurrentEventAccess()));
    }
    public function getOrdinaryDiscoveryService(): \humhub\modules\matcherRecommendation\application\BrowsePeople
    {
        if ($this->ordinaryDiscovery !== null) { return $this->ordinaryDiscovery; }
        $profile = \Yii::$app->getModule('matcher-user-profile'); $privacy = \Yii::$app->getModule('matcher-profile-privacy');
        if (!$profile instanceof \humhub\modules\matcherProfile\Module || !$profile->isEnabled || !method_exists($profile, 'getConfirmedIdentityBatchReader')
            || !$privacy instanceof \humhub\modules\matcherPrivacy\Module || !$privacy->isEnabled
            || !in_array('event_seeking', \humhub\modules\matcherPrivacy\domain\DiscoveryFieldPolicy::KEYS, true)) {
            throw new \humhub\modules\matcherRecommendation\domain\browse\DiscoveryException('DISCOVERY_UNAVAILABLE', 'Enable the reviewed profile and privacy discovery adapters.', 503);
        }
        $key = \Yii::$app->request->cookieValidationKey;
        return $this->ordinaryDiscovery = new \humhub\modules\matcherRecommendation\application\BrowsePeople($this->getCurrentEventAccess(),
            new \humhub\modules\matcherRecommendation\adapters\browse\NativeOrdinaryDiscoverySource(\Yii::$app->db, $this->getCurrentEventAccess(),
                $privacy->getDiscoveryBatchService()->read(...), $profile->getConfirmedIdentityBatchReader()->read(...)),
            new \humhub\modules\matcherRecommendation\adapters\browse\HmacOrdinaryCursorCodec($key),
            new \humhub\modules\matcherRecommendation\adapters\time\SystemClock());
    }

    /** Explicit zero-model page analysis; all dependencies are checked lazily per operation. */
    public function getCooperationFactory(): \humhub\modules\matcherRecommendation\adapters\composition\NativeCooperationFactory
    {
        return new \humhub\modules\matcherRecommendation\adapters\composition\NativeCooperationFactory($this);
    }

    /** Trusted composition-root injection, never a public HTTP/model operation. */
    public function setDiscoveryService(DiscoverPeople $service): void
    {
        $this->discoveryService = $service;
    }

    /** Wiring status only; each use-case execution must still authorize its inputs. */
    public function hasDiscoveryService(): bool
    {
        return $this->discoveryService !== null;
    }

    public function getDiscoveryService(): DiscoverPeople
    {
        if ($this->discoveryService === null) {
            throw new \RuntimeException('Recommendation dependencies are not configured.');
        }
        return $this->discoveryService;
    }
}

