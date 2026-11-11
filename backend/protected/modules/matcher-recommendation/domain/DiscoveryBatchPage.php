<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain;
use humhub\modules\matcherRecommendation\contracts\{CandidateRequest, ContractShape, CurrentEventContext};

/** Internal fixed-order page, not an HTTP profile card. Positions are zero-based offsets in the saved batch. */
final class DiscoveryBatchPage
{
    /** @param list<DiscoveryBatchItem> $items */
    public function __construct(
        public readonly string $batchId,
        public readonly CurrentEventContext $context,
        public readonly array $items,
        public readonly int $position,
        public readonly int $total,
        public readonly int $limit,
        public readonly ?string $nextCursor,
        public readonly \DateTimeImmutable $expiresAt,
    ) {
        ContractShape::token($batchId);
        if (!array_is_list($items) || $limit < 1 || $limit > 48 || $position < 0 || $total < 0 || $total > CandidateRequest::MAX_CANDIDATES
            || $position > $total || count($items) !== min($limit, $total - $position)
            || ($nextCursor === null) !== ($position + count($items) === $total)) { throw new \InvalidArgumentException('Invalid fixed discovery page.'); }
        if ($nextCursor !== null) { ContractShape::token($nextCursor); }
        foreach ($items as $index => $item) {
            if (!$item instanceof DiscoveryBatchItem || $item->position !== $position + $index || $item->candidate->spaceId !== $context->spaceId) { throw new \InvalidArgumentException('Invalid discovery page ordering.'); }
        }
    }
}
