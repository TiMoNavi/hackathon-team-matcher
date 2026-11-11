<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;
use humhub\modules\matcherRecommendation\contracts\QueryIntent;

interface CandidateRetriever
{
    /**
     * Current Space and purpose-filtered index only. Structured<=80, fulltext<=40, optional semantic<=80;
     * merged unique target_type+id <=200. No raw profile values. No embedding dependency for ordinary discovery.
     * @return list<array{target_type:string,id:string,routes:array<string,int>}>
     * Rank is 1-based. Global ordinary pagination is a separate interface, not limited to this batch's first 200.
     */
    public function recall(CurrentEventContext $context, QueryIntent $intent): array;
}
