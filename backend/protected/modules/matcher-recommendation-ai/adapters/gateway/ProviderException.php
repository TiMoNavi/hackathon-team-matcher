<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendationAi\adapters\gateway;
final class ProviderException extends \RuntimeException
{
    private const MESSAGES = [
        'invalid_configuration' => 'The trusted AI gateway configuration is invalid.',
        'invalid_input' => 'The AI request does not satisfy its minimal input contract.',
        'request_too_large' => 'The serialized AI request exceeds its byte budget.',
        'response_too_large' => 'The AI gateway response exceeds its byte budget.',
        'permit_reused' => 'This reserved model attempt has already been used.',
        'provider_unavailable' => 'The configured AI gateway is unavailable.',
        'authentication_failed' => 'The configured AI gateway rejected its credentials.',
        'rate_limited' => 'The configured AI gateway rejected the request due to its quota.',
        'invalid_response' => 'The AI gateway returned an invalid or incomplete structured response.',
        'serialization_forbidden' => 'AI credential-bearing objects cannot be serialized.',
    ];
    public function __construct(public readonly string $reason)
    {
        if (!isset(self::MESSAGES[$reason])) { throw new \InvalidArgumentException('Unknown AI provider error.'); }
        parent::__construct(self::MESSAGES[$reason]);
    }
}
