<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\persistence;
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;
use humhub\modules\matcherRecommendation\contracts\ports\{CurrentEventAccess, PolicyRevisionStore, PolicyStore};
use humhub\modules\matcherRecommendation\domain\RulePolicy;

/** Explicit published policy only; activity authorization remains independent of the policy table. */
final class PublishedPolicyStore implements PolicyStore
{
    public function __construct(private readonly PolicyRevisionStore $revisions, private readonly CurrentEventAccess $events) {}
    public function current(CurrentEventContext $context): RulePolicy
    {
        $this->events->assertCurrent($context);
        $policy = $this->revisions->active() ?? throw new StorageException('policy_unavailable');
        $this->events->assertCurrent($context);
        return $policy;
    }
}
