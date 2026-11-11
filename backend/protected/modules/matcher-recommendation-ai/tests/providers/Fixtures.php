<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendationAi\tests\providers;
use humhub\modules\matcherRecommendationAi\adapters\gateway\{GatewayConfig, GatewayResponse, GatewayTransport};

/** Pure memory transport. Never registered by the runtime plugin or its config. */
final class FakeTransport implements GatewayTransport
{
    public int $calls = 0;
    public array $requests = [];
    public ?\Closure $handler = null;
    public function post(GatewayConfig $config, string $json): GatewayResponse
    {
        $this->calls++; $request = json_decode($json, true, 32, JSON_THROW_ON_ERROR); $this->requests[] = $request;
        if ($this->handler !== null) { return ($this->handler)($request, $config); }
        return self::answer(['status' => 'ready', 'conditions' => [['feature' => 'topics', 'operator' => 'similarity', 'value' => ['robotics'], 'strength' => 'soft', 'origin' => 'interpreted_draft']], 'question' => null]);
    }
    public static function answer(array $value): GatewayResponse
    {
        return new GatewayResponse(200, json_encode(['choices' => [['index' => 0, 'finish_reason' => 'stop', 'message' => ['role' => 'assistant', 'content' => json_encode($value, JSON_THROW_ON_ERROR)]]], 'usage' => ['prompt_tokens' => 100, 'completion_tokens' => 40, 'total_tokens' => 140]], JSON_THROW_ON_ERROR));
    }
}
