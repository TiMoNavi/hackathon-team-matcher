<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\composition;

use humhub\modules\matcherRecommendation\adapters\conversation\{ConversationReadinessException, PdoConversationRuntime, PdoConversationStore, PdoRecommendationBudget};
use humhub\modules\matcherRecommendation\adapters\index\SqlCandidateIndexAccess;
use humhub\modules\matcherRecommendation\adapters\native\{HistoryBackedContactEligibilityReader, NativeContactEligibilityReader, NativeEligibilityQuery};
use humhub\modules\matcherRecommendation\adapters\persistence\{PublishedPolicyStore, SqlPolicyRevisionStore};
use humhub\modules\matcherRecommendation\adapters\profile\{P1CandidateProjectionReader, P1FieldCatalogAdapter, P1SourcePurposePolicy};
use humhub\modules\matcherRecommendation\adapters\retrieval\SqlCandidateRetriever;
use humhub\modules\matcherRecommendation\adapters\time\SystemClock;
use humhub\modules\matcherRecommendation\application\ai\SearchAiCandidates;
use humhub\modules\matcherRecommendation\application\conversation\ConversationService;
use humhub\modules\matcherRecommendation\contracts\ports\{AiPlatformBudget, ContactEligibilityReader, ConversationProviderSource, CurrentEventAccess};
use humhub\modules\matcherRecommendation\domain\conversation\ConversationLimits;
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;
use yii\db\Connection;

/** Real HumHub adapters, assembled lazily per request. No fixture, network, or automatic install. */
final class NativeConversationFactory
{
    private readonly \Closure $module;
    public function __construct(private readonly Connection $db, private readonly CurrentEventAccess $events, callable $moduleResolver,
        private readonly ?ContactEligibilityReader $history = null, private readonly ?AiPlatformBudget $platform = null,
        private readonly ?\Closure $hostEnabled = null)
    { $this->module = \Closure::fromCallable($moduleResolver); }

    public function store(): PdoConversationStore { return new PdoConversationStore($this->pdo(), tablePrefix: $this->db->tablePrefix); }
    public function runtime(): PdoConversationRuntime
    {
        return new PdoConversationRuntime($this->pdo(), $this->db->tablePrefix, function (array $row): bool {
            if ($this->hostEnabled !== null && !($this->hostEnabled)()) { return false; }
            try { $this->provider($row); return true; } catch (\Throwable) { return false; }
        });
    }
    public function create(int $viewerId, ?int $spaceId = null): ConversationService
    {
        // The real session and current selection are checked even when the feature is unavailable.
        $context = $this->events->resolve($viewerId, $spaceId); $this->events->assertCurrent($context);
        $runtime = $this->runtime(); $configuration = $runtime->read();
        if (!$configuration['enabled'] || ($this->hostEnabled !== null && !($this->hostEnabled)())) { throw new ConversationReadinessException('disabled'); }
        $nativeContacts = new NativeContactEligibilityReader($this->db, $this->events);
        $contacts = $this->history === null ? $nativeContacts : new HistoryBackedContactEligibilityReader($nativeContacts, $this->history, $this->events);
        try { $hasHistory = $contacts->supportsSentHistory(); } catch (\Throwable) { $hasHistory = false; }
        if (!$hasHistory) { throw new ConversationReadinessException('history_unavailable'); }
        if ($this->platform === null) { throw new ConversationReadinessException('platform_budget_unavailable'); }
        $provider = $this->provider($configuration); $identity = $runtime->identity();
        $profile = ($this->module)('matcher-user-profile'); $privacy = ($this->module)('matcher-profile-privacy');
        if (!$profile instanceof \humhub\modules\matcherProfile\Module || !$profile->isEnabled
            || !$privacy instanceof \humhub\modules\matcherPrivacy\Module || !$privacy->isEnabled) { throw new ConversationReadinessException('profile_unavailable'); }
        $policies = new PublishedPolicyStore(new SqlPolicyRevisionStore($this->db), $this->events);
        try { $policy = $policies->current($context); } catch (\Throwable) { throw new ConversationReadinessException('policy_unavailable'); }
        $catalog = new P1FieldCatalogAdapter($profile->getFieldCatalog(...));
        $profiles = new P1CandidateProjectionReader($this->events, $catalog, $policy, $privacy->getDiscoveryBatchService()->read(...));
        $native = new NativeEligibilityQuery($this->db); $rules = new DeterministicRuleEvaluator(); $clock = new SystemClock();
        $index = new SqlCandidateIndexAccess($this->db, $native, $this->events, $profiles, $policies, P1SourcePurposePolicy::VERSION, clock: $clock);
        $retriever = new SqlCandidateRetriever($native, $this->events, $policies, $rules, $index);
        $budget = new PdoRecommendationBudget($this->pdo(), $this->platform, $runtime, $identity, $clock, $this->db->tablePrefix);
        $budget->read(); // Missing migration cannot become an unlimited budget. Zero allowance denies at first attempt.
        return new ConversationService($this->events, $policies, $rules,
            new SearchAiCandidates($this->events, $retriever, $profiles, $contacts, $rules, $policies),
            $profiles, $contacts, $budget, $provider->getConversationProvider(), $this->store(), $clock,
            new ConversationLimits(20, 40, 2), $identity, $runtime);
    }
    private function provider(array $configuration): ConversationProviderSource
    {
        try {
            $module = ($this->module)($configuration['provider_id']);
            if (!$module instanceof ConversationProviderSource || !($module->isEnabled ?? false)
                || $module->getConversationRevision() !== $configuration['provider_revision']) { throw new \RuntimeException(); }
            return $module;
        } catch (\Throwable) { throw new ConversationReadinessException('provider_unconfigured'); }
    }
    private function pdo(): \PDO
    {
        try {
            if ($this->db->getTransaction()?->isActive) { throw new \RuntimeException(); }
            return $this->db->getMasterPdo();
        } catch (\Throwable) { throw new ConversationReadinessException('storage_unavailable'); }
    }
}
