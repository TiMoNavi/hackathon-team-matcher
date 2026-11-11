<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\config;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, ContractShape, CurrentEventContext, EvidenceRef, ProjectionVersions};
use humhub\modules\matcherRecommendation\domain\RulePolicy;

/**
 * Pure mapping of an ALREADY authorized minimal snapshot. This class is not an authorization adapter.
 * The caller must revalidate the viewer, target and current Space and obtain purpose-filtered attributes
 * from the authorized P1 boundary. Metadata flags below are defensive checks, never permission proofs.
 */
final class ProfileProjectionMapper
{
    /**
     * @param list<array{attribute_id:string,owner_id:string,key:string,scope:string,status:string,visibility:string,discovery_allowed:bool,value:mixed,revision:int,permission_version:int}> $attributes
     */
    public function project(CurrentEventContext $context, string $targetId, ProjectionVersions $versions, RulePolicy $policy, array $catalog, array $attributes): CandidateProjection
    {
        ContractShape::token($targetId);
        $issues = PolicyValidator::bindingIssues($policy->parameters, $catalog);
        if ($versions->schemaVersion !== $catalog['schema_version'] || $targetId === (string)$context->viewerId || !array_is_list($attributes) || count($attributes) > 6400) { throw new \InvalidArgumentException('Invalid authorized projection snapshot.'); }
        $bySource = []; $seen = [];
        foreach ($attributes as $attribute) {
            if (!is_array($attribute)) { throw new \InvalidArgumentException('Invalid minimal attribute.'); }
            $keys = array_keys($attribute); sort($keys);
            if ($keys !== ['attribute_id', 'discovery_allowed', 'key', 'owner_id', 'permission_version', 'revision', 'scope', 'status', 'value', 'visibility']) { throw new \InvalidArgumentException('Unexpected attribute envelope.'); }
            foreach (['attribute_id', 'owner_id', 'key', 'scope', 'status', 'visibility'] as $key) {
                if (!is_string($attribute[$key])) { throw new \InvalidArgumentException('Invalid attribute type.'); }
                ContractShape::token($attribute[$key]);
            }
            ContractShape::scope($attribute['scope']);
            if (!is_bool($attribute['discovery_allowed']) || !is_int($attribute['revision']) || !is_int($attribute['permission_version']) || $attribute['revision'] < 0 || $attribute['permission_version'] < 0) { throw new \InvalidArgumentException('Invalid attribute metadata.'); }
            $scopeVersion = $versions->scopes[$attribute['scope']] ?? null;
            if ($attribute['owner_id'] !== $targetId || !in_array($attribute['scope'], ['global', 'space:' . $context->spaceId], true) || $scopeVersion === null || $attribute['revision'] !== $scopeVersion['revision'] || $attribute['permission_version'] !== $scopeVersion['permission_version'] || isset($seen[$attribute['attribute_id']])) { throw new \InvalidArgumentException('Attribute ownership, scope, uniqueness or version mismatch.'); }
            $seen[$attribute['attribute_id']] = true;
            if ($attribute['status'] !== 'confirmed' || $attribute['visibility'] !== 'authenticated' || !$attribute['discovery_allowed'] || PolicyValidator::forbiddenSource($attribute['key'])) { continue; }
            $bySource[$attribute['key']][] = $attribute;
        }
        $features = []; $unknown = [];
        foreach ($policy->parameters['bindings'] as $feature => $binding) {
            if (isset($issues[$feature])) { $unknown[] = $feature; continue; }
            $items = $bySource[$binding['source_key']] ?? [];
            if (($binding['cardinality'] === 'one' && count($items) > 1) || count($items) > 100) { throw new \InvalidArgumentException('Attribute cardinality exceeded.'); }
            $values = []; $evidence = [];
            foreach ($items as $item) {
                $expectedScope = $binding['scope'] === 'global' ? 'global' : 'space:' . $context->spaceId;
                if ($item['scope'] !== $expectedScope) { throw new \InvalidArgumentException('Attribute does not match bound scope.'); }
                try { ValueSchema::assertValue($item['value'], $binding['value_schema']); $value = $this->transform($item['value'], $binding['transform']); }
                catch (\InvalidArgumentException) { continue; }
                if ($value === [] || $value === '') { continue; }
                $values[] = $value;
                $evidence[] = new EvidenceRef('person', $targetId, 'profile_attribute', $item['attribute_id'], $item['scope'], $item['revision'], $item['permission_version']);
            }
            if ($values === []) { $unknown[] = $feature; continue; }
            $singleString = $binding['cardinality'] === 'one' && in_array($binding['transform'], ['identity', 'mode'], true) && is_string($values[0]);
            $value = $singleString ? $values[0] : $this->aggregate($values);
            if ($value === []) { $unknown[] = $feature; continue; }
            $features[$feature] = ['value' => $value, 'evidence' => $evidence];
        }
        return new CandidateProjection('person', $targetId, $context->spaceId, $versions, $features, $unknown);
    }

    private function transform(mixed $value, string $transform): mixed
    {
        if ($transform === 'interval') {
            if (new \DateTimeImmutable($value['starts_at']) >= new \DateTimeImmutable($value['ends_at'])) { throw new \InvalidArgumentException('Reversed availability interval.'); }
            return [['starts_at' => $value['starts_at'], 'ends_at' => $value['ends_at']]];
        }
        if ($transform === 'identity') { $result = $value; }
        elseif ($transform === 'mode') { $result = $value['mode'] ?? ''; }
        elseif ($transform === 'code') { $result = isset($value['code']) ? [$value['code']] : []; }
        else { $result = $value[$transform] ?? []; }
        if (is_string($result)) { return trim($result); }
        return array_values(array_unique(array_filter(array_map('trim', $result), static fn(string $item): bool => $item !== '')));
    }
    private function aggregate(array $values): array
    {
        $result = []; $seen = [];
        foreach ($values as $value) {
            foreach (is_array($value) ? $value : [$value] as $item) {
                $fingerprint = Fingerprint::of($item);
                if (!isset($seen[$fingerprint])) { $result[] = $item; $seen[$fingerprint] = true; }
            }
        }
        return $result;
    }
}
