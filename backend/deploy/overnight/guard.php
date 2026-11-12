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
    $legacy = ['auth-github', 'mail', 'matcher-user-profile', 'matcher-profile-privacy',
        'matcher-onboarding', 'matcher-resume-import', 'matcher-recommendation', 'matcher-ideas'];
    $n03 = [...$legacy, 'matcher-webapp'];
    $n04 = [...$n03, 'matcher-github-import', 'matcher-auth'];
    $n05 = [...$n04, 'matcher-event-access'];
    if (!in_array($config['modules'] ?? null, [$legacy, $n03, $n04, $n05], true)) {
        throw new RuntimeException('Module allowlist mismatch.');
    }
    if (!is_bool($config['auth_mode'] ?? false) || (($config['auth_mode'] ?? false) && !in_array($config['modules'], [$n04, $n05], true))) {
        throw new RuntimeException('Authentication mode requires the fixed module set.');
    }
}
function overnightValidateRequest(array $server): void
{
    if (($server['HTTP_HOST'] ?? '') !== '127.0.0.1:8113' || (string)($server['SERVER_PORT'] ?? '') !== '8113'
        || ($server['REMOTE_ADDR'] ?? '') !== '127.0.0.1') { throw new RuntimeException('Isolated HTTP target refused.'); }
}

/** Preserve only an already loaded Yii HTTP error; never expose exception diagnostics. */
function overnightErrorResponse(Throwable $error): array
{
    if (class_exists(\yii\web\HttpException::class, false) && $error instanceof \yii\web\HttpException
        && is_int($error->statusCode) && $error->statusCode >= 400 && $error->statusCode <= 599) {
        return ['status' => $error->statusCode, 'body' => ['error' => [
            'code' => 'ISOLATED_HTTP_ERROR', 'message' => 'The isolated application rejected this request.',
        ]]];
    }
    return ['status' => 503, 'body' => ['error' => [
        'code' => 'ISOLATED_HARNESS_UNAVAILABLE', 'message' => 'The isolated harness refused this request.',
    ]]];
}
