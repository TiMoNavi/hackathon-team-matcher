<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\domain\config\PolicyDraft;
use humhub\modules\matcherRecommendation\domain\RulePolicy;

interface PolicyRevisionStore
{
    /**
     * Atomic, isolated transaction; roll back all writes if the callback throws. No production adapter in R2.
     * Production composition must coordinate management/catalog version guards through commit, e.g. shared
     * locks or transactional epochs. Separate snapshot reads alone cannot close external revocation races.
     */
    public function transaction(callable $operation): mixed;
    public function draft(string $draftId): ?PolicyDraft;
    /** Compare-and-swap. null means absent; otherwise require exact revision and a +1 new revision. */
    public function save(PolicyDraft $draft, ?int $expectedRevision): void;
    public function active(): ?RulePolicy;
    public function published(string $version): ?RulePolicy;
    /** Atomically compare draft revision AND active pointer, append immutable history and move active pointer. */
    public function publish(string $draftId, int $expectedRevision, ?string $expectedActiveVersion, RulePolicy $policy): void;
}
