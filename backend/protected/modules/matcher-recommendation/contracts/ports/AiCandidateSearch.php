<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\{CurrentEventContext, QueryIntent};
use humhub\modules\matcherRecommendation\domain\DiscoveryMatch;

interface AiCandidateSearch
{
    /** Backend-only bounded tool. Context is server supplied, not model JSON. @return list<DiscoveryMatch> At most 200 rule-qualified people. */
    public function search(CurrentEventContext $context, QueryIntent $intent): array;
}
