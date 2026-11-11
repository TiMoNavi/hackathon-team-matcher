<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboardingAi\adapters\config;
use humhub\modules\matcherOnboardingAi\domain\GatewayConfig;

final class PrivateConfigLoader
{
    /** Path comes only from server composition, never request data. No path enters an exception. */
    public function load(string $path): ?GatewayConfig
    {
        if ($path === '' || $path[0] !== '/' || str_contains($path, "\0") || str_contains($path, '://') || !is_file($path)) { return null; }
        $size = @filesize($path); $mode = @fileperms($path);
        if ($size === false || $size > 16384 || $mode === false || ($mode & 0077) !== 0 || !is_readable($path)) { return null; }
        $raw = @file_get_contents($path, false, null, 0, 16385);
        if (!is_string($raw) || strlen($raw) > 16384) { return null; }
        try {
            $config = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
            if (!is_array($config) || array_diff(array_keys($config), ['base_url','model','api_key']) !== [] || !is_string($config['base_url'] ?? null) || !is_string($config['model'] ?? null) || !is_string($config['api_key'] ?? null)) { return null; }
            return new GatewayConfig($config['base_url'], $config['model'], $config['api_key']);
        } catch (\Throwable) { return null; }
    }
}
