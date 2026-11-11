<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts;

/** Signed continuation binding, never authorization by itself. Carries no query text or profile values. */
final class DiscoveryCursor
{
    public function __construct(
        public readonly string $batchId,
        public readonly int $viewerId,
        public readonly int $spaceId,
        public readonly string $contextFingerprint,
        public readonly string $queryHash,
        public readonly string $policyVersion,
        public readonly string $policyFingerprint,
        public readonly string $batchFingerprint,
        public readonly int $position,
        public readonly \DateTimeImmutable $createdAt,
        public readonly \DateTimeImmutable $expiresAt,
    ) {
        ContractShape::token($batchId); ContractShape::token($policyVersion);
        if (strlen($batchId) > 128 || strlen($policyVersion) > 128 || $viewerId < 1 || $spaceId < 1
            || $position < 1 || $position > CandidateRequest::MAX_CANDIDATES
            || $expiresAt <= $createdAt || $expiresAt > $createdAt->add(new \DateInterval('PT15M'))) {
            throw new \InvalidArgumentException('Invalid discovery continuation binding.');
        }
        foreach ([$contextFingerprint, $queryHash, $policyFingerprint, $batchFingerprint] as $fingerprint) {
            if (!preg_match('/^[a-f0-9]{64}$/D', $fingerprint)) { throw new \InvalidArgumentException('Invalid continuation fingerprint.'); }
        }
    }
}
