<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\application\analysis;

use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CandidateRequest, CurrentEventContext, ProjectionVersions};
use humhub\modules\matcherRecommendation\contracts\analysis\{CooperationAnalysisException, CooperationAnalysisRequest, SelectedSelfAttributes};
use humhub\modules\matcherRecommendation\contracts\ports\{CandidateProjectionReader, CurrentEventAccess, ProfileFieldCatalog, SelectedSelfProjectionReader};
use humhub\modules\matcherRecommendation\domain\analysis\{AnalysisMapping, CooperationAnalyzer};
use humhub\modules\matcherRecommendation\domain\config\{Fingerprint, PolicyValidator};

/**
 * Unwired internal use case. Reuses the current-activity and authenticated candidate ports;
 * no new permission store, HTTP API, profile adapter or model is created here.
 * Reading twice detects observed concurrent changes, not a transaction across every domain.
 * The caller must never treat a returned analysis as an authorization/cache bearer token.
 */
final class AnalyzeCooperation
{
    public function __construct(
        private readonly CurrentEventAccess $events,
        private readonly CandidateProjectionReader $candidates,
        private readonly SelectedSelfProjectionReader $selfProfiles,
        private readonly ProfileFieldCatalog $catalog,
        private readonly AnalysisMapping $mapping,
        private readonly string $reviewedCatalogFingerprint,
    ) {
        if (!preg_match('/^[a-f0-9]{64}$/D', $reviewedCatalogFingerprint)) { throw new \InvalidArgumentException('A reviewed field-directory fingerprint is required.'); }
    }

    public function execute(int $viewerId, #[\SensitiveParameter] CooperationAnalysisRequest $request): array
    {
        try {
            if ($viewerId < 1 || $request->expectedContext->viewerId !== $viewerId) { throw new CooperationAnalysisException('invalid_request'); }
            $context = $this->events->resolve($viewerId, $request->expectedContext->spaceId);
            if (Fingerprint::of($context) !== Fingerprint::of($request->expectedContext)) { throw new CooperationAnalysisException('context_changed'); }
            $this->events->assertCurrent($context);
            if ($request->expectedMappingFingerprint !== $this->mapping->fingerprint()) { throw new CooperationAnalysisException('mapping_changed'); }
            $this->assertCatalog();
            $this->selfProfiles->assertCurrent($context, $request->selfSelection);
            $self = $this->readSelf($context, $request->selfSelection);
            $candidate = $this->readCandidate($context, $request);
            $this->events->assertCurrent($context);
            $result = (new CooperationAnalyzer())->analyze($context, $self, $candidate, $this->mapping);

            // Do not publish a result based only on references still existing: compare complete
            // minimal values and all versions after computation, then independently recheck consent.
            $freshCandidate = $this->readCandidate($context, $request);
            $freshSelf = $this->readSelf($context, $request->selfSelection);
            if (Fingerprint::of($candidate) !== Fingerprint::of($freshCandidate)
                || Fingerprint::of($self) !== Fingerprint::of($freshSelf)) { throw new CooperationAnalysisException('projection_changed'); }
            $this->assertCatalog();
            $this->selfProfiles->assertCurrent($context, $request->selfSelection);
            $this->events->assertCurrent($context);
            $result['basis_version']['catalog_fingerprint'] = $this->reviewedCatalogFingerprint;
            $result['basis_version']['self_selection'] = [
                'selection_id' => $request->selfSelection->selectionId,
                'version' => $request->selfSelection->selectionVersion,
                'references_fingerprint' => Fingerprint::of($request->selfSelection->references),
            ];
            $result['verification'] = 'internal_ports_rechecked';
            return $result;
        } catch (CooperationAnalysisException $error) {
            // The boundary retains only the bounded code, not adapter exception chains or values.
            throw new CooperationAnalysisException($error->reason);
        } catch (\Throwable) { throw new CooperationAnalysisException('dependency_unavailable'); }
    }

    private function assertCatalog(): void
    {
        $catalog = $this->catalog->read();
        if (($catalog['schema_version'] ?? null) !== $this->mapping->schemaVersion
            || PolicyValidator::catalogFingerprint($catalog) !== $this->reviewedCatalogFingerprint) {
            throw new CooperationAnalysisException('mapping_changed');
        }
    }

    private function readSelf(CurrentEventContext $context, #[\SensitiveParameter] SelectedSelfAttributes $selection): CandidateProjection
    {
        // Empty selection never calls a profile-value reader. assertCurrent verifies only metadata.
        $projection = $selection->references === []
            ? new CandidateProjection('person', (string)$context->viewerId, $context->spaceId, $selection->expectedVersions, [])
            : $this->selfProfiles->read($context, $selection);
        $this->assertProjection($projection, $context, (string)$context->viewerId, $selection->expectedVersions);
        $expected = [];
        foreach ($selection->references as $ref) { $expected[Fingerprint::of($ref)] = true; }
        $actual = [];
        foreach ($projection->features as $feature) {
            foreach ($feature['evidence'] as $ref) {
                $key = Fingerprint::of($ref);
                if (!isset($expected[$key])) { throw new CooperationAnalysisException('selection_unavailable'); }
                $actual[$key] = true;
            }
        }
        if (count($actual) !== count($expected)) { throw new CooperationAnalysisException('selection_unavailable'); }
        return $projection;
    }

    private function readCandidate(CurrentEventContext $context, #[\SensitiveParameter] CooperationAnalysisRequest $request): CandidateProjection
    {
        $rows = $this->candidates->read(new CandidateRequest($context, 'person', [$request->candidateId]));
        if ($rows === []) { throw new CooperationAnalysisException('candidate_unavailable'); }
        if (!array_is_list($rows) || count($rows) !== 1 || !$rows[0] instanceof CandidateProjection) { throw new CooperationAnalysisException('projection_changed'); }
        $projection = $rows[0];
        $this->assertProjection($projection, $context, $request->candidateId, $request->expectedCandidateVersions);
        return $projection;
    }

    private function assertProjection(#[\SensitiveParameter] CandidateProjection $projection, CurrentEventContext $context, string $ownerId, ProjectionVersions $expected): void
    {
        if ($projection->targetType !== 'person' || $projection->targetId !== $ownerId || $projection->spaceId !== $context->spaceId
            || $projection->versions->schemaVersion !== $this->mapping->schemaVersion
            || Fingerprint::of($projection->versions) !== Fingerprint::of($expected)) { throw new CooperationAnalysisException('projection_changed'); }
        SelectedSelfAttributes::assertVersions($projection->versions, $context->spaceId);
        $allowed = [];
        foreach ($this->mapping->bindings as $features) { foreach ($features as $feature) { $allowed[$feature] = true; } }
        if (array_diff(array_keys($projection->features), array_keys($allowed)) !== []
            || array_diff($projection->unknownFeatures, array_keys($allowed)) !== []
            || count($projection->features) > 32) { throw new CooperationAnalysisException('projection_changed'); }
    }
}
