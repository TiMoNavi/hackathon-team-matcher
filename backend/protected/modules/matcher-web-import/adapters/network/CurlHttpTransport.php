<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebImport\adapters\network;

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherWebImport\domain\PublicAddressPolicy;
use humhub\modules\matcherWebImport\domain\WebUrl;
use humhub\modules\matcherWebImport\domain\ports\HttpTransport;

final class CurlHttpTransport implements HttpTransport
{
    public function get(string $url, string $ip, int $timeoutMs, int $maxBytes): array
    {
        if (!extension_loaded('curl')) { throw new ProfileException('WEB_RUNTIME_UNAVAILABLE', 'The website HTTP adapter is unavailable.', 503); }
        $url = WebUrl::normalize($url); PublicAddressPolicy::assertPublic($ip);
        if ($timeoutMs < 1) { throw new ProfileException('WEB_TIMEOUT', 'The website exceeded the reading time limit.', 504); }
        if ($maxBytes < 1) { throw new ProfileException('WEB_RESPONSE_TOO_LARGE', 'The website exceeds the supported download size.', 413); }
        $parts = parse_url($url); $port = $parts['scheme'] === 'https' ? 443 : 80;
        $curl = curl_init(); $body = ''; $headers = []; $headerBytes = 0; $failure = null;
        $pin = $parts['host'] . ':' . $port . ':' . (str_contains($ip, ':') ? '[' . $ip . ']' : $ip);
        try {
            curl_setopt_array($curl, [
                CURLOPT_URL => $url, CURLOPT_HTTPGET => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_MAXREDIRS => 0,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
                CURLOPT_PROXY => '', CURLOPT_NOPROXY => '*', CURLOPT_NETRC => CURL_NETRC_IGNORED,
                CURLOPT_RESOLVE => [$pin], CURLOPT_DNS_CACHE_TIMEOUT => 0, CURLOPT_FRESH_CONNECT => true, CURLOPT_FORBID_REUSE => true,
                CURLOPT_CONNECTTIMEOUT_MS => min(3000, $timeoutMs), CURLOPT_TIMEOUT_MS => $timeoutMs, CURLOPT_NOSIGNAL => true,
                CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_USERAGENT => 'MatcherProfileSource/0.1 (+explicit-owner-import)',
                CURLOPT_HTTPHEADER => ['Accept: text/html, text/plain, application/xhtml+xml', 'Accept-Encoding: identity', 'Connection: close'],
                CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$body, &$failure, $maxBytes): int {
                    if (strlen($body) + strlen($chunk) > $maxBytes) { $failure = 'WEB_RESPONSE_TOO_LARGE'; return 0; }
                    $body .= $chunk; return strlen($chunk);
                },
                CURLOPT_HEADERFUNCTION => static function ($handle, string $line) use (&$headers, &$headerBytes, &$failure): int {
                    $headerBytes += strlen($line);
                    if ($headerBytes > 32768) { $failure = 'WEB_HEADER_LIMIT'; return 0; }
                    if (preg_match('/^HTTP\/\S+\s+\d{3}/i', $line)) { $headers = []; return strlen($line); }
                    $trimmed = rtrim($line, "\r\n");
                    if ($trimmed === '') { return strlen($line); }
                    if (!preg_match('/^([!#$%&\x27*+.^_\x60|~0-9a-z-]+):[ \t]*(.*)$/iD', $trimmed, $match)) { $failure = 'WEB_INVALID_RESPONSE'; return 0; }
                    $key = strtolower($match[1]); $value = trim($match[2]);
                    if (preg_match('/[\x00-\x08\x0A-\x1F\x7F]/', $value)) { $failure = 'WEB_INVALID_RESPONSE'; return 0; }
                    if (in_array($key, ['location', 'content-type', 'content-encoding'], true)) {
                        if (isset($headers[$key])) { $failure = 'WEB_INVALID_RESPONSE'; return 0; }
                        $headers[$key] = $value;
                    }
                    return strlen($line);
                },
            ]);
            $ok = curl_exec($curl); $errno = curl_errno($curl); $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
            $connected = (string)curl_getinfo($curl, CURLINFO_PRIMARY_IP);
            if ($failure !== null) { throw new ProfileException($failure, 'The website response exceeds supported limits or is invalid.', $failure === 'WEB_RESPONSE_TOO_LARGE' ? 413 : 502); }
            if ($ok === false) { throw new ProfileException($errno === CURLE_OPERATION_TIMEDOUT ? 'WEB_TIMEOUT' : 'WEB_NETWORK_FAILED', 'The website could not be read within the supported connection policy.', $errno === CURLE_OPERATION_TIMEDOUT ? 504 : 502); }
            if (@inet_pton($connected) !== inet_pton($ip)) { throw new ProfileException('WEB_ADDRESS_MISMATCH', 'The website connection did not match the approved address.', 502); }
            return ['status' => $status, 'headers' => $headers, 'body' => $body];
        } finally { unset($curl); }
    }
}
