<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\CandidateRequest;
use humhub\modules\matcherRecommendation\contracts\CandidateProjection;

interface CandidateProjectionReader
{
    /**
     * Person only, IDs <=200; revalidate context and each subject, return only requested eligible IDs.
     * Apply confirmed + authenticated + discovery-purpose allowlist, excluding contact_* and sensitive sources.
     * Omitted IDs mean inaccessible/missing; do not expose hidden exclusion reasons. A dependency failure throws,
     * never returns [] as if a complete authorized query found no candidates. Do not loop P1 getProfile as a fake batch.
     * @return list<CandidateProjection>
     */
    public function read(CandidateRequest $request): array;
}
