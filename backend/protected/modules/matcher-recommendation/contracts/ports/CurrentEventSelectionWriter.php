<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;

/** Explicit user action only. Actor/session come from the authenticated server, never request parameters. */
interface CurrentEventSelectionWriter
{
    /** null only creates the initial selection; replacement must compare the last observed revision. */
    public function select(int $spaceId, ?string $expectedRevision): CurrentEventContext;
}
