<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\QueryIntent;

interface CandidateReranker
{
    /**
     * Optional provider only; <=24 purpose-approved serialized summaries, <=768 UTF-8 bytes each;
     * entire serialized model request <=24 KiB. Core supplies a reserved counted attempt, no implicit retries.
     * No retrieval tools here. <=5 unique pool members with target-specific evidence. Core revalidates final output.
     * @param list<array<string,mixed>> $summaries
     * @return list<array{target_type:string,id:string,evidence_ids:list<string>}>
     */
    public function rerank(QueryIntent $intent, array $summaries, string $callPermit): array;
}
