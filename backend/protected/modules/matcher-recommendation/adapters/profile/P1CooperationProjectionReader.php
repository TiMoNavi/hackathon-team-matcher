<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\profile;

use humhub\modules\matcherRecommendation\contracts\{CandidateRequest, ContractShape};
use humhub\modules\matcherRecommendation\contracts\ports\{CandidateProjectionReader, CurrentEventAccess, ProfileFieldCatalog};
use humhub\modules\matcherRecommendation\domain\analysis\AnalysisMapping;
use humhub\modules\matcherRecommendation\domain\config\{PolicyValidator};

/**
 * Unassembled analysis-only adapter over P8 DiscoveryBatchService::read. The trusted composition
 * root supplies that capability, not an ordinary detail reader or client-provided permission flags.
 * Values are purpose-reduced before leaving this adapter. No ranking defaults, model or API change.
 * Separate parsing preserves the established ranking bridge and its different feature meanings.
 */
final class P1CooperationProjectionReader implements CandidateProjectionReader
{
    private readonly \Closure $readBatch;
    private readonly P1CooperationPurposePolicy $purposes;

    /** @param array<string,string> $bindings logical feature -> reviewed cooperation use ID */
    public function __construct(
        private readonly CurrentEventAccess $events,
        private readonly ProfileFieldCatalog $catalog,
        private readonly AnalysisMapping $mapping,
        private readonly array $bindings,
        callable $readBatch,
    ) {
        $this->readBatch = \Closure::fromCallable($readBatch);
        $this->purposes = new P1CooperationPurposePolicy();
        $this->purposes->assertBindings($mapping, $bindings);
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
        $catalog = $this->catalog->read(); $fingerprint = PolicyValidator::catalogFingerprint($catalog);
        $grants = $this->purposes->sourceGrants($catalog); $sources = [];
        foreach ($this->bindings as $use) {
            if (isset($grants[$use])) { $sources[$grants[$use]['source_key']] = $grants[$use]; }
        }
        $batch = ($this->readBatch)($request->context->viewerId, $request->context->spaceId, $ids, array_keys($sources));
        $this->keys($batch, ['schema_version', 'policy_version', 'profiles']);
        if ($batch['schema_version'] !== $catalog['schema_version'] || !is_string($batch['policy_version'])
            || !is_array($batch['profiles']) || count($batch['profiles']) > count($ids)) { $this->invalid(); }
        ContractShape::token($batch['policy_version']);
        foreach ($batch['profiles'] as $id => $_) { if (!is_int($id) || !in_array($id, $ids, true)) { $this->invalid(); } }
        $policyVersion = $this->purposes->projectionPolicyVersion($batch['policy_version'], $this->mapping, $this->bindings);
        $results = [];
        foreach ($ids as $id) {
            if (!array_key_exists($id, $batch['profiles'])) { continue; }
            $results[] = (new P1CooperationProjectionMapper())->project($request->context, $id, $batch['profiles'][$id],
                $catalog, $grants, $this->bindings, $policyVersion);
        }
        if ($fingerprint !== PolicyValidator::catalogFingerprint($this->catalog->read())) {
            throw new \RuntimeException('The profile directory changed during the cooperation read.');
        }
        $this->events->assertCurrent($request->context);
        return $results;
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
