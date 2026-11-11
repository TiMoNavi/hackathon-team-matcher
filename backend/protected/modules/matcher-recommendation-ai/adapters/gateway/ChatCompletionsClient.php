<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendationAi\adapters\gateway;

/** One counted permit per attempt. JSON schema is requested and independently checked by each adapter. */
final class ChatCompletionsClient
{
    private array $usedPermits = [];
    private array $lastMetadata = [];
    public function __construct(private readonly GatewayConfig $config, private readonly GatewayTransport $transport) {}
    public function complete(#[\SensitiveParameter] array $messages, array $schema, string $schemaName, #[\SensitiveParameter] string $callPermit): array
    {
        try {
            if ($callPermit === '' || strlen($callPermit) > 256 || preg_match('/[\x00-\x20\x7f]/', $callPermit) || !preg_match('/^[a-z][a-z0-9_]{0,63}$/D', $schemaName)) { throw new ProviderException('invalid_input'); }
            $json = $this->request($messages, $schema, $schemaName);
            if (strlen($json) > CurlGatewayTransport::MAX_REQUEST_BYTES) { throw new ProviderException('request_too_large'); }
            $permitHash = hash('sha256', $callPermit);
            if (isset($this->usedPermits[$permitHash])) { throw new ProviderException('permit_reused'); }
            $this->usedPermits[$permitHash] = true;
            $this->lastMetadata = ['request_bytes' => strlen($json), 'usage' => []];
            $response = $this->transport->post($this->config, $json);
            if ($response->status !== 200) {
                throw new ProviderException(match ($response->status) { 401, 403 => 'authentication_failed', 429 => 'rate_limited', default => 'provider_unavailable' });
            }
            $body = $response->body();
            if (strlen($body) > CurlGatewayTransport::MAX_RESPONSE_BYTES) { throw new ProviderException('response_too_large'); }
            $outer = json_decode($body, true, 32, JSON_THROW_ON_ERROR);
            if (!is_array($outer) || isset($outer['error']) || !is_array($outer['choices'] ?? null) || !array_is_list($outer['choices']) || count($outer['choices']) !== 1) { throw new ProviderException('invalid_response'); }
            foreach (['prompt_tokens', 'completion_tokens', 'total_tokens'] as $key) {
                if (isset($outer['usage'][$key]) && is_int($outer['usage'][$key]) && $outer['usage'][$key] >= 0) { $this->lastMetadata['usage'][$key] = $outer['usage'][$key]; }
            }
            $choice = $outer['choices'][0]; $message = $choice['message'] ?? null;
            if (($choice['index'] ?? null) !== 0 || ($choice['finish_reason'] ?? null) !== 'stop' || !is_array($message) || ($message['role'] ?? null) !== 'assistant'
                || !is_string($message['content'] ?? null) || ($message['refusal'] ?? null) !== null || ($message['tool_calls'] ?? null) !== null || ($message['function_call'] ?? null) !== null) { throw new ProviderException('invalid_response'); }
            $data = json_decode($message['content'], true, 32, JSON_THROW_ON_ERROR);
            if (!is_array($data) || array_is_list($data)) { throw new ProviderException('invalid_response'); }
            return $data;
        } catch (ProviderException $error) { throw new ProviderException($error->reason); }
        catch (\JsonException) { throw new ProviderException('invalid_response'); }
        catch (\Throwable) { throw new ProviderException('provider_unavailable'); }
    }
    public function requestBytes(#[\SensitiveParameter] array $messages, array $schema, string $schemaName): int { return strlen($this->request($messages, $schema, $schemaName)); }
    public function lastRequestMetadata(): array { return $this->lastMetadata; }
    private function request(#[\SensitiveParameter] array $messages, array $schema, string $schemaName): string
    {
        try {
            if (!array_is_list($messages) || count($messages) !== 2 || ($messages[0]['role'] ?? null) !== 'system' || ($messages[1]['role'] ?? null) !== 'user'
                || !preg_match('/^[a-z][a-z0-9_]{0,63}$/D', $schemaName)) { throw new ProviderException('invalid_input'); }
            foreach ($messages as $message) {
                if (array_keys($message) !== ['role', 'content'] || !is_string($message['content']) || $message['content'] === '') { throw new ProviderException('invalid_input'); }
            }
            // Some compatible gateways accept response_format without enforcing it upstream.
            // Include the identical schema in the system instruction; local validation remains mandatory.
            $messages[0]['content'] .= "\nRequired JSON output schema (return only this object, no Markdown): "
                . json_encode($schema, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            return json_encode(['model' => $this->config->model(), 'max_tokens' => $this->config->maxTokens(), 'messages' => $messages,
                'response_format' => ['type' => 'json_schema', 'json_schema' => ['name' => $schemaName, 'strict' => true, 'schema' => $schema]]],
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
        } catch (\Throwable) { throw new ProviderException('invalid_input'); }
    }
    public function __debugInfo(): array { return ['configured' => true, 'used_permits' => count($this->usedPermits)]; }
    public function __serialize(): array { throw new ProviderException('serialization_forbidden'); }
    public function __unserialize(#[\SensitiveParameter] array $data): void { throw new ProviderException('serialization_forbidden'); }
}
