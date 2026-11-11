<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain;
use humhub\modules\matcherRecommendation\contracts\ContractShape;

/** Versioned internal rule diagnostics, never a personality rating or collaboration success probability. */
final class RuleDiagnostics
{
    /**
     * @param array<string,float> $dimensionScores
     * @param array<string,float> $normalizedWeights Query-derived, identical for every candidate in this query.
     * @param list<string> $unknowns
     * @param list<string> $hardConflicts
     * @param list<string> $diversityKeys Positive topic/contribution keys only, deduplicated.
     * @param array<string,array> $ruleOutcomes Deduplicated condition evaluations, not raw profile/source content.
     */
    public function __construct(
        public readonly string $evaluatorVersion,
        public readonly float $matchScore,
        public readonly float $rrfScore,
        public readonly float $evidenceCoverage,
        public readonly array $dimensionScores,
        public readonly array $normalizedWeights,
        public readonly array $unknowns,
        public readonly array $hardConflicts,
        public readonly ?string $insufficiency,
        public readonly array $diversityKeys,
        public readonly array $ruleOutcomes = [],
    ) {
        ContractShape::token($evaluatorVersion);
        foreach ([$matchScore, $rrfScore, $evidenceCoverage, ...array_values($dimensionScores), ...array_values($normalizedWeights)] as $number) {
            if (!is_numeric($number) || !is_finite((float)$number) || $number < 0 || $number > 1) {
                throw new \InvalidArgumentException('Rule diagnostics require finite bounded numbers.');
            }
        }
        foreach ([$unknowns, $hardConflicts, $diversityKeys] as $identifiers) { ContractShape::identifiers($identifiers, count($identifiers)); }
        if ($insufficiency !== null) { ContractShape::token($insufficiency); }
        ContractShape::jsonValue($ruleOutcomes);
    }
}
