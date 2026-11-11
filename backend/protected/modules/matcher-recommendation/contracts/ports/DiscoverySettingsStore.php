<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;

interface DiscoverySettingsStore
{
    public function read(CurrentEventContext $context): array;
    public function change(CurrentEventContext $context, int $expectedVersion, bool $discoverable): array;
}
