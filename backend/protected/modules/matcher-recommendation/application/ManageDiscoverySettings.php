<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\application;
use humhub\modules\matcherRecommendation\contracts\ports\{CurrentEventAccess, DiscoverySettingsStore};
use humhub\modules\matcherRecommendation\domain\browse\DiscoveryException;

final class ManageDiscoverySettings
{
    public function __construct(private readonly CurrentEventAccess $events, private readonly DiscoverySettingsStore $settings) {}
    public function read(int $actorId, int $spaceId): array
    {
        $context = $this->events->resolve($actorId, $spaceId);
        $result = $this->settings->read($context);
        $this->events->assertCurrent($context);
        return $result;
    }
    public function change(int $actorId, int $spaceId, int $expectedVersion, bool $discoverable): array
    {
        if ($expectedVersion < 0) { throw new DiscoveryException('INVALID_VERSION', 'Use a non-negative expected_version.'); }
        $context = $this->events->resolve($actorId, $spaceId);
        $result = $this->settings->change($context, $expectedVersion, $discoverable);
        $this->events->assertCurrent($context);
        return $result;
    }
}
