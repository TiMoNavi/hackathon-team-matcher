<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;

/** Complete bounded eligible set, containing only currently authorized card fields. */
interface OrdinaryDiscoverySource
{
    /** @return array<int,array> Cards keyed by owner ID, ordered by numeric ID. */
    public function readCurrent(CurrentEventContext $context): array;
}
