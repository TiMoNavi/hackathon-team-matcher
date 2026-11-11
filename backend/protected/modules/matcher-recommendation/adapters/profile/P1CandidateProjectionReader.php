<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\profile;

use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CandidateRequest, ContractShape, ProjectionVersions};
use humhub\modules\matcherRecommendation\contracts\ports\{CandidateProjectionReader, CurrentEventAccess, ProfileFieldCatalog};
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\domain\config\{Fingerprint, PolicyValidator, ProfileProjectionMapper};

/**
 * Explicit bridge to P8 DiscoveryBatchService::read. The trusted composition root supplies that
 * service callable; metadata flags or a DTO never replace its actual batch authorization.
 * No SQL, P1 table access, implicit module boot, cache, public route or test provider default.
 */
final class P1CandidateProjectionReader implements CandidateProjectionReader
{
    private readonly \Closure $readBatch;
    private readonly P1SourcePurposePolicy $purposes;
    private readonly ProfileProjectionMapper $mapper;

    public function __construct(
        private readonly CurrentEventAccess $events,
        private readonly ProfileFieldCatalog $catalog,
        private readonly RulePolicy $policy,
        callable $readBatch,
    ) {
        PolicyValidator::assertParameters($policy->parameters);
        $this->readBatch = \Closure::fromCallable($readBatch);
        $this->purposes = new P1SourcePurposePolicy();
        $this->mapper = new ProfileProjectionMapper();
        // Validate the published binding snapshot independently of the changing live directory.
        // This prevents semantic relabeling while allowing later field removal to become unknown.
        $fields = [];
        foreach ($policy->parameters['bindings'] as $binding) {
            $key = $binding['source_key'];
            $field = ['key' => $key] + array_intersect_key($binding, array_flip(['scope', 'cardinality', 'value_schema']));
            if (isset($fields[$key]) && Fingerprint::of($fields[$key]) !== Fingerprint::of($field)) {
                throw new \InvalidArgumentException('Conflicting source binding snapshots.');
            }
            $fields[$key] = $field;
        }
        $this->purposes->assertBindings($policy->parameters, ['schema_version' => $policy->parameters['catalog_version'], 'fields' => $fields]);
    }

    public function read(CandidateRequest $request): array
    {
        if ($request->targetType !== 'person') { throw new \InvalidArgumentException('Only person projections are supported.'); }
        $this->events->assertCurrent($request->context);
        $ids = [];
        foreach ($request->targetIds as $id) {
            $numeric = filter_var($id, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
            if ($numeric === false || (string)$numeric !== $id) { throw new \InvalidArgumentException('Person IDs must be canonical positive integers.'); }
            if ($numeric !== $request->context->viewerId) { $ids[] = $numeric; }
        }
        if ($ids === []) { $this->events->assertCurrent($request->context); return []; }

        $catalog = $this->catalog->read();
        $fingerprint = PolicyValidator::catalogFingerprint($catalog);
        $grants = $this->purposes->sourceGrants($catalog);
        $issues = PolicyValidator::bindingIssues($this->policy->parameters, $catalog);
        $effectiveCatalog = $catalog;
        $sources = [];
        foreach ($this->policy->parameters['bindings'] as $feature => $binding) {
            $key = $binding['source_key'];
            $grant = $grants[$key] ?? null;
            if (isset($issues[$feature]) || $grant === null || Fingerprint::of($grant) !== Fingerprint::of($binding)) {
                unset($effectiveCatalog['fields'][$key]);
                continue;
            }
            $sources[$key] = true;
        }
        $sourceKeys = array_keys($sources);
        $batch = ($this->readBatch)($request->context->viewerId, $request->context->spaceId, $ids, $sourceKeys);
        $this->validateBatch($batch, $catalog['schema_version'], $ids);
        $results = [];
        // Preserve request order. Omitted authorized subjects are not fabricated or backfilled.
        foreach ($ids as $id) {
            if (!array_key_exists($id, $batch['profiles'])) { continue; }
            $profile = $batch['profiles'][$id];
            $this->keys($profile, ['scopes', 'identity_version']);
            if (!is_array($profile['scopes'])) { $this->invalid(); }
            $expectedScopes = ['global', 'space:' . $request->context->spaceId];
            $this->keys($profile['scopes'], $expectedScopes);
            $versions = []; $attributes = []; $seen = [];
            foreach ($expectedScopes as $scope) {
                $snapshot = $profile['scopes'][$scope];
                $this->keys($snapshot, ['revision', 'permission_version', 'attributes']);
                foreach (['revision', 'permission_version'] as $key) {
                    if (!is_int($snapshot[$key]) || $snapshot[$key] < 0) { $this->invalid(); }
                }
                if (!is_array($snapshot['attributes']) || !array_is_list($snapshot['attributes']) || count($snapshot['attributes']) > 6400) { $this->invalid(); }
                $versions[$scope] = ['revision' => $snapshot['revision'], 'permission_version' => $snapshot['permission_version']];
                foreach ($snapshot['attributes'] as $attribute) {
                    if (!is_array($attribute) || !isset($attribute['attribute_id'], $attribute['key'])
                        || !is_string($attribute['attribute_id']) || !is_string($attribute['key'])
                        || !array_key_exists('value', $attribute) || ($attribute['confirmation'] ?? null) !== 'confirmed'
                        || ($attribute['visibility'] ?? null) !== 'authenticated' || !isset($sources[$attribute['key']])
                        || isset($seen[$attribute['attribute_id']])) { $this->invalid(); }
                    $grant = $grants[$attribute['key']];
                    $expectedScope = $grant['scope'] === 'global' ? 'global' : 'space:' . $request->context->spaceId;
                    if ($scope !== $expectedScope || ($attribute['schema_version'] ?? null) !== $catalog['schema_version']) { $this->invalid(); }
                    ContractShape::token($attribute['attribute_id']);
                    ContractShape::jsonValue($attribute['value']);
                    $seen[$attribute['attribute_id']] = true;
                    $attributes[] = [
                        'attribute_id' => $attribute['attribute_id'], 'owner_id' => (string)$id,
                        'key' => $attribute['key'], 'scope' => $scope, 'status' => 'confirmed',
                        'visibility' => 'authenticated', 'discovery_allowed' => true,
                        'value' => $attribute['value'], 'revision' => $snapshot['revision'],
                        'permission_version' => $snapshot['permission_version'],
                    ];
                }
            }
            $identity = $profile['identity_version'];
            if ($identity !== null && (!is_int($identity) || $identity < 0)) { $this->invalid(); }
            $projectionVersions = new ProjectionVersions($versions, $batch['schema_version'], $batch['policy_version'], $identity);
            $results[] = $this->mapper->project($request->context, (string)$id, $projectionVersions, $this->policy, $effectiveCatalog, $attributes);
        }
        // Recheck after dependency execution and mapping, before any authorized values leave the bridge.
        if ($fingerprint !== PolicyValidator::catalogFingerprint($this->catalog->read())) {
            throw new \RuntimeException('The profile directory changed during the batch read.');
        }
        $this->events->assertCurrent($request->context);
        return $results;
    }

    private function validateBatch(mixed $batch, int $schemaVersion, array $ids): void
    {
        $this->keys($batch, ['schema_version', 'policy_version', 'profiles']);
        if ($batch['schema_version'] !== $schemaVersion || !is_string($batch['policy_version'])
            || !is_array($batch['profiles']) || count($batch['profiles']) > count($ids)) { $this->invalid(); }
        ContractShape::token($batch['policy_version']);
        foreach ($batch['profiles'] as $id => $_) {
            if (!is_int($id) || !in_array($id, $ids, true)) { $this->invalid(); }
        }
    }

    private function keys(mixed $value, array $expected): void
    {
        if (!is_array($value)) { $this->invalid(); }
        $keys = array_keys($value); sort($keys); sort($expected);
        if ($keys !== $expected) { $this->invalid(); }
    }

    private function invalid(): never
    {
        throw new \UnexpectedValueException('The authorized profile batch is malformed or outside the requested scope.');
    }
}
