<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\analysis;

use humhub\modules\matcherRecommendation\contracts\{CurrentEventContext, ProjectionVersions};

/** Expected internal snapshots only; these values never authorize a read or expose an HTTP contract. */
final class CooperationAnalysisRequest
{
    public function __construct(
        public readonly CurrentEventContext $expectedContext,
        public readonly string $candidateId,
        public readonly ProjectionVersions $expectedCandidateVersions,
        public readonly SelectedSelfAttributes $selfSelection,
        public readonly string $expectedMappingFingerprint,
    ) {
        if (!preg_match('/^[1-9][0-9]{0,9}$/D', $candidateId) || (int)$candidateId > 2147483647
            || $candidateId === (string)$expectedContext->viewerId
            || $selfSelection->ownerId !== $expectedContext->viewerId || $selfSelection->spaceId !== $expectedContext->spaceId
            || !preg_match('/^[a-f0-9]{64}$/D', $expectedMappingFingerprint)) {
            throw new \InvalidArgumentException('Analysis requires one other candidate and the viewer current-activity selection.');
        }
        SelectedSelfAttributes::assertVersions($expectedCandidateVersions, $expectedContext->spaceId);
    }
}
