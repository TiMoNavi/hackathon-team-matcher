<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboardingAi\domain\ports;
use humhub\modules\matcherOnboardingAi\domain\GatewayConfig;
interface ModelTransport
{
    public function available(): bool;
    /** Exactly one bounded attempt. Return HTTP status and body; never log payloads or secrets. */
    public function request(GatewayConfig $config, array $payload): array;
}
