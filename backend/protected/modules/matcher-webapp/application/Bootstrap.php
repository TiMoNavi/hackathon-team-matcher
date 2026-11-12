<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebapp\application;

/** This exact allowlist is the entire per-request client bootstrap. */
final class Bootstrap
{
    public static function data(string $csrfToken, string $nativeHomeUrl, string $nativeLoginUrl): array
    {
        foreach ([$nativeHomeUrl, $nativeLoginUrl] as $url) {
            if (!str_starts_with($url, '/') || str_starts_with($url, '//')
                || preg_match('~[\\\\\x00-\x20\x7f]~', $url) === 1) {
                throw new \InvalidArgumentException('Native fallback must be a same-site path.');
            }
        }
        return [
            'schema_version' => 1,
            'base_path' => '/matcher/app',
            'api_base' => '/api/v1',
            'native_home_url' => $nativeHomeUrl,
            'native_login_url' => $nativeLoginUrl,
            'csrf_header' => 'X-CSRF-Token',
            'csrf_token' => $csrfToken,
        ];
    }

    public static function json(array $data): string
    {
        if (array_keys($data) !== ['schema_version', 'base_path', 'api_base', 'native_home_url', 'native_login_url', 'csrf_header', 'csrf_token']) {
            throw new \InvalidArgumentException('Unexpected client bootstrap field.');
        }
        return json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR);
    }
}
