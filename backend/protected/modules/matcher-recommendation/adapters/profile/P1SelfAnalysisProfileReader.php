<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\profile;

use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, ContractShape, CurrentEventContext};
use humhub\modules\matcherRecommendation\contracts\analysis\CooperationAnalysisException;
use humhub\modules\matcherRecommendation\contracts\ports\{CurrentEventAccess, ProfileFieldCatalog, SelfAnalysisProfileReader};
use humhub\modules\matcherRecommendation\domain\analysis\AnalysisMapping;
use humhub\modules\matcherRecommendation\domain\config\{Fingerprint, PolicyValidator};

/** Real owner path to P1 SelectedSelfProfileReader. No P8-other-person or full editor profile read. */
final class P1SelfAnalysisProfileReader implements SelfAnalysisProfileReader
{
    private readonly \Closure $readSelected;
    private readonly \Closure $readOptions;
    private readonly P1CooperationPurposePolicy $purposes;
    public function __construct(
        private readonly CurrentEventAccess $events, private readonly ProfileFieldCatalog $catalog,
        private readonly AnalysisMapping $mapping, private readonly array $bindings,
        callable $readSelected, callable $readOptions,
    ) {
        $this->readSelected = \Closure::fromCallable($readSelected); $this->readOptions = \Closure::fromCallable($readOptions);
        $this->purposes = new P1CooperationPurposePolicy(); $this->purposes->assertBindings($mapping, $bindings);
    }
    public function read(CurrentEventContext $context, array $attributeIds): CandidateProjection
    {
        ContractShape::identifiers($attributeIds, 6400);
        foreach ($attributeIds as $id) { if (strlen($id) > 128) { throw new CooperationAnalysisException('invalid_request'); } }
        $result = $this->fetch($context, $attributeIds); $projection = $result['projection']; $seen = [];
        foreach ($projection->features as $feature) { foreach ($feature['evidence'] as $ref) { $seen[$ref->sourceId] = true; } }
        $actual = array_keys($seen); sort($actual, SORT_STRING); sort($attributeIds, SORT_STRING);
        if ($actual !== $attributeIds) { throw new CooperationAnalysisException('selection_unavailable'); }
        return $projection;
    }
    public function options(CurrentEventContext $context): array { return $this->fetch($context, null); }

    private function fetch(CurrentEventContext $context, ?array $attributeIds): array
    {
        try {
            $this->events->assertCurrent($context); $catalog = $this->catalog->read();
            if ($catalog['schema_version'] !== $this->mapping->schemaVersion) { throw new CooperationAnalysisException('mapping_changed'); }
            $fingerprint = PolicyValidator::catalogFingerprint($catalog); $grants = $this->purposes->sourceGrants($catalog);
            $keys = [];
            if ($attributeIds !== []) { foreach ($this->bindings as $use) { if (isset($grants[$use])) { $keys[$grants[$use]['source_key']] = true; } } }
            $batch = $attributeIds === null
                ? ($this->readOptions)($context->viewerId, $context->spaceId, array_keys($keys))
                : ($this->readSelected)($context->viewerId, $context->spaceId, array_keys($keys), $attributeIds);
            if (!is_array($batch)) { throw new CooperationAnalysisException('projection_changed'); }
            $expected = ['schema_version', 'policy_version', 'profiles']; $actual = array_keys($batch); sort($expected); sort($actual);
            if ($expected !== $actual || $batch['schema_version'] !== $catalog['schema_version'] || !is_string($batch['policy_version'])
                || !is_array($batch['profiles']) || array_keys($batch['profiles']) !== [$context->viewerId]) { throw new CooperationAnalysisException('projection_changed'); }
            ContractShape::token($batch['policy_version']);
            $profile = $batch['profiles'][$context->viewerId];
            $policyVersion = $this->purposes->projectionPolicyVersion($batch['policy_version'], $this->mapping, $this->bindings);
            $mapper = new P1CooperationProjectionMapper();
            $projection = $mapper->project($context, $context->viewerId, $profile, $catalog, $grants, $this->bindings, $policyVersion);
            $options = [];
            if ($attributeIds === null) {
                $meanings = []; foreach ($this->mapping->bindings as $semantic => $features) { foreach ($features as $feature) { $meanings[$feature] = $semantic; } }
                // Map each actual source item independently: aggregate feature evidence is not atom attribution.
                foreach ($profile['scopes'] as $scope => $state) {
                    foreach ($state['attributes'] as $attribute) {
                        $one = $profile; foreach ($one['scopes'] as &$part) { $part['attributes'] = []; } unset($part);
                        $one['scopes'][$scope]['attributes'] = [$attribute];
                        $item = $mapper->project($context, $context->viewerId, $one, $catalog, $grants, $this->bindings, $policyVersion);
                        $facts = []; foreach ($item->features as $feature => $fact) { $facts[] = ['semantic' => $meanings[$feature], 'values' => $fact['value']]; }
                        if ($facts !== []) { $options[] = ['attribute_id' => $attribute['attribute_id'], 'source_key' => $attribute['key'], 'scope' => $scope, 'facts' => $facts]; }
                    }
                }
            }
            if ($fingerprint !== PolicyValidator::catalogFingerprint($this->catalog->read())) { throw new CooperationAnalysisException('mapping_changed'); }
            $this->events->assertCurrent($context);
            return ['projection' => $projection, 'options' => $options];
        } catch (CooperationAnalysisException $error) { throw new CooperationAnalysisException($error->reason); }
        catch (\humhub\modules\matcherProfile\domain\ProfileException $error) {
            throw new CooperationAnalysisException(match ($error->errorCode) {
                'PROFILE_SELECTION_UNAVAILABLE' => 'selection_unavailable',
                'PROFILE_BATCH_CHANGED' => 'projection_changed',
                'PROFILE_ACCESS_DENIED', 'AUTHENTICATION_REQUIRED' => 'context_changed',
                'INVALID_PROFILE_BATCH' => 'invalid_request',
                default => 'dependency_unavailable',
            });
        }
        catch (\Throwable) { throw new CooperationAnalysisException('dependency_unavailable'); }
    }
}
