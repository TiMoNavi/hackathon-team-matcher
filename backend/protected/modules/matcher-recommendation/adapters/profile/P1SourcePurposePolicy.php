<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\profile;
use humhub\modules\matcherRecommendation\domain\config\{Fingerprint, PolicyValidator};

/**
 * Reviewed source meaning for P1 schema 2, independent of administrator-supplied binding semantics.
 * This allowlist grants a FIELD PURPOSE, never viewer/Space/subject visibility or discovery consent.
 * Only the authorized upstream batch boundary may supply candidate values. No database access here.
 */
final class P1SourcePurposePolicy
{
    public const VERSION = 'p1-discovery-purpose-v1';
    public const CATALOG_VERSION = 2;

    /**
     * Available approved bindings, not enabled runtime defaults. Missing/unreviewed/changed fields have
     * no grant. A new catalog version needs review even when a field happens to retain the same shape.
     * @return array<string,array{source_key:string,scope:string,cardinality:string,value_schema:array,transform:string,purpose:string,semantic:string}>
     */
    public function sourceGrants(array $catalog): array
    {
        if (!isset($catalog['schema_version'], $catalog['fields']) || !is_int($catalog['schema_version']) || !is_array($catalog['fields'])) { throw new \InvalidArgumentException('A valid P1 directory is required.'); }
        if ($catalog['schema_version'] !== self::CATALOG_VERSION) { return []; }
        $grants = [];
        foreach ($this->reviewedSources() as $key => $grant) {
            $source = $catalog['fields'][$key] ?? null;
            if (!is_array($source) || ($source['key'] ?? null) !== $key) { continue; }
            $expected = ['scope' => $grant['scope'], 'cardinality' => $grant['cardinality'], 'value_schema' => $grant['value_schema']];
            $actual = array_intersect_key($source, $expected);
            if (Fingerprint::of($actual) === Fingerprint::of($expected)) { $grants[$key] = $grant; }
        }
        return $grants;
    }

    public function assertBindings(array $parameters, array $catalog): void
    {
        PolicyValidator::validate($parameters, $catalog);
        $grants = $this->sourceGrants($catalog);
        foreach ($parameters['bindings'] as $feature => $binding) {
            $grant = $grants[$binding['source_key']] ?? null;
            if ($grant === null || Fingerprint::of($grant) !== Fingerprint::of($binding)) {
                throw new \InvalidArgumentException('P1 source purpose is not permitted for binding: ' . $feature);
            }
        }
    }

    /** Pinned reviewed schemas, not obtained from the live source and automatically trusted. */
    private function reviewedSources(): array
    {
        $text = static fn(int $max = 1000, int $min = 1): array => ['type' => 'string', 'minLength' => $min, 'maxLength' => $max];
        $list = static fn(array $items, int $max = 30): array => ['type' => 'array', 'items' => $items, 'maxItems' => $max, 'uniqueItems' => true];
        $object = static fn(array $properties, array $required = []): array => ['type' => 'object', 'properties' => $properties, 'required' => $required, 'additionalProperties' => false];
        $codes = $list($text(64));
        $labelled = $object(['code' => $text(64), 'label' => $text(120), 'note' => $text()], ['code', 'label']);
        $preferences = $object(['codes' => $codes, 'free_text' => $text()]);
        $skill = $labelled; $skill['properties']['self_level'] = ['type' => 'string', 'enum' => ['learning', 'working', 'proficient', 'expert']];
        $date = $object(['value' => ['type' => 'string', 'format' => 'partial-date'], 'precision' => ['type' => 'string', 'enum' => ['year', 'month', 'day']]], ['value', 'precision']);
        $url = ['type' => 'string', 'format' => 'http-url', 'maxLength' => 2048];
        $project = $object(['title' => $text(255), 'role' => $text(120), 'contribution' => $text(3000), 'tech_codes' => $codes, 'links' => $list($url, 10), 'outcome' => $text(3000), 'start' => $date, 'end' => $date], ['title']);
        $grants = [];
        $add = static function (string $key, array $schema, string $transform, string $purpose, string $semantic, string $scope = 'global', string $cardinality = 'one') use (&$grants): void {
            $grants[$key] = ['source_key' => $key, 'scope' => $scope, 'cardinality' => $cardinality, 'value_schema' => $schema, 'transform' => $transform, 'purpose' => $purpose, 'semantic' => $semantic];
        };
        $add('direction', $labelled, 'code', 'topic', 'topic', cardinality: 'many');
        $add('interest', $labelled, 'code', 'topic', 'topic', cardinality: 'many');
        $add('event_goal', $preferences, 'codes', 'topic', 'topic', 'event');
        foreach (['headline' => 160, 'bio' => 10000, 'seeking' => 1000] as $key => $length) { $add($key, $text($length), 'identity', 'topic', 'confirmed_text'); }
        // A global role/skill or past project's technology is capability, never current event willingness.
        $add('role', $labelled, 'code', 'contribution', 'capability', cardinality: 'many');
        $add('skill', $skill, 'code', 'contribution', 'capability', cardinality: 'many');
        $add('project', $project, 'tech_codes', 'contribution', 'capability', cardinality: 'many');
        $add('event_role', $labelled, 'code', 'contribution', 'declared_contribution', 'event', 'many');
        $add('event_contribution', $object(['skill_codes' => $codes, 'free_text' => $text()]), 'skill_codes', 'contribution', 'declared_contribution', 'event');
        // Self-described personality can only satisfy an explicit preference, never a compatibility matrix.
        $types = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'];
        $add('mbti', ['type' => 'string', 'enum' => $types], 'identity', 'collaboration_style', 'self_reported_type');
        $add('personality', $object(['traits' => $list($text(40), 10), 'self_description' => $text()]), 'traits', 'collaboration_style', 'self_reported_type');
        foreach (['collaboration_preference', 'communication_preference'] as $key) { $add($key, $preferences, 'codes', 'collaboration_style', 'collaboration_preference'); }
        $add('event_contact_preference', $preferences, 'codes', 'collaboration_style', 'collaboration_preference', 'event');
        $add('event_collaboration_mode', $object(['mode' => ['type' => 'string', 'enum' => ['onsite', 'online', 'hybrid']], 'note' => $text()], ['mode']), 'mode', 'collaboration_style', 'collaboration_preference', 'event');
        $add('event_availability', $object(['starts_at' => ['type' => 'string', 'format' => 'date-time'], 'ends_at' => ['type' => 'string', 'format' => 'date-time'], 'timezone' => ['type' => 'string', 'format' => 'timezone']], ['starts_at', 'ends_at', 'timezone']), 'interval', 'availability', 'availability', 'event', 'many');
        // event_seeking is a demand, not an offer; contact/identity/age/name/location/raw fields are absent.
        return $grants;
    }
}
