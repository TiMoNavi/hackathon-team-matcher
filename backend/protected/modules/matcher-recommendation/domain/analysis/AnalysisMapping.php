<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\analysis;

/**
 * Reviewed logical feature meanings for the internal explanation kernel. This is not a
 * P1 field map, visibility grant, runtime default, public DTO, or a scoring policy.
 * An adapter must independently verify the meaning and allowed purpose of every feature.
 * topics means explicitly declared project directions; hobbies are not automatically topics.
 * capability_skills means documented self-reported capability, never verified experience.
 * offered/needed slots mean current-event declarations, not inferred traits or old roles.
 * All code values use exact reviewed vocabularies: this kernel does not expand synonyms,
 * infer hybrid/online compatibility, or turn free prose into a skill or a role.
 */
final class AnalysisMapping
{
    public const SEMANTICS = [
        'topics', 'capability_skills', 'offered_skills', 'needed_skills',
        'offered_roles', 'needed_roles', 'availability',
        'collaboration_modes', 'communication_preferences',
    ];
    private const EVENT_SEMANTICS = [
        'offered_skills', 'needed_skills', 'offered_roles', 'needed_roles',
        'availability', 'collaboration_modes',
    ];
    public readonly array $bindings;

    /** @param array<string,list<string>> $bindings Missing slots deliberately remain unknown. */
    public function __construct(public readonly string $version, public readonly int $schemaVersion, array $bindings)
    {
        self::identifier($version);
        if ($schemaVersion < 1 || array_diff(array_keys($bindings), self::SEMANTICS) !== []) {
            throw new \InvalidArgumentException('Use reviewed analysis semantics and a positive schema version.');
        }
        $seen = [];
        foreach ($bindings as $semantic => &$features) {
            if (!is_array($features) || !array_is_list($features) || $features === [] || count($features) > 8) {
                throw new \InvalidArgumentException('A mapped semantic needs one to eight logical features.');
            }
            foreach ($features as $feature) {
                if (!is_string($feature)) { throw new \InvalidArgumentException('Logical feature identifiers must be strings.'); }
                self::identifier($feature);
                if (isset($seen[$feature])) { throw new \InvalidArgumentException('A logical feature cannot acquire multiple meanings.'); }
                $seen[$feature] = true;
            }
            sort($features, SORT_STRING);
        }
        unset($features);
        if (count($seen) > 32) { throw new \InvalidArgumentException('The analysis mapping exceeds its bounded feature count.'); }
        ksort($bindings, SORT_STRING); $this->bindings = $bindings;
    }

    public function features(string $semantic): array { return $this->bindings[$semantic] ?? []; }
    public function requiresEventEvidence(string $semantic): bool { return in_array($semantic, self::EVENT_SEMANTICS, true); }
    public function fingerprint(): string
    {
        return hash('sha256', json_encode([$this->version, $this->schemaVersion, $this->bindings], JSON_THROW_ON_ERROR));
    }
    private static function identifier(string $value): void
    {
        if (!preg_match('/^[a-zA-Z][a-zA-Z0-9_.:-]{0,95}$/D', $value)) {
            throw new \InvalidArgumentException('Use a bounded stable logical identifier.');
        }
    }
}
