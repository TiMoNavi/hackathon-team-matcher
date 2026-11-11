<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboardingAi\adapters\network;
use humhub\modules\matcherOnboardingAi\domain\GatewayConfig;
use humhub\modules\matcherOnboardingAi\domain\TransportFailure;
use humhub\modules\matcherOnboardingAi\domain\ports\ModelTransport;

final class CurlChatTransport implements ModelTransport
{
    public const MAX_RESPONSE_BYTES = 524288;
    public const MAX_REQUEST_BYTES = 196608;
    public const TIMEOUT_MS = 90000;
    /** Executor is only an isolated test seam. It receives (fixed URL, curl options). */
    public function __construct(private readonly mixed $executor = null) {}
    public function available(): bool { return extension_loaded('curl'); }
    public function request(GatewayConfig $config, array $payload): array
    {
        if (!$this->available()) { throw new TransportFailure('AI_TRANSPORT_UNAVAILABLE'); }
        try { $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR); } catch (\Throwable) { throw new TransportFailure('AI_INPUT_INVALID'); }
        if (strlen($body) > self::MAX_REQUEST_BYTES) { throw new TransportFailure('AI_INPUT_TOO_LARGE'); }
        $received = ''; $oversized = false;
        $options = [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_HTTPHEADER => [$config->authorizationHeader(), 'Content-Type: application/json', 'Accept: application/json', 'Expect:'], CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1, CURLOPT_FOLLOWLOCATION => false, CURLOPT_MAXREDIRS => 0, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2, CURLOPT_CONNECTTIMEOUT_MS => 5000, CURLOPT_TIMEOUT_MS => self::TIMEOUT_MS, CURLOPT_NOSIGNAL => true, CURLOPT_PROXY => '', CURLOPT_NOPROXY => '*', CURLOPT_NETRC => CURL_NETRC_IGNORED, CURLOPT_HEADER => false, CURLOPT_RETURNTRANSFER => false, CURLOPT_USERAGENT => 'MatcherProfileAI/0.1', CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$received, &$oversized): int { if (strlen($received) + strlen($chunk) > self::MAX_RESPONSE_BYTES) { $oversized = true; return 0; } $received .= $chunk; return strlen($chunk); }];
        try {
            if ($this->executor !== null) { $result = ($this->executor)($config->endpoint(), $options); }
            else {
                $handle = curl_init($config->endpoint());
                if ($handle === false) { throw new TransportFailure('AI_TRANSPORT_UNAVAILABLE'); }
                try { if (!curl_setopt_array($handle, $options)) { throw new TransportFailure('AI_TRANSPORT_UNAVAILABLE'); } curl_exec($handle); $result = ['status' => (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE), 'body' => $received, 'errno' => curl_errno($handle)]; }
                finally { unset($handle); } // CurlHandle releases itself; curl_close() is deprecated in PHP 8.5.
            }
        } catch (TransportFailure $e) { throw $e; } catch (\Throwable) { throw new TransportFailure('AI_NETWORK_ERROR'); }
        if (!is_array($result)) { throw new TransportFailure('AI_NETWORK_ERROR'); }
        if ($oversized || (is_string($result['body'] ?? null) && strlen($result['body']) > self::MAX_RESPONSE_BYTES)) { throw new TransportFailure('AI_RESPONSE_TOO_LARGE'); }
        if (($result['errno'] ?? 0) !== 0) { throw new TransportFailure(($result['errno'] ?? 0) === CURLE_OPERATION_TIMEDOUT ? 'AI_TIMEOUT' : 'AI_NETWORK_ERROR'); }
        if (!is_int($result['status'] ?? null) || !is_string($result['body'] ?? null)) { throw new TransportFailure('AI_NETWORK_ERROR'); }
        return ['status' => $result['status'], 'body' => $result['body']];
    }
}
