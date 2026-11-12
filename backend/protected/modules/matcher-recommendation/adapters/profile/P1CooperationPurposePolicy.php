<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\profile;

use humhub\modules\matcherRecommendation\domain\analysis\AnalysisMapping;
use humhub\modules\matcherRecommendation\domain\config\{Fingerprint, PolicyValidator};

/**
 * Reviewed purposes for the internal cooperation explanation, separate from ranking and AI.
 * Grants authorize source MEANING only; the P8 batch boundary still authorizes each value.
 * No grant makes a field mandatory or permits project prose, personality inference or model use.
 */
final class P1CooperationPurposePolicy
{
    public const VERSION = 'p1-cooperation-purpose-v1';
    private const USES = [
        'project_directions' => ['direction', 'code', 'topics'],
        'declared_skills' => ['skill', 'code', 'capability_skills'],
        'project_technologies' => ['project', 'tech_codes', 'capability_skills'],
        'event_offered_skills' => ['event_contribution', 'skill_codes', 'offered_skills'],
        'event_needed_skills' => ['event_seeking', 'skill_codes', 'needed_skills'],
        'event_offered_roles' => ['event_role', 'code', 'offered_roles'],
        'event_needed_roles' => ['event_seeking', 'role_codes', 'needed_roles'],
        'event_availability' => ['event_availability', 'interval', 'availability'],
        'event_collaboration_modes' => ['event_collaboration_mode', 'mode', 'collaboration_modes'],
        'communication_preferences' => ['communication_preference', 'codes', 'communication_preferences'],
    ];

    /** Explicit logical feature -> reviewed use ID configuration; no default activation. */
    public function assertBindings(AnalysisMapping $mapping, array $bindings): void
    {
        if ($mapping->schemaVersion !== P1SourcePurposePolicy::CATALOG_VERSION) {
            throw new \InvalidArgumentException('The cooperation mapping needs a reviewed P1 schema.');
        }
        $expected = []; $seen = [];
        foreach ($mapping->bindings as $semantic => $features) {
            foreach ($features as $feature) {
                $expected[$feature] = true; $use = $bindings[$feature] ?? null;
                if (!is_string($use) || !isset(self::USES[$use]) || self::USES[$use][2] !== $semantic || isset($seen[$use])) {
                    throw new \InvalidArgumentException('A cooperation feature needs one distinct reviewed source purpose.');
                }
                $seen[$use] = true;
            }
        }
        if (array_diff(array_keys($bindings), array_keys($expected)) !== []) {
            throw new \InvalidArgumentException('Unmapped cooperation bindings are not permitted.');
        }
    }

    /** Missing or changed source shapes receive no grant, even if the catalog version is unchanged. */
    public function sourceGrants(array $catalog): array
    {
        PolicyValidator::catalogFingerprint($catalog);
        if ($catalog['schema_version'] !== P1SourcePurposePolicy::CATALOG_VERSION) { return []; }
        // Reuse already-reviewed schemas; never derive a grant by trusting live source metadata.
        $common = (new P1SourcePurposePolicy())->sourceGrants($catalog);
        $seeking = $this->seekingSource();
        $actual = $catalog['fields']['event_seeking'] ?? null;
        if (is_array($actual) && ($actual['key'] ?? null) === 'event_seeking'
            && Fingerprint::of(array_intersect_key($actual, $seeking)) === Fingerprint::of($seeking)) {
            $common['event_seeking'] = $seeking;
        }
        $grants = [];
        foreach (self::USES as $id => [$source, $transform, $semantic]) {
            if (!isset($common[$source])) { continue; }
            $grants[$id] = ['source_key' => $source, 'transform' => $transform,
                'purpose' => 'cooperation_analysis', 'semantic' => $semantic]
                + array_intersect_key($common[$source], array_flip(['scope', 'cardinality', 'value_schema']));
        }
        return $grants;
    }

    /** Bound to both upstream visibility policy and exact reviewed analysis configuration. */
    public function projectionPolicyVersion(string $upstreamVersion, AnalysisMapping $mapping, array $bindings): string
    {
        $this->assertBindings($mapping, $bindings);
        return self::VERSION . ':' . Fingerprint::of([$upstreamVersion, $mapping->fingerprint(), $bindings]);
    }

    private function seekingSource(): array
    {
        $text = static fn(int $max): array => ['type' => 'string', 'minLength' => 1, 'maxLength' => $max];
        $codes = ['type' => 'array', 'items' => $text(64), 'maxItems' => 30, 'uniqueItems' => true];
        return ['scope' => 'event', 'cardinality' => 'one', 'value_schema' => ['type' => 'object',
            'properties' => ['role_codes' => $codes, 'skill_codes' => $codes, 'free_text' => $text(1000)],
            'required' => [], 'additionalProperties' => false]];
    }
}
