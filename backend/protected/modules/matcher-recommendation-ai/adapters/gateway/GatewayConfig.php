<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendationAi\adapters\gateway;

/** Trusted constructor only: baseUrl includes the explicit API prefix, such as /v1. No environment reads. */
final class GatewayConfig
{
    private readonly string $endpoint;
    private readonly string $origin;
    private readonly string $model;
    private readonly \SensitiveParameterValue $secret;
    public function __construct(#[\SensitiveParameter] string $baseUrl, string $model, #[\SensitiveParameter] string $apiKey, private readonly int $maxTokens = 1024)
    {
        $parts = parse_url($baseUrl);
        if (!is_array($parts) || ($parts['scheme'] ?? null) !== 'https' || !isset($parts['host'])
            || array_diff(array_keys($parts), ['scheme', 'host', 'port', 'path']) !== []
            || !preg_match('/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/D', $parts['host'])
            || !preg_match('~^(/[A-Za-z0-9_-]+)*/?$~D', $parts['path'] ?? '')
            || strlen($baseUrl) > 2048 || isset($parts['port']) && ($parts['port'] < 1 || $parts['port'] > 65535)
            || $model === '' || strlen($model) > 128 || trim($model) !== $model || preg_match('/[\x00-\x1f\x7f]/', $model)
            || $apiKey === '' || strlen($apiKey) > 8192 || preg_match('/[\x00-\x20\x7f]/', $apiKey) || $maxTokens < 1 || $maxTokens > 8192) { throw new ProviderException('invalid_configuration'); }
        $host = strtolower($parts['host']);
        $this->origin = 'https://' . $host . (isset($parts['port']) && $parts['port'] !== 443 ? ':' . $parts['port'] : '');
        $this->endpoint = $this->origin . rtrim($parts['path'] ?? '', '/') . '/chat/completions';
        $this->model = $model; $this->secret = new \SensitiveParameterValue($apiKey);
    }
    public function endpoint(): string { return $this->endpoint; }
    public function origin(): string { return $this->origin; }
    public function model(): string { return $this->model; }
    public function maxTokens(): int { return $this->maxTokens; }
    /** Only the transport uses this value. It is never passed to prompts, persistence or logging. */
    public function authorizationHeader(): string { return 'Authorization: Bearer ' . $this->secret->getValue(); }
    public function __debugInfo(): array { return ['configured' => true, 'protocol' => 'chat_completions', 'credentials' => '[redacted]']; }
    public function __serialize(): array { throw new ProviderException('serialization_forbidden'); }
    public function __unserialize(#[\SensitiveParameter] array $data): void { throw new ProviderException('serialization_forbidden'); }
}
