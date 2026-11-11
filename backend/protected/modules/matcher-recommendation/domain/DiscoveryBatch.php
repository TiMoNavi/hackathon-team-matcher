<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain;
use humhub\modules\matcherRecommendation\contracts\{ContractShape, CurrentEventContext, CandidateRequest};

/** IDs and version fingerprints only; no profile payload, query text or contact data is persisted here. */
final class DiscoveryBatch
{
    /** @param list<string> $targetIds @param array<string,string> $projectionFingerprints @param array<string,string> $relationshipVersions */
    public function __construct(
        public readonly CurrentEventContext $context,
        public readonly string $queryHash,
        public readonly string $policyVersion,
        public readonly array $targetIds,
        public readonly array $projectionFingerprints,
        public readonly array $relationshipVersions,
        public readonly \DateTimeImmutable $createdAt,
        public readonly \DateTimeImmutable $expiresAt,
        public readonly ?string $policyFingerprint = null,
    ) {
        ContractShape::token($policyVersion);
        if ($policyFingerprint !== null && !preg_match('/^[a-f0-9]{64}$/D', $policyFingerprint)) {
            throw new \InvalidArgumentException('Invalid batch policy fingerprint.');
        }
        if (!preg_match('/^[a-f0-9]{64}$/D', $queryHash) || $expiresAt <= $createdAt) {
            throw new \InvalidArgumentException('Invalid batch binding or expiry.');
        }
        ContractShape::identifiers($targetIds, CandidateRequest::MAX_CANDIDATES);
        foreach ([$projectionFingerprints, $relationshipVersions] as $versions) {
            if (count($versions) !== count($targetIds)) { throw new \InvalidArgumentException('Incomplete batch versions.'); }
            foreach ($targetIds as $id) {
                if (!isset($versions[$id]) || !is_string($versions[$id])) { throw new \InvalidArgumentException('Missing batch version.'); }
                ContractShape::token($versions[$id]);
            }
        }
    }
}
