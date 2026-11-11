<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\config;
use humhub\modules\matcherRecommendation\contracts\ContractShape;

/**
 * A small fixed policy format, never an executable expression or SQL configuration.
 * Binding semantics are trusted management declarations, not proof of source eligibility. The R3 authorized
 * profile adapter must independently restrict source purpose and origin; key checks are only defensive.
 */
final class PolicyValidator
{
    public const DIMENSIONS = ['topic', 'contribution', 'availability', 'collaboration_style'];
    public const OPERATORS = ['similarity', 'supply_demand', 'coverage_gain', 'explicit_preference', 'interval_overlap'];
    public const TRANSFORMS = ['identity', 'code', 'codes', 'role_codes', 'skill_codes', 'tech_codes', 'traits', 'mode', 'interval'];
    public const SEMANTICS = ['topic', 'capability', 'declared_contribution', 'availability', 'collaboration_preference', 'self_reported_type', 'confirmed_text'];
    public const HARD_LIMITS = ['recall' => 200, 'model_candidates' => 24, 'final_results' => 5, 'candidate_bytes' => 768, 'request_bytes' => 24576];

    public static function assertParameters(array $p): void
    {
        ContractShape::jsonValue($p);
        self::keys($p, ['schema_version', 'catalog_version', 'bindings', 'dimension_weights', 'enabled_routes', 'route_weights', 'minimum_match_score', 'limits', 'rules', 'selection']);
        if ($p['schema_version'] !== 1 || !is_int($p['catalog_version']) || $p['catalog_version'] < 1) { self::fail('Unsupported policy or catalog version.'); }
        self::weights($p['dimension_weights'], self::DIMENSIONS);
        self::weights($p['route_weights'], ['structured', 'fulltext', 'semantic']);
        if (!is_array($p['enabled_routes'])) { self::fail('Invalid enabled routes.'); }
        ContractShape::identifiers($p['enabled_routes'], 3);
        if ($p['enabled_routes'] === [] || array_diff($p['enabled_routes'], ['structured', 'fulltext', 'semantic']) !== [] || array_sum(array_intersect_key($p['route_weights'], array_flip($p['enabled_routes']))) <= 0) { self::fail('At least one weighted route is required.'); }
        if (!self::number($p['minimum_match_score']) || $p['minimum_match_score'] < .35 || $p['minimum_match_score'] > 1) { self::fail('The evidence threshold cannot be weakened below .35.'); }
        if (!is_array($p['limits'])) { self::fail('Invalid limits.'); }
        self::keys($p['limits'], array_keys(self::HARD_LIMITS));
        foreach (self::HARD_LIMITS as $key => $maximum) { if (!is_int($p['limits'][$key]) || $p['limits'][$key] < 1 || $p['limits'][$key] > $maximum) { self::fail('Hard limit exceeded: ' . $key); } }
        if ($p['limits']['model_candidates'] > $p['limits']['recall'] || $p['limits']['final_results'] > $p['limits']['model_candidates']) { self::fail('Stage limits must not increase.'); }
        if (!is_array($p['selection'])) { self::fail('Invalid selection.'); }
        self::keys($p['selection'], ['near_tie_delta', 'exploration_slots', 'max_results']);
        if (!self::number($p['selection']['near_tie_delta']) || (float)$p['selection']['near_tie_delta'] !== .05 || !in_array($p['selection']['exploration_slots'], [0, 1], true) || !is_int($p['selection']['max_results']) || $p['selection']['max_results'] < 1 || $p['selection']['max_results'] > $p['limits']['recall']) { self::fail('Invalid bounded selection policy.'); }
        if (!is_array($p['bindings']) || $p['bindings'] === [] || count($p['bindings']) > 64) { self::fail('Explicit bindings are required.'); }
        foreach ($p['bindings'] as $feature => $b) {
            self::identifier($feature);
            if (!is_array($b)) { self::fail('Invalid binding.'); }
            self::keys($b, ['source_key', 'scope', 'cardinality', 'value_schema', 'transform', 'purpose', 'semantic']);
            self::identifier($b['source_key']);
            if (self::forbiddenSource($b['source_key']) || self::forbiddenSource($feature)) { self::fail('Source is not eligible for recommendation.'); }
            if (!in_array($b['scope'], ['global', 'event'], true) || !in_array($b['cardinality'], ['one', 'many'], true) || !in_array($b['transform'], self::TRANSFORMS, true) || !in_array($b['purpose'], self::DIMENSIONS, true) || !in_array($b['semantic'], self::SEMANTICS, true)) { self::fail('Invalid binding semantics.'); }
            $semanticDimension = match ($b['semantic']) {
                'topic', 'confirmed_text' => 'topic',
                'capability', 'declared_contribution' => 'contribution',
                'availability' => 'availability',
                'collaboration_preference', 'self_reported_type' => 'collaboration_style',
            };
            if ($b['purpose'] !== $semanticDimension) { self::fail('A field semantic cannot be relabeled as another scoring dimension.'); }
            if (!is_array($b['value_schema'])) { self::fail('A semantic schema snapshot is required.'); }
            ValueSchema::assertSchema($b['value_schema']);
            self::assertTransform($b);
            if ($b['semantic'] === 'declared_contribution' && $b['scope'] !== 'event') { self::fail('Contribution willingness must be explicit for this event.'); }
        }
        if (!is_array($p['rules']) || !array_is_list($p['rules']) || $p['rules'] === [] || count($p['rules']) > 64) { self::fail('A bounded rule list is required.'); }
        $ids = []; $pairs = [];
        foreach ($p['rules'] as $r) {
            if (!is_array($r)) { self::fail('Invalid rule.'); }
            self::keys($r, ['id', 'dimension', 'operator', 'query_feature', 'candidate_features', 'aliases']);
            self::identifier($r['id']); self::identifier($r['query_feature']);
            if (!in_array($r['dimension'], self::DIMENSIONS, true) || !in_array($r['operator'], self::OPERATORS, true)) { self::fail('Unsupported rule.'); }
            $pair = $r['query_feature'] . ':' . $r['operator'];
            if (isset($ids[$r['id']]) || isset($pairs[$pair]) || $p['dimension_weights'][$r['dimension']] <= 0) { self::fail('Duplicate rule or zero active dimension weight.'); }
            $ids[$r['id']] = true; $pairs[$pair] = true;
            if (!is_array($r['candidate_features'])) { self::fail('Invalid candidate features.'); }
            ContractShape::identifiers($r['candidate_features'], 8);
            if ($r['candidate_features'] === []) { self::fail('A rule requires an explicit feature.'); }
            foreach ($r['candidate_features'] as $feature) {
                $b = $p['bindings'][$feature] ?? null;
                if ($b === null || $b['purpose'] !== $r['dimension']) { self::fail('Rule references an unbound or incompatible feature.'); }
                if (in_array($r['operator'], ['supply_demand', 'coverage_gain'], true) && ($r['dimension'] !== 'contribution' || $b['semantic'] !== 'declared_contribution' || $b['scope'] !== 'event')) { self::fail('Capability is not event willingness.'); }
                if ($r['operator'] === 'similarity' && !in_array($b['semantic'], ['topic', 'capability', 'confirmed_text'], true)) { self::fail('Similarity cannot imply personality compatibility.'); }
                if ($r['operator'] === 'interval_overlap' && ($r['dimension'] !== 'availability' || $b['semantic'] !== 'availability' || $b['transform'] !== 'interval')) { self::fail('Interval rule needs explicit availability.'); }
                if ($r['operator'] === 'explicit_preference' && !in_array($b['semantic'], ['collaboration_preference', 'self_reported_type', 'availability'], true)) { self::fail('Explicit preference has incompatible semantics.'); }
            }
            if (!is_array($r['aliases']) || count($r['aliases']) > 100) { self::fail('Invalid aliases.'); }
            $normalizedAliases = [];
            foreach ($r['aliases'] as $alias => $canonical) {
                if (!is_string($alias) || !is_string($canonical) || trim($alias) !== $alias || trim($canonical) !== $canonical || $alias === '' || $canonical === '' || strlen($alias) > 128 || strlen($canonical) > 128 || preg_match('/[\x00-\x1f\x7f]/', $alias . $canonical)) { self::fail('Invalid alias token.'); }
                if (isset($r['aliases'][$canonical]) && $r['aliases'][$canonical] !== $canonical) { self::fail('Alias chains and cycles are not supported.'); }
                $normalizedAlias = strtolower(trim($alias)); $normalizedCanonical = strtolower(trim($canonical));
                if (isset($normalizedAliases[$normalizedAlias]) && $normalizedAliases[$normalizedAlias] !== $normalizedCanonical) { self::fail('Ambiguous alias normalization.'); }
                $normalizedAliases[$normalizedAlias] = $normalizedCanonical;
                foreach ($r['candidate_features'] as $feature) {
                    if (in_array($p['bindings'][$feature]['semantic'], ['collaboration_preference', 'self_reported_type'], true) && $normalizedAlias !== $normalizedCanonical) { self::fail('Aliases cannot invent personality or preference compatibility.'); }
                }
            }
            foreach ($normalizedAliases as $alias => $canonical) {
                if (isset($normalizedAliases[$canonical]) && $normalizedAliases[$canonical] !== $canonical) { self::fail('Normalized alias chains are not supported.'); }
            }
        }
    }

    public static function validate(array $parameters, array $catalog): array
    {
        self::assertParameters($parameters); self::catalog($catalog);
        if ($parameters['catalog_version'] !== $catalog['schema_version']) { self::fail('Catalog version changed.'); }
        $issues = self::bindingIssues($parameters, $catalog);
        if ($issues !== []) { self::fail('Incompatible bindings: ' . implode(', ', array_keys($issues))); }
        return $parameters;
    }

    /** A live schema change invalidates affected features; do not guess replacement fields. */
    public static function bindingIssues(array $parameters, array $catalog): array
    {
        self::assertParameters($parameters); self::catalog($catalog); $issues = [];
        foreach ($parameters['bindings'] as $feature => $b) {
            $field = $catalog['fields'][$b['source_key']] ?? null;
            if (!is_array($field) || ($field['key'] ?? null) !== $b['source_key']) { $issues[$feature] = 'missing_source'; continue; }
            foreach (['scope', 'cardinality', 'value_schema'] as $key) {
                if (!array_key_exists($key, $field) || Fingerprint::of($field[$key]) !== Fingerprint::of($b[$key])) { $issues[$feature] = 'schema_changed'; break; }
            }
        }
        return $issues;
    }

    public static function catalogFingerprint(array $catalog): string
    {
        self::catalog($catalog); $fields = [];
        foreach ($catalog['fields'] as $key => $field) {
            if (!is_array($field)) { self::fail('Invalid catalog field.'); }
            $fields[$key] = array_intersect_key($field, array_flip(['key', 'scope', 'cardinality', 'value_schema']));
        }
        return Fingerprint::of(['schema_version' => $catalog['schema_version'], 'fields' => $fields]);
    }

    public static function forbiddenSource(string $key): bool
    {
        if ($key === 'event_contact_preference') { return false; }
        return (bool)preg_match('/(^|_)(contact|contacts|raw|source|sources|private|password|credential|credentials|resume|email|phone|mobile|message|messages)(_|$)/i', $key) || in_array($key, ['real_name', 'firstname', 'lastname', 'age_range', 'birthday', 'gender', 'avatar_ref'], true);
    }
    private static function assertTransform(array $b): void
    {
        $s = $b['value_schema']; $t = $b['transform'];
        if ($t === 'mode' && $b['cardinality'] !== 'one') { self::fail('Mode is a single-value transform.'); }
        if ($t === 'identity') {
            if ($s['type'] !== 'string' && !($s['type'] === 'array' && ($s['items']['type'] ?? null) === 'string')) { self::fail('Identity only accepts bounded string values.'); }
        } elseif ($t === 'interval') {
            if ($s['type'] !== 'object' || ($s['properties']['starts_at']['format'] ?? null) !== 'date-time' || ($s['properties']['ends_at']['format'] ?? null) !== 'date-time' || array_diff(['starts_at', 'ends_at'], $s['required'] ?? []) !== []) { self::fail('Interval schema is incomplete.'); }
        } else {
            $field = $s['properties'][$t] ?? null;
            $type = in_array($t, ['code', 'mode'], true) ? 'string' : 'array';
            if ($s['type'] !== 'object' || !is_array($field) || ($field['type'] ?? null) !== $type || ($type === 'array' && ($field['items']['type'] ?? null) !== 'string')) { self::fail('Transform does not match source schema.'); }
        }
    }
    private static function catalog(array $catalog): void
    {
        if (!isset($catalog['schema_version'], $catalog['fields']) || !is_int($catalog['schema_version']) || $catalog['schema_version'] < 1 || !is_array($catalog['fields'])) { self::fail('Invalid catalog.'); }
    }
    private static function weights(mixed $weights, array $keys): void
    {
        if (!is_array($weights)) { self::fail('Invalid weights.'); }
        self::keys($weights, $keys);
        foreach ($weights as $weight) { if (!self::number($weight) || $weight < 0 || $weight > 1) { self::fail('Invalid weight.'); } }
        if (abs(array_sum($weights) - 1) > 1e-9) { self::fail('Weights must sum to one.'); }
    }
    private static function number(mixed $value): bool { return (is_int($value) || is_float($value)) && is_finite((float)$value); }
    private static function identifier(mixed $value): void { if (!is_string($value) || !preg_match('/^[a-z][a-z0-9_]{0,63}$/D', $value)) { self::fail('Invalid configuration key.'); } }
    private static function keys(array $a, array $expected): void { $keys = array_keys($a); sort($keys); sort($expected); if ($keys !== $expected) { self::fail('Unexpected or missing configuration key.'); } }
    private static function fail(string $message): never { throw new \InvalidArgumentException($message); }
}
