<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\AuthorizedIndexSnapshot;

/** Request-owned published index. The caller must release in finally, including failed recall. */
interface ManagedCandidateIndexAccess extends CandidateIndexAccess
{
    /** Only an issued snapshot may be released; repeating its successful release is harmless. */
    public function release(AuthorizedIndexSnapshot $snapshot): void;
}
