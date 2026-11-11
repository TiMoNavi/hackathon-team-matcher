<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;

interface Clock
{
    public function now(): \DateTimeImmutable;
}
