<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendationAi\adapters\gateway;
/** Exactly one bounded attempt; implementation must never retry or follow redirects. */
interface GatewayTransport
{
    public function post(#[\SensitiveParameter] GatewayConfig $config, #[\SensitiveParameter] string $json): GatewayResponse;
}
