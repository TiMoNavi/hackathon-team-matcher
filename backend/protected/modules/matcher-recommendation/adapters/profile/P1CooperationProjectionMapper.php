<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\profile;

use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, ContractShape, CurrentEventContext, EvidenceRef, ProjectionVersions};
use humhub\modules\matcherRecommendation\domain\config\{Fingerprint, ValueSchema};

/** Pure reduction of a previously authorized profile; this mapper grants no read permission. */
final class P1CooperationProjectionMapper
{
    public function project(CurrentEventContext $context, int $id, array $profile, array $catalog, array $grants, array $bindings, string $policyVersion): CandidateProjection
    {
        if ($id < 1) { throw new \InvalidArgumentException('A positive profile owner is required.'); }
        $sources = [];
        foreach ($bindings as $use) { if (isset($grants[$use])) { $sources[$grants[$use]['source_key']] = $grants[$use]; } }
        $this->keys($profile, ['scopes', 'identity_version']);
        $scopes = ['global', 'space:' . $context->spaceId]; $this->keys($profile['scopes'], $scopes);
        if (!is_int($profile['identity_version']) || $profile['identity_version'] < 0) { $this->invalid(); }
        $versions = []; $attributes = []; $seen = [];
        foreach ($scopes as $scope) {
            $snapshot = $profile['scopes'][$scope]; $this->keys($snapshot, ['revision', 'permission_version', 'attributes']);
            foreach (['revision', 'permission_version'] as $key) {
                if (!is_int($snapshot[$key]) || $snapshot[$key] < 0) { $this->invalid(); }
            }
            if (!is_array($snapshot['attributes']) || !array_is_list($snapshot['attributes']) || count($snapshot['attributes']) > 6400) { $this->invalid(); }
            $versions[$scope] = ['revision' => $snapshot['revision'], 'permission_version' => $snapshot['permission_version']];
            foreach ($snapshot['attributes'] as $attribute) {
                if (!is_array($attribute) || array_diff(array_keys($attribute), ['attribute_id', 'key', 'value', 'confirmation', 'visibility', 'schema_version', 'last_confirmed_at']) !== []
                    || !is_string($attribute['attribute_id'] ?? null) || !is_string($attribute['key'] ?? null)
                    || !array_key_exists('value', $attribute) || ($attribute['confirmation'] ?? null) !== 'confirmed'
                    || ($attribute['visibility'] ?? null) !== 'authenticated' || !isset($sources[$attribute['key']])
                    || ($attribute['schema_version'] ?? null) !== $catalog['schema_version'] || isset($seen[$attribute['attribute_id']])) { $this->invalid(); }
                $grant = $sources[$attribute['key']];
                if ($scope !== ($grant['scope'] === 'global' ? 'global' : 'space:' . $context->spaceId)) { $this->invalid(); }
                ContractShape::token($attribute['attribute_id']);
                try { ValueSchema::assertValue($attribute['value'], $grant['value_schema']); }
                catch (\InvalidArgumentException) { $this->invalid(); }
                $seen[$attribute['attribute_id']] = true;
                $attributes[$attribute['key']][] = ['value' => $attribute['value'], 'evidence' => new EvidenceRef(
                    'person', (string)$id, 'profile_attribute', $attribute['attribute_id'], $scope, $snapshot['revision'], $snapshot['permission_version'])];
                if (count($attributes[$attribute['key']]) > ($grant['cardinality'] === 'one' ? 1 : 100)) { $this->invalid(); }
            }
        }
        $features = []; $unknown = [];
        foreach ($bindings as $feature => $use) {
            $grant = $grants[$use] ?? null; $values = []; $evidence = [];
            foreach ($grant === null ? [] : ($attributes[$grant['source_key']] ?? []) as $attribute) {
                $parts = $this->extract($attribute['value'], $grant['transform']);
                if ($parts === []) { continue; }
                foreach ($parts as $part) { $values[Fingerprint::of($part)] = $part; }
                $evidence[] = $attribute['evidence'];
            }
            // Do not fabricate or silently truncate a supported subset of an over-budget fact.
            // These are the existing kernel bounds; the whole optional feature stays unknown.
            $limit = ($grant['transform'] ?? null) === 'interval' ? 32 : 64;
            if ($values === [] || count($values) > $limit) { $unknown[] = $feature; continue; }
            $features[$feature] = ['value' => array_values($values), 'evidence' => $evidence];
        }
        return new CandidateProjection('person', (string)$id, $context->spaceId,
            new ProjectionVersions($versions, $catalog['schema_version'], $policyVersion, $profile['identity_version']), $features, $unknown);
    }

    private function extract(array $value, string $transform): array
    {
        if ($transform === 'interval') {
            $start = new \DateTimeImmutable($value['starts_at']); $end = new \DateTimeImmutable($value['ends_at']);
            $zone = new \DateTimeZone($value['timezone']);
            if ($start >= $end || str_ends_with($value['starts_at'], '-00:00') || str_ends_with($value['ends_at'], '-00:00')
                || $zone->getOffset($start) !== $start->getOffset() || $zone->getOffset($end) !== $end->getOffset()) { $this->invalid(); }
            return [['starts_at' => $value['starts_at'], 'ends_at' => $value['ends_at'], 'timezone' => $value['timezone']]];
        }
        $parts = in_array($transform, ['code', 'mode'], true) ? [$value[$transform]] : ($value[$transform] ?? []);
        $result = [];
        foreach ($parts as $part) {
            if (preg_match('/[\x00-\x1F\x7F]/u', $part)) { $this->invalid(); }
            $part = mb_strtolower(trim($part), 'UTF-8');
            if ($part !== '') { $result[$part] = $part; }
        }
        return array_values($result);
    }

    private function keys(mixed $value, array $expected): void
    {
        if (!is_array($value)) { $this->invalid(); }
        $keys = array_keys($value); sort($keys); sort($expected); if ($keys !== $expected) { $this->invalid(); }
    }
    private function invalid(): never
    {
        throw new \UnexpectedValueException('The cooperation batch is malformed or outside the reviewed scope.');
    }
}
