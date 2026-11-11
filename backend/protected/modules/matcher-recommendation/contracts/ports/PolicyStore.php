<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;
use humhub\modules\matcherRecommendation\domain\RulePolicy;

interface PolicyStore
{
    /** Missing/unavailable policy throws; never invent a default enabled production policy. */
    public function current(CurrentEventContext $context): RulePolicy;
}
