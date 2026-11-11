<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\tests\rules;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CurrentEventContext, EvidenceRef, ProjectionVersions, QueryIntent};
use humhub\modules\matcherRecommendation\domain\{RuleAssessment, RulePolicy};
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;
use humhub\modules\matcherRecommendation\tests\policy\Fixtures as PolicyFixtures;

/** Synthetic authorized projections and direct query fixtures only. No P1 or other real data source. */
final class Fixtures
{
    public static function parameters(): array { return PolicyFixtures::parameters(); }
    public static function condition(string $feature, string $operator, mixed $value, string $strength = 'soft'): array
    {
        return ['feature' => $feature, 'operator' => $operator, 'value' => $value, 'strength' => $strength, 'origin' => 'user_confirmed'];
    }
    public static function context(): CurrentEventContext { return new CurrentEventContext(1, 7, 'access-fixture-1', 'event-fixture-1'); }
    public static function interval(string $start = '2026-11-11T00:00:00Z', string $end = '2026-11-11T02:00:00Z'): array { return ['starts_at' => $start, 'ends_at' => $end]; }
    public static function candidate(array $values, ?array $parameters = null, array $scopeOverrides = [], string $id = '101'): CandidateProjection
    {
        $parameters ??= self::parameters();
        $scopes = ['global' => ['revision' => 3, 'permission_version' => 1], 'space:7' => ['revision' => 4, 'permission_version' => 2]];
        $features = [];
        foreach ($values as $key => $value) {
            $scope = $scopeOverrides[$key] ?? (($parameters['bindings'][$key]['scope'] ?? 'global') === 'event' ? 'space:7' : 'global');
            $ref = new EvidenceRef('person', $id, 'profile_attribute', 'attribute-fixture-' . $key, $scope, $scopes[$scope]['revision'], $scopes[$scope]['permission_version']);
            $features[$key] = ['value' => $value, 'evidence' => [$ref]];
        }
        return new CandidateProjection('person', $id, 7, new ProjectionVersions($scopes, 2, 'profile-fixture-1', 1), $features);
    }
    public static function evaluate(array $conditions, array $values, ?array $parameters = null, array $ranks = ['structured' => 1]): RuleAssessment
    {
        $parameters ??= self::parameters();
        return (new DeterministicRuleEvaluator())->evaluate(self::context(), new QueryIntent('person', $conditions), self::candidate($values, $parameters), new RulePolicy('synthetic-rules-v1', $parameters), $ranks);
    }
}
