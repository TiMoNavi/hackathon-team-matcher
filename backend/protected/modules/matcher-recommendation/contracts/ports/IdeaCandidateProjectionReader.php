<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\CandidateRequest;
use humhub\modules\matcherRecommendation\contracts\CandidateProjection;

interface IdeaCandidateProjectionReader
{
    /**
     * Idea only; batch authorization in current Space, <=200 requested IDs, independent idea permission/version rules.
     * Do not apply person friend/pending/sent-history exclusions merely because of the author's relationship.
     * Unknown gaps/capacity remain unknown. Dependency errors are not empty success.
     * @return list<CandidateProjection>
     */
    public function read(CandidateRequest $request): array;
}
