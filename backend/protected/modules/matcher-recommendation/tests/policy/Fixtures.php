<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\tests\policy;
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\contracts\{CurrentEventContext, ProjectionVersions};

/** Synthetic test policy only; never a runtime default or real P1 field configuration. */
final class Fixtures
{
    public static function parameters(): array
    {
        $text = ['type' => 'string', 'minLength' => 1, 'maxLength' => 100];
        $list = ['type' => 'array', 'items' => $text, 'maxItems' => 30, 'uniqueItems' => true];
        $object = static fn(array $properties, array $required): array => ['type' => 'object', 'properties' => $properties, 'required' => $required, 'additionalProperties' => false];
        $binding = static fn(string $source, string $scope, string $cardinality, array $schema, string $transform, string $purpose, string $semantic): array => ['source_key' => $source, 'scope' => $scope, 'cardinality' => $cardinality, 'value_schema' => $schema, 'transform' => $transform, 'purpose' => $purpose, 'semantic' => $semantic];
        $rule = static fn(string $id, string $dimension, string $operator, string $query, array $features): array => ['id' => $id, 'dimension' => $dimension, 'operator' => $operator, 'query_feature' => $query, 'candidate_features' => $features, 'aliases' => []];
        return [
            'schema_version' => 1, 'catalog_version' => 2,
            'bindings' => [
                'topics' => $binding('synthetic_topics', 'global', 'many', $text, 'identity', 'topic', 'topic'),
                'skills' => $binding('synthetic_skills', 'global', 'many', $object(['code' => $text, 'label' => $text], ['code', 'label']), 'code', 'contribution', 'capability'),
                'offers' => $binding('synthetic_offers', 'event', 'one', $object(['codes' => $list], ['codes']), 'codes', 'contribution', 'declared_contribution'),
                'preferences' => $binding('synthetic_preferences', 'global', 'many', $text, 'identity', 'collaboration_style', 'collaboration_preference'),
                'self_type' => $binding('synthetic_type', 'global', 'one', ['type' => 'string', 'enum' => ['INTJ', 'ENFP']], 'identity', 'collaboration_style', 'self_reported_type'),
                'availability' => $binding('synthetic_availability', 'event', 'many', $object(['starts_at' => ['type' => 'string', 'format' => 'date-time'], 'ends_at' => ['type' => 'string', 'format' => 'date-time'], 'timezone' => ['type' => 'string', 'format' => 'timezone']], ['starts_at', 'ends_at', 'timezone']), 'interval', 'availability', 'availability'),
            ],
            'dimension_weights' => ['topic' => .35, 'contribution' => .35, 'availability' => .15, 'collaboration_style' => .15],
            'enabled_routes' => ['structured', 'fulltext'],
            'route_weights' => ['structured' => .4, 'fulltext' => .2, 'semantic' => .4],
            'minimum_match_score' => .35,
            'limits' => ['recall' => 200, 'model_candidates' => 24, 'final_results' => 5, 'candidate_bytes' => 768, 'request_bytes' => 24576],
            'rules' => [
                $rule('topic_similarity', 'topic', 'similarity', 'topics', ['topics']),
                $rule('skill_similarity', 'contribution', 'similarity', 'skills', ['skills']),
                $rule('contribution_supply', 'contribution', 'supply_demand', 'needs', ['offers']),
                $rule('contribution_coverage', 'contribution', 'coverage_gain', 'gaps', ['offers']),
                $rule('style_explicit', 'collaboration_style', 'explicit_preference', 'preferences', ['preferences']),
                $rule('type_explicit', 'collaboration_style', 'explicit_preference', 'self_type', ['self_type']),
                $rule('availability_overlap', 'availability', 'interval_overlap', 'availability', ['availability']),
            ],
            'selection' => ['near_tie_delta' => .05, 'exploration_slots' => 1, 'max_results' => 24],
        ];
    }
    public static function catalog(): array
    {
        $fields = [];
        foreach (self::parameters()['bindings'] as $binding) {
            $key = $binding['source_key'];
            $fields[$key] = ['key' => $key, 'label' => 'Synthetic fixture', 'scope' => $binding['scope'], 'cardinality' => $binding['cardinality'], 'value_schema' => $binding['value_schema']];
        }
        return ['schema_version' => 2, 'fields' => $fields];
    }
    public static function policy(string $version = 'synthetic-policy-1'): RulePolicy { return new RulePolicy($version, self::parameters()); }
    public static function context(): CurrentEventContext { return new CurrentEventContext(1, 7, 'synthetic-access-1', 'synthetic-activity-policy-1'); }
    public static function versions(): ProjectionVersions { return new ProjectionVersions(['global' => ['revision' => 4, 'permission_version' => 2], 'space:7' => ['revision' => 6, 'permission_version' => 3]], 2, 'synthetic-profile-policy-1'); }
    public static function attributes(): array
    {
        $attribute = static function (string $id, string $key, mixed $value, string $scope = 'global'): array {
            $version = self::versions()->scopes[$scope];
            return ['attribute_id' => $id, 'owner_id' => '22', 'key' => $key, 'scope' => $scope, 'status' => 'confirmed', 'visibility' => 'authenticated', 'discovery_allowed' => true, 'value' => $value, 'revision' => $version['revision'], 'permission_version' => $version['permission_version']];
        };
        return [
            $attribute('synthetic-topic-a', 'synthetic_topics', 'social'),
            $attribute('synthetic-topic-b', 'synthetic_topics', 'education'),
            $attribute('synthetic-skill', 'synthetic_skills', ['code' => 'python', 'label' => 'Python']),
            $attribute('synthetic-offer', 'synthetic_offers', ['codes' => ['leadership', 'backend']], 'space:7'),
            $attribute('synthetic-preference', 'synthetic_preferences', 'async'),
            $attribute('synthetic-type', 'synthetic_type', 'INTJ'),
            $attribute('synthetic-time', 'synthetic_availability', ['starts_at' => '2026-11-11T10:00:00+08:00', 'ends_at' => '2026-11-11T12:00:00+08:00', 'timezone' => 'Asia/Shanghai'], 'space:7'),
        ];
    }
}
