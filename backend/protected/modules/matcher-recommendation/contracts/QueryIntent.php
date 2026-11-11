<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts;

/** Internal DTO; public API parsing and rule/operator whitelists belong to later stages. */
final class QueryIntent
{
    /**
     * @param list<array{feature:string,operator:string,value:mixed,strength:string,origin:string}> $conditions
     * @param list<string> $selectedSelfAttributeIds Stable attribute IDs, never profile column names.
     * Unknown candidate values are represented in CandidateProjection, not invented query values.
     */
    public function __construct(
        public readonly string $targetType,
        public readonly array $conditions = [],
        public readonly array $selectedSelfAttributeIds = [],
        public readonly ?string $currentIdeaId = null,
    ) {
        ContractShape::target($targetType);
        // Candidate-count budgets must not silently become a profile-field selection limit.
        ContractShape::identifiers($selectedSelfAttributeIds, count($selectedSelfAttributeIds));
        if ($currentIdeaId !== null) { ContractShape::token($currentIdeaId); }
        if (!array_is_list($conditions)) { throw new \InvalidArgumentException('Conditions must be a list.'); }
        foreach ($conditions as $condition) {
            if (!is_array($condition)) { throw new \InvalidArgumentException('Invalid condition.'); }
            $keys = array_keys($condition); sort($keys);
            if ($keys !== ['feature', 'operator', 'origin', 'strength', 'value']) {
                throw new \InvalidArgumentException('Unexpected or missing condition keys.');
            }
            foreach (['feature', 'operator', 'origin', 'strength'] as $key) {
                if (!is_string($condition[$key])) { throw new \InvalidArgumentException('Invalid condition type.'); }
            }
            ContractShape::token($condition['feature']);
            ContractShape::token($condition['operator']);
            if (!in_array($condition['strength'], ['hard', 'soft'], true)
                || !in_array($condition['origin'], ['user_confirmed', 'interpreted_draft'], true)
                || ($condition['strength'] === 'hard' && $condition['origin'] !== 'user_confirmed')) {
                throw new \InvalidArgumentException('Hard query conditions require user confirmation.');
            }
            ContractShape::jsonValue($condition['value']);
        }
    }
}
