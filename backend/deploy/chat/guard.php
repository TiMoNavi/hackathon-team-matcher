<?php
declare(strict_types=1);
/** Pure guards; these functions never read application configuration or connect to a database. */
function chatValidateConfig(array $config, string $backend): void
{
    $expected = ['spec' => 'chat-c02-v1', 'database' => 'humhub_chat_c02_20261112',
        'username' => 'chat_c02', 'host' => '127.0.0.1', 'port' => 8124,
        'socket' => $backend . '/.runtime/mysql.sock', 'runtime' => $backend . '/.runtime/chat-upgrade'];
    $keys = array_keys($config); sort($keys);
    $allowed = array_merge(array_keys($expected), ['password', 'cookie_key', 'nonce', 'modules']); sort($allowed);
    if ($keys !== $allowed) { throw new RuntimeException('Unexpected configuration fields.'); }
    foreach ($expected as $key => $value) {
        if (($config[$key] ?? null) !== $value) { throw new RuntimeException('Isolation target mismatch before bootstrap.'); }
    }
    foreach (['password', 'cookie_key', 'nonce'] as $key) {
        if (!is_string($config[$key] ?? null) || preg_match('/^[a-f0-9]{64}$/D', $config[$key]) !== 1) {
            throw new RuntimeException('Invalid private configuration shape.');
        }
    }
    if (!in_array($config['modules'], [['mail'], ['mail', 'matcher-chat-ui'], ['mail', 'matcher-chat-ui', 'matcher-chat']], true)) {
        throw new RuntimeException('Fixed module allowlist mismatch.');
    }
}

function chatValidateRequest(array $server): void
{
    if (($server['HTTP_HOST'] ?? '') !== '127.0.0.1:8124' || (string)($server['SERVER_PORT'] ?? '') !== '8124'
        || ($server['REMOTE_ADDR'] ?? '') !== '127.0.0.1') { throw new RuntimeException('Isolated HTTP target refused.'); }
}

function chatWebBootstrap(array $bootstrap): array
{
    $loader = 'humhub\components\bootstrap\ModuleAutoLoader';
    $language = 'humhub\components\bootstrap\LanguageSelector';
    $chat = 'humhub\modules\matcherChat\adapters\http\ChatRequestBootstrap';
    if (count(array_keys($bootstrap, $loader, true)) !== 1 || count(array_keys($bootstrap, $language, true)) !== 1
        || in_array($chat, $bootstrap, true)) { throw new RuntimeException('Unexpected chat bootstrap contract.'); }
    $loadIndex = array_search($loader, $bootstrap, true); $languageIndex = array_search($language, $bootstrap, true);
    if ($loadIndex >= $languageIndex) { throw new RuntimeException('Invalid bootstrap order.'); }
    array_splice($bootstrap, $languageIndex, 0, [$chat]);
    return $bootstrap;
}

function chatPrivatePath(string $path, int $mode, bool $directory = false): void
{
    clearstatcache(true, $path);
    if (is_link($path) || !file_exists($path) || !function_exists('posix_geteuid')
        || fileowner($path) !== posix_geteuid() || (fileperms($path) & 0777) !== $mode
        || ($directory ? !is_dir($path) : !is_file($path))) {
        throw new RuntimeException('Private path ownership or permissions refused.');
    }
}

function chatErrorResponse(Throwable $error, array $allowHeaderValues = []): array
{
    if (class_exists(\yii\web\HttpException::class, false) && $error instanceof \yii\web\HttpException
        && is_int($error->statusCode) && $error->statusCode >= 400 && $error->statusCode <= 599) {
        // Preserve only the exact method policy already set by the application.
        $headers = $error->statusCode === 405 && $allowHeaderValues === ['GET'] ? ['Allow' => 'GET'] : [];
        return ['status' => $error->statusCode, 'headers' => $headers, 'body' => ['error' => [
            'code' => 'CHAT_ISOLATED_HTTP_ERROR', 'message' => 'The isolated application rejected this request.',
        ]]];
    }
    return ['status' => 503, 'headers' => [], 'body' => ['error' => [
        'code' => 'CHAT_ISOLATION_UNAVAILABLE', 'message' => 'The chat harness refused this request.',
    ]]];
}
