<?php
declare(strict_types=1);
namespace humhub\modules\matcherGithubImport\adapters\http;

use humhub\modules\matcherGithubImport\domain\ports\GithubApi;
use humhub\modules\matcherProfile\domain\ProfileException;

/** Public unauthenticated REST, fixed origin, no redirects or configurable URL. */
final class CurlGithubApi implements GithubApi
{
    public const API_VERSION = '2022-11-28';
    public const MAX_REQUESTS = 13;
    public const MAX_RESPONSE_BYTES = 262144;
    public const MAX_TOTAL_BYTES = 2097152;
    public const MAX_SECONDS = 35;
    private int $requests = 0;
    private int $bytes = 0;
    private float $started = 0.0;
    public function beginRead(): void { $this->requests = 0; $this->bytes = 0; $this->started = microtime(true); }
    public function get(string $path, array $query = [], bool $optional = false): ?array
    {
        self::assertRoute($path, $query);
        if (!function_exists('curl_init')) { throw new ProfileException('GITHUB_READER_UNAVAILABLE', 'The GitHub HTTP adapter is unavailable.', 503); }
        if ($this->started === 0.0) { $this->beginRead(); }
        $remaining = self::MAX_SECONDS - (microtime(true) - $this->started);
        if (++$this->requests > self::MAX_REQUESTS || $remaining <= 0 || $this->bytes >= self::MAX_TOTAL_BYTES) {
            throw new ProfileException('GITHUB_READ_BUDGET_EXCEEDED', 'The public GitHub reading limit was reached. You can continue with the available material.', 503);
        }
        $body = ''; $oversized = false;
        $url = 'https://api.github.com' . $path . ($query === [] ? '' : '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986));
        $handle = curl_init($url);
        curl_setopt_array($handle, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_MAXREDIRS => 0,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_CONNECTTIMEOUT_MS => 3000, CURLOPT_TIMEOUT_MS => max(1, min(7000, (int)($remaining * 1000))),
            CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2, CURLOPT_PROXY => '',
            CURLOPT_HTTPHEADER => ['Accept: application/vnd.github+json', 'X-GitHub-Api-Version: ' . self::API_VERSION, 'User-Agent: HackathonTeamMatcher-GithubImport/0.1'],
            CURLOPT_WRITEFUNCTION => function ($handle, string $chunk) use (&$body, &$oversized): int {
                $count = strlen($chunk); $this->bytes += $count;
                if (strlen($body) + $count > self::MAX_RESPONSE_BYTES || $this->bytes > self::MAX_TOTAL_BYTES) { $oversized = true; return 0; }
                $body .= $chunk; return $count;
            },
        ]);
        $ok = curl_exec($handle); $status = (int)curl_getinfo($handle, CURLINFO_RESPONSE_CODE); unset($handle);
        if ($oversized) { throw new ProfileException('GITHUB_RESPONSE_TOO_LARGE', 'A public GitHub response exceeded the reading size limit.', 422); }
        if ($ok === false) { throw new ProfileException('GITHUB_NETWORK_UNAVAILABLE', 'GitHub could not be reached. Try again later or continue with another source.', 503); }
        if ($optional && $status === 404) { return null; }
        if ($status === 403 || $status === 429) { throw new ProfileException('GITHUB_RATE_LIMITED', 'GitHub temporarily limited public requests. Retry later.', 503); }
        if ($status === 404) { throw new ProfileException('GITHUB_ACCOUNT_UNAVAILABLE', 'The linked public GitHub account is unavailable.', 422); }
        if ($status < 200 || $status >= 300) { throw new ProfileException('GITHUB_UPSTREAM_UNAVAILABLE', 'The public GitHub response could not be read.', 503); }
        try { $data = json_decode($body, true, 48, JSON_THROW_ON_ERROR); } catch (\JsonException $error) { throw new ProfileException('GITHUB_INVALID_RESPONSE', 'GitHub returned an unreadable response.', 503); }
        if (!is_array($data)) { throw new ProfileException('GITHUB_INVALID_RESPONSE', 'GitHub returned an unreadable response.', 503); }
        return $data;
    }
    public static function assertRoute(string $path, array $query): void
    {
        $name = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?';
        $valid = preg_match('~^/user/[1-9][0-9]{0,19}$~D', $path) && $query === [];
        $valid = $valid || (preg_match('~^/users/' . $name . '/repos$~D', $path) && $query === ['per_page' => 10, 'type' => 'owner', 'sort' => 'full_name', 'direction' => 'asc']);
        $valid = $valid || (preg_match('~^/repos/' . $name . '/[A-Za-z0-9_.-]{1,100}/readme$~D', $path) && $query === [] && !str_contains($path, '/../') && !str_contains($path, '/./'));
        if (!$valid) { throw new ProfileException('GITHUB_INVALID_ROUTE', 'Use the verified GitHub public-source reader.', 422); }
    }
}
