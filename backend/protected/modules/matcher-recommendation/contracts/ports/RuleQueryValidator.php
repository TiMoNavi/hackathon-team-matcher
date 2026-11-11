<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\QueryIntent;
use humhub\modules\matcherRecommendation\domain\RulePolicy;

/** Optional capability used before recall, including queries whose eligible pool is empty. */
interface RuleQueryValidator
{
    /** Reject unknown feature/operator, malformed values or unsupported unparsed context; no I/O. */
    public function validateQuery(QueryIntent $intent, RulePolicy $policy): void;
}
