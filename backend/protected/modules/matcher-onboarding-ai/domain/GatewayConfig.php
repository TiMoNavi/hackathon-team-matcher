<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboardingAi\domain;
use humhub\modules\matcherProfile\domain\ProfileAiFailure;

/** Trusted server configuration. Never serializable into jobs, prompts or public status. */
final class GatewayConfig implements \JsonSerializable
{
    private readonly string $endpoint;
    public function __construct(string $baseUrl, private readonly string $model, private readonly string $apiKey)
    {
        $parts = parse_url($baseUrl);
        if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment']) || (isset($parts['port']) && $parts['port'] !== 443) || !preg_match('/^[A-Za-z0-9.-]+$/D', $parts['host']) || strlen($baseUrl) > 2048 || preg_match('/[\x00-\x20\x7f]/', $baseUrl)) { throw new ProfileAiFailure('AI_NOT_CONFIGURED'); }
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:\/-]{0,119}$/D', $model) || strlen($apiKey) < 8 || strlen($apiKey) > 4096 || preg_match('/[\x00-\x20\x7f]/', $apiKey)) { throw new ProfileAiFailure('AI_NOT_CONFIGURED'); }
        $path = rtrim($parts['path'] ?? '', '/');
        if (str_contains($path, '..') || str_contains($path, '%') || ($path !== '' && !preg_match('~^/[A-Za-z0-9_/-]*$~D', $path))) { throw new ProfileAiFailure('AI_NOT_CONFIGURED'); }
        $this->endpoint = rtrim($baseUrl, '/') . (str_ends_with($path, '/chat/completions') ? '' : '/chat/completions');
    }
    public function endpoint(): string { return $this->endpoint; }
    public function model(): string { return $this->model; }
    public function authorizationHeader(): string { return 'Authorization: Bearer ' . $this->apiKey; }
    public function __debugInfo(): array { return ['model' => $this->model, 'configured' => true]; }
    public function jsonSerialize(): array { return $this->__debugInfo(); }
    public function __serialize(): array { throw new \LogicException('Gateway configuration cannot be serialized.'); }
}
