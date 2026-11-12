<?php
declare(strict_types=1);
/** Pure pre-bootstrap checks. No database or application config is read. */
function overnightValidateConfig(array $config, string $backend): void
{
    $expected = ['spec' => 'overnight-n01-v1', 'database' => 'humhub_overnight_n01_20261112',
        'username' => 'overnight_n01', 'host' => '127.0.0.1', 'port' => 8113,
        'socket' => $backend . '/.runtime/mysql.sock', 'runtime' => $backend . '/.runtime/overnight-integration'];
    foreach ($expected as $key => $value) {
        if (($config[$key] ?? null) !== $value) { throw new RuntimeException('Isolation target mismatch before bootstrap.'); }
    }
    foreach (['password', 'cookie_key', 'nonce'] as $key) {
        if (!is_string($config[$key] ?? null) || preg_match('/^[a-f0-9]{64}$/D', $config[$key]) !== 1) {
            throw new RuntimeException('Invalid private configuration shape.');
        }
    }
    if (($config['modules'] ?? null) !== ['auth-github', 'mail', 'matcher-user-profile', 'matcher-profile-privacy',
        'matcher-onboarding', 'matcher-resume-import', 'matcher-recommendation', 'matcher-ideas']) {
        throw new RuntimeException('Module allowlist mismatch.');
    }
}
function overnightValidateRequest(array $server): void
{
    if (($server['HTTP_HOST'] ?? '') !== '127.0.0.1:8113' || (string)($server['SERVER_PORT'] ?? '') !== '8113'
        || ($server['REMOTE_ADDR'] ?? '') !== '127.0.0.1') { throw new RuntimeException('Isolated HTTP target refused.'); }
}
