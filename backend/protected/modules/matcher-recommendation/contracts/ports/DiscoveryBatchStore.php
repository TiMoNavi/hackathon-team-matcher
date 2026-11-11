<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\domain\DiscoveryBatch;

interface DiscoveryBatchStore
{
    /** Persist IDs/version bindings atomically and return an opaque ID; errors throw. */
    public function put(DiscoveryBatch $batch): string;
    /** Internal storage read only. Caller must reauthorize viewer/Space/expiry and every candidate before display. */
    public function get(string $batchId): ?DiscoveryBatch;
}
