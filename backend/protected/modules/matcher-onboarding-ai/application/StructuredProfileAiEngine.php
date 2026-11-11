<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboardingAi\application;
use humhub\modules\matcherOnboardingAi\domain\GatewayConfig;
use humhub\modules\matcherOnboardingAi\domain\OutputValidator;
use humhub\modules\matcherOnboardingAi\domain\StrictJson;
use humhub\modules\matcherOnboardingAi\domain\TransportFailure;
use humhub\modules\matcherOnboardingAi\domain\ports\ModelTransport;
use humhub\modules\matcherProfile\domain\ProfileAiFailure;
use humhub\modules\matcherProfile\domain\ports\ProfileAiEngine;

final class StructuredProfileAiEngine implements ProfileAiEngine
{
    public const MAX_TOKENS = 8192;
    public function __construct(private readonly ?GatewayConfig $config, private readonly ModelTransport $transport, private readonly OutputValidator $validator = new OutputValidator(), private readonly PromptBuilder $prompts = new PromptBuilder()) {}
    public function status(): array
    { return ['available' => $this->config !== null && $this->transport->available(), 'configured' => $this->config !== null, 'generation_mode' => 'ai', 'model' => $this->config?->model(), 'operations' => ['extract','questions','compose'], 'max_calls_per_job' => 1, 'max_input_bytes' => OutputValidator::MAX_INPUT_BYTES, 'max_output_bytes' => OutputValidator::MAX_OUTPUT_BYTES]; }
    public function generate(string $operation, array $input): array
    {
        $start = hrtime(true);
        $metrics = ['model' => $this->config?->model(), 'llm_calls' => 0, 'duration_ms' => 0, 'usage' => self::unknownUsage()];
        try {
            if ($this->config === null) { throw new ProfileAiFailure('AI_NOT_CONFIGURED'); }
            if (!$this->transport->available()) { throw new ProfileAiFailure('AI_TRANSPORT_UNAVAILABLE'); }
            $prepared = $this->validator->prepare($operation, $input);
            $payload = ['model' => $this->config->model(), 'messages' => $this->prompts->messages($operation, $prepared), 'stream' => false, 'temperature' => 0, 'max_tokens' => self::MAX_TOKENS, 'response_format' => ['type' => 'json_object']];
            if (strlen(json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) > 196608) { throw new ProfileAiFailure('AI_INPUT_TOO_LARGE'); }
            $metrics['llm_calls'] = 1;
            $response = $this->transport->request($this->config, $payload);
            if (!is_int($response['status'] ?? null) || !is_string($response['body'] ?? null)) { throw new ProfileAiFailure('AI_PROVIDER_RESPONSE_INVALID'); }
            if (strlen($response['body']) > 524288) { throw new ProfileAiFailure('AI_RESPONSE_TOO_LARGE'); }
            $envelope = null;
            try { $envelope = StrictJson::object($response['body'], 524288); } catch (\Throwable) { /* HTTP error bodies are deliberately not exposed. */ }
            if (is_array($envelope)) { $metrics['usage'] = $this->usage($envelope['usage'] ?? null); }
            if ($response['status'] !== 200) { throw new ProfileAiFailure(match (true) { in_array($response['status'], [401,403], true) => 'AI_AUTHENTICATION_FAILED', $response['status'] === 429 => 'AI_RATE_LIMITED', $response['status'] >= 500 => 'AI_GATEWAY_UNAVAILABLE', $response['status'] >= 300 && $response['status'] < 400 => 'AI_REDIRECT_REJECTED', default => 'AI_HTTP_ERROR' }); }
            if ($envelope === null || !is_array($envelope['choices'] ?? null) || !array_is_list($envelope['choices']) || count($envelope['choices']) !== 1) { throw new ProfileAiFailure('AI_PROVIDER_RESPONSE_INVALID'); }
            if (isset($envelope['model']) && $envelope['model'] !== $this->config->model()) {
                if (is_string($envelope['model']) && preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:\/-]{0,119}$/D', $envelope['model'])) { $metrics['model'] = $envelope['model']; }
                throw new ProfileAiFailure('AI_MODEL_MISMATCH');
            }
            $choice = $envelope['choices'][0];
            if (($choice['finish_reason'] ?? null) !== 'stop') { throw new ProfileAiFailure(($choice['finish_reason'] ?? null) === 'length' ? 'AI_OUTPUT_TRUNCATED' : 'AI_PROVIDER_RESPONSE_INVALID'); }
            $message = $choice['message'] ?? null;
            if (!is_array($message) || ($message['role'] ?? null) !== 'assistant' || !empty($message['tool_calls']) || !empty($message['function_call'])) { throw new ProfileAiFailure('AI_PROVIDER_RESPONSE_INVALID'); }
            if (!empty($message['refusal'])) { throw new ProfileAiFailure('AI_REFUSED'); }
            if (!is_string($message['content'] ?? null)) { throw new ProfileAiFailure('AI_OUTPUT_INVALID'); }
            $data = $this->validator->decode($operation, $message['content']);
            $validated = $this->validator->validate($operation, $data, $prepared);
            $metrics['duration_ms'] = max(0, (int) round((hrtime(true) - $start) / 1000000));
            return ['data' => $validated, 'metrics' => $metrics];
        } catch (\Throwable $error) {
            $metrics['duration_ms'] = max(0, (int) round((hrtime(true) - $start) / 1000000));
            $code = $error instanceof ProfileAiFailure || $error instanceof TransportFailure ? $error->errorCode : 'AI_PROVIDER_ERROR';
            // No previous exception, gateway body, source text, prompt or credential is propagated.
            throw new ProfileAiFailure($code, $metrics);
        }
    }
    private static function unknownUsage(): array { return ['prompt_tokens' => null, 'completion_tokens' => null, 'total_tokens' => null, 'reported' => false]; }
    private function usage(mixed $usage): array
    {
        if (!is_array($usage)) { return self::unknownUsage(); }
        $out = self::unknownUsage();
        foreach (['prompt_tokens','completion_tokens','total_tokens'] as $key) { if (!is_int($usage[$key] ?? null) || $usage[$key] < 0 || $usage[$key] > 1000000000) { return self::unknownUsage(); } $out[$key] = $usage[$key]; }
        if ($out['prompt_tokens'] + $out['completion_tokens'] !== $out['total_tokens']) { return self::unknownUsage(); }
        $out['reported'] = true; return $out;
    }
}
