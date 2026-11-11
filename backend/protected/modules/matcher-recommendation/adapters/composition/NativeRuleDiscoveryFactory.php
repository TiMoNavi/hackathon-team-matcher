<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\composition;

use humhub\modules\matcherRecommendation\adapters\index\SqlCandidateIndexAccess;
use humhub\modules\matcherRecommendation\adapters\native\{NativeContactEligibilityReader, NativeEligibilityQuery};
use humhub\modules\matcherRecommendation\adapters\profile\{P1CandidateProjectionReader, P1SourcePurposePolicy};
use humhub\modules\matcherRecommendation\adapters\retrieval\SqlCandidateRetriever;
use humhub\modules\matcherRecommendation\application\{DiscoverPeople, ReadDiscoveryBatch};
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;
use humhub\modules\matcherRecommendation\contracts\ports\{Clock, CurrentEventAccess, DiscoveryBatchStore, DiscoveryCursorCodec, PolicyStore, ProfileFieldCatalog};
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;
use yii\db\Connection;

/**
 * Explicit trusted composition. No default policy, test data, database connection, schema migration,
 * module enablement, HTTP route or AI client is created here. Supply initialized capabilities.
 * Each created use case is pinned to one verified actor/selection/policy; create anew for another run.
 */
final class NativeRuleDiscoveryFactory
{
    private readonly \Closure $authorizedProfiles;

    /** $authorizedProfiles must be the installed P8 DiscoveryBatchService::read capability. */
    public function __construct(
        private readonly Connection $db,
        private readonly CurrentEventAccess $events,
        private readonly ProfileFieldCatalog $catalog,
        callable $authorizedProfiles,
        private readonly PolicyStore $policies,
        private readonly DiscoveryBatchStore $batches,
        private readonly Clock $clock,
        private readonly int $maxIndexSubjects = 2000,
    ) {
        if ($maxIndexSubjects < 1 || $maxIndexSubjects > 2000) {
            throw new \InvalidArgumentException('Index construction capacity must be between 1 and 2000 subjects.');
        }
        $this->authorizedProfiles = \Closure::fromCallable($authorizedProfiles);
    }

    public function create(int $viewerId, ?int $requestedSpaceId = null): DiscoverPeople
    {
        [$store, $profiles, $native, $rules] = $this->dependencies($viewerId, $requestedSpaceId);
        $index = new SqlCandidateIndexAccess(
            $this->db, $native, $this->events, $profiles, $store,
            P1SourcePurposePolicy::VERSION, $this->maxIndexSubjects, clock: $this->clock,
        );
        $recall = new SqlCandidateRetriever($native, $this->events, $store, $rules, $index);
        return new DiscoverPeople(
            $this->events, $recall, $profiles, new NativeContactEligibilityReader($this->db, $this->events),
            $rules, $store, $this->batches, $this->clock,
        );
    }

    /** Fresh request assembly. Cursor signing capability is explicit and no identity fields are guessed. */
    public function createBatchReader(int $viewerId, #[\SensitiveParameter] DiscoveryCursorCodec $cursors, ?int $requestedSpaceId = null): ReadDiscoveryBatch
    {
        [$store, $profiles] = $this->dependencies($viewerId, $requestedSpaceId);
        return new ReadDiscoveryBatch(
            $this->events, $profiles, new NativeContactEligibilityReader($this->db, $this->events),
            $store, $this->batches, $this->clock, $cursors,
        );
    }

    private function dependencies(int $viewerId, ?int $requestedSpaceId): array
    {
        $context = $this->events->resolve($viewerId, $requestedSpaceId);
        if ($context->viewerId !== $viewerId || ($requestedSpaceId !== null && $context->spaceId !== $requestedSpaceId)) {
            throw new \UnexpectedValueException('Activity authority returned a different context.');
        }
        $policy = $this->policies->current($context);
        $store = new class($this->policies, Fingerprint::of($context), Fingerprint::of($policy)) implements PolicyStore {
            public function __construct(private readonly PolicyStore $source, private readonly string $contextFingerprint, private readonly string $policyFingerprint) {}
            public function current(CurrentEventContext $context): RulePolicy
            {
                if (Fingerprint::of($context) !== $this->contextFingerprint) {
                    throw new \RuntimeException('The rule run belongs to a different activity selection.');
                }
                $current = $this->source->current($context);
                if (Fingerprint::of($current) !== $this->policyFingerprint) {
                    throw new \RuntimeException('The published rule policy changed; create a fresh rule run.');
                }
                return $current;
            }
        };
        $profiles = new P1CandidateProjectionReader($this->events, $this->catalog, $policy, $this->authorizedProfiles);
        $native = new NativeEligibilityQuery($this->db);
        $rules = new DeterministicRuleEvaluator();
        $this->events->assertCurrent($context);
        return [$store, $profiles, $native, $rules];
    }
}
