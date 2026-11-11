<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\{AuthorizedIndexSnapshot, CurrentEventContext};
use humhub\modules\matcherRecommendation\domain\RulePolicy;

/** Backend authorization capability, not a model tool or a caller-asserted index-ready flag. */
interface CandidateIndexAccess
{
    /**
     * Require a real bulk discovery source, independent source-purpose grants, current source/permission
     * epochs and a fully published index generation compatible with this policy and verified context.
     * Index data must contain only currently authorized, confirmed authenticated minimal feature terms;
     * raw sources, contacts, private/friends values, drafts and unconfirmed entries are never allowed.
     * The structured route must cover every current bound token feature used by a hard predicate,
     * including explicit preferences; partial or truncated feature coverage is not a usable generation.
     * All terms are canonical for this policy. Duplicate terms never represent additional evidence.
     * Missing provider, stale generation or failed validation throws, never returns an invented empty index.
     */
    public function acquire(CurrentEventContext $context, RulePolicy $policy): AuthorizedIndexSnapshot;
    /** Recheck source epochs, purpose grants, generation and viewer authorization after the bounded SQL read. */
    public function assertCurrent(CurrentEventContext $context, RulePolicy $policy, AuthorizedIndexSnapshot $snapshot): void;
}
