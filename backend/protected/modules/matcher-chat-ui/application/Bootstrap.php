<?php
declare(strict_types=1);
namespace humhub\modules\matcherChatUi\application;

final class Bootstrap
{
    private const KEYS = ['schema_version', 'integration_stage', 'base_path', 'api_base', 'native_home_url', 'native_login_url', 'csrf_header', 'csrf_token'];

    public static function data(string $csrfToken, string $nativeHomeUrl, string $nativeLoginUrl): array
    {
        self::validateUrl($nativeHomeUrl);
        self::validateUrl($nativeLoginUrl);
        return [
            'schema_version' => 1,
            'integration_stage' => 'shell',
            'base_path' => '/matcher/chat',
            'api_base' => '/api/v1',
            'native_home_url' => $nativeHomeUrl,
            'native_login_url' => $nativeLoginUrl,
            'csrf_header' => 'X-CSRF-Token',
            'csrf_token' => $csrfToken,
        ];
    }

    public static function json(array $data): string
    {
        if (array_keys($data) !== self::KEYS || $data['schema_version'] !== 1 || $data['integration_stage'] !== 'shell'
            || $data['base_path'] !== '/matcher/chat' || $data['api_base'] !== '/api/v1' || $data['csrf_header'] !== 'X-CSRF-Token'
            || !is_string($data['csrf_token']) || !is_string($data['native_home_url']) || !is_string($data['native_login_url'])) {
            throw new \InvalidArgumentException('Invalid chat shell bootstrap.');
        }
        self::validateUrl($data['native_home_url']);
        self::validateUrl($data['native_login_url']);
        return json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR);
    }

    private static function validateUrl(string $url): void
    {
        if (!str_starts_with($url, '/') || str_starts_with($url, '//') || preg_match('~[\\\\\x00-\x20\x7f]~', $url) === 1) {
            throw new \InvalidArgumentException('Native fallback must be a same-site path.');
        }
    }
}
