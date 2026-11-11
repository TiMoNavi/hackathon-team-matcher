<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\time;
use humhub\modules\matcherRecommendation\contracts\ports\Clock;

/** System time only; no runtime configuration, network or user input. */
final class SystemClock implements Clock
{
    public function now(): \DateTimeImmutable { return new \DateTimeImmutable('now', new \DateTimeZone('UTC')); }
}
