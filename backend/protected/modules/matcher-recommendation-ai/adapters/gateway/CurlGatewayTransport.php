<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendationAi\adapters\gateway;

/** Real network adapter. No SDK retry, redirects, proxy inheritance, model-selected URL or credential logging. */
final class CurlGatewayTransport implements GatewayTransport
{
    public const MAX_REQUEST_BYTES = 24576;
    public const MAX_RESPONSE_BYTES = 65536;
    public function __construct(private readonly int $timeoutSeconds = 45, private readonly int $connectTimeoutSeconds = 10)
    {
        if ($timeoutSeconds < 1 || $timeoutSeconds > 60 || $connectTimeoutSeconds < 1 || $connectTimeoutSeconds > $timeoutSeconds) { throw new ProviderException('invalid_configuration'); }
    }
    public function post(#[\SensitiveParameter] GatewayConfig $config, #[\SensitiveParameter] string $json): GatewayResponse
    {
        if ($json === '' || strlen($json) > self::MAX_REQUEST_BYTES) { throw new ProviderException('request_too_large'); }
        if (!function_exists('curl_init') || !function_exists('curl_exec')) { throw new ProviderException('provider_unavailable'); }
        $handle = null;
        try {
            $handle = curl_init($config->endpoint());
            if ($handle === false) { throw new ProviderException('provider_unavailable'); }
            $body = ''; $tooLarge = false; $headersBytes = 0;
            $options = [
                CURLOPT_POST => true, CURLOPT_POSTFIELDS => $json,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', $config->authorizationHeader()],
                CURLOPT_FOLLOWLOCATION => false, CURLOPT_MAXREDIRS => 0,
                CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_CONNECTTIMEOUT => $this->connectTimeoutSeconds, CURLOPT_TIMEOUT => $this->timeoutSeconds,
                CURLOPT_PROXY => '', CURLOPT_RETURNTRANSFER => false, CURLOPT_HEADER => false, CURLOPT_VERBOSE => false,
                CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$body, &$tooLarge): int {
                    if (strlen($body) + strlen($chunk) > self::MAX_RESPONSE_BYTES) { $tooLarge = true; return 0; }
                    $body .= $chunk; return strlen($chunk);
                },
                CURLOPT_HEADERFUNCTION => static function ($handle, string $chunk) use (&$headersBytes, &$tooLarge): int {
                    $headersBytes += strlen($chunk);
                    if ($headersBytes > 16384) { $tooLarge = true; return 0; }
                    return strlen($chunk);
                },
            ];
            if (defined('CURLOPT_PROTOCOLS_STR')) { $options[CURLOPT_PROTOCOLS_STR] = 'https'; }
            else { $options[CURLOPT_PROTOCOLS] = CURLPROTO_HTTPS; }
            if (!curl_setopt_array($handle, $options)) { throw new ProviderException('provider_unavailable'); }
            $ok = curl_exec($handle);
            if ($tooLarge) { throw new ProviderException('response_too_large'); }
            if ($ok === false || curl_errno($handle) !== 0 || curl_getinfo($handle, CURLINFO_EFFECTIVE_URL) !== $config->endpoint()) { throw new ProviderException('provider_unavailable'); }
            $status = (int)curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
            $contentType = (string)curl_getinfo($handle, CURLINFO_CONTENT_TYPE);
            if ($status === 200 && !preg_match('~^application/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)~i', $contentType)) { throw new ProviderException('invalid_response'); }
            return new GatewayResponse($status, $body);
        } catch (ProviderException $error) { throw new ProviderException($error->reason); }
        catch (\Throwable) { throw new ProviderException('provider_unavailable'); }
        finally { $handle = null; } // Releasing CurlHandle is supported without PHP 8.5 curl_close deprecation.
    }
}
