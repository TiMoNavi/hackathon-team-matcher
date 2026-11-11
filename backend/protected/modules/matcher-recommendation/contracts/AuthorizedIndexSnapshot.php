<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts;

/** Version binding for an already authorized minimal index. Constructing this DTO is not authorization. */
final class AuthorizedIndexSnapshot
{
    public function __construct(
        public readonly string $generation,
        public readonly int $spaceId,
        public readonly string $contextFingerprint,
        public readonly string $policyFingerprint,
        public readonly string $sourcePurposeVersion,
        public readonly string $termEncoding = 'plain',
    ) {
        ContractShape::token($generation); ContractShape::token($sourcePurposeVersion);
        if ($spaceId < 1 || !preg_match('/^[a-f0-9]{64}$/D', $contextFingerprint) || !preg_match('/^[a-f0-9]{64}$/D', $policyFingerprint)
            || !in_array($termEncoding, ['plain', 'sha256'], true)) {
            throw new \InvalidArgumentException('Invalid authorized index version binding.');
        }
    }
}
