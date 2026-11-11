<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts;

/** Bounded explicit IDs. Empty is empty, never an instruction to return every user. */
final class CandidateRequest
{
    public const MAX_CANDIDATES = 200;

    /** @param list<string> $targetIds */
    public function __construct(
        public readonly CurrentEventContext $context,
        public readonly string $targetType,
        public readonly array $targetIds,
    ) {
        ContractShape::target($targetType);
        ContractShape::identifiers($targetIds, self::MAX_CANDIDATES);
    }
}
