<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CurrentEventContext};

/** Independent owner-authorized, purpose-approved data boundary; never a selection authority. */
interface SelfAnalysisProfileReader
{
    /** Exact selected attribute IDs. [] verifies versions without reading attribute values. */
    public function read(CurrentEventContext $context, array $attributeIds): CandidateProjection;
    /** Separate owner picker, not analysis consent. @return array{projection:CandidateProjection,options:array} */
    public function options(CurrentEventContext $context): array;
}
