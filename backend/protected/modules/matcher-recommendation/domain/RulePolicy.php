<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain;
use humhub\modules\matcherRecommendation\contracts\ContractShape;

/** Versioned evaluator input. R1 does not supply a default production scoring policy. */
final class RulePolicy
{
    public function __construct(public readonly string $version, public readonly array $parameters = [])
    {
        ContractShape::token($version);
        ContractShape::jsonValue($parameters);
    }
}
