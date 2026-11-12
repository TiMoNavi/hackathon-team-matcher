<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\memory;

use humhub\modules\matcherChat\domain\ports\Clock;

final class FrozenClock implements Clock
{
    public function __construct(public int $timestamp) {}
    public function now(): int { return $this->timestamp; }
}
