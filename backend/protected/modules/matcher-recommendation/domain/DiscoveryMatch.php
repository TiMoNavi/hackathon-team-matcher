<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain;
use humhub\modules\matcherRecommendation\contracts\CandidateProjection;

/** Internal result; HTTP presenters decide the public representation in R4. */
final class DiscoveryMatch
{
    /** @param array{blocked:bool,friend:bool,pending_in:bool,pending_out:bool,version:string} $relationship */
    public function __construct(
        public readonly CandidateProjection $candidate,
        public readonly RuleAssessment $assessment,
        public readonly array $relationship,
    ) {}
}
