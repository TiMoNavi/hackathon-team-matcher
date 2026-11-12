<?php
declare(strict_types=1);
namespace yii\web {
    class HttpException extends \RuntimeException {
        public function __construct(public int $statusCode) { parent::__construct('synthetic private detail'); }
    }
}
namespace {
    require __DIR__ . '/guard.php';
    $checks = 0;
    $check = static function (bool $value) use (&$checks): void {
        if (!$value) { throw new \RuntimeException('Offline guard check failed.'); } ++$checks;
    };
    $reject = static function (callable $action) use ($check): void {
        try { $action(); } catch (\RuntimeException $error) { $check(true); return; } $check(false);
    };
    $backend = '/synthetic/backend';
    $config = ['spec' => 'chat-c02-v1', 'database' => 'humhub_chat_c02_20261112', 'username' => 'chat_c02',
        'host' => '127.0.0.1', 'port' => 8124, 'socket' => $backend . '/.runtime/mysql.sock',
        'runtime' => $backend . '/.runtime/chat-upgrade', 'password' => str_repeat('a', 64),
        'cookie_key' => str_repeat('b', 64), 'nonce' => str_repeat('c', 64), 'modules' => ['mail']];
    chatValidateConfig($config, $backend); $check(true);
    chatValidateConfig([...$config, 'modules' => ['mail', 'matcher-chat-ui']], $backend); $check(true);
    chatValidateConfig([...$config, 'modules' => ['mail', 'matcher-chat-ui', 'matcher-chat']], $backend); $check(true);
    foreach (['database' => 'humhub_preview', 'username' => 'root', 'host' => '0.0.0.0', 'port' => 8113,
        'socket' => '/tmp/mysql.sock', 'runtime' => '/tmp/another', 'spec' => 'overnight-n01-v1', 'nonce' => 'bad'] as $key => $value) {
        $reject(static fn() => chatValidateConfig([...$config, $key => $value], $backend));
    }
    foreach ([[], ['matcher-chat-ui'], ['matcher-chat-ui', 'mail'], ['mail', 'matcher-auth'], ['mail', 'matcher-chat'], ['mail', 'matcher-chat-ui', 'matcher-chat', 'matcher-auth']] as $modules) {
        $reject(static fn() => chatValidateConfig([...$config, 'modules' => $modules], $backend));
    }
    $reject(static fn() => chatValidateConfig([...$config, 'port' => '8124'], $backend));
    $reject(static fn() => chatValidateConfig([...$config, 'auth_mode' => true], $backend));
    $request = ['HTTP_HOST' => '127.0.0.1:8124', 'SERVER_PORT' => '8124', 'REMOTE_ADDR' => '127.0.0.1'];
    $loader = 'humhub\components\bootstrap\ModuleAutoLoader'; $language = 'humhub\components\bootstrap\LanguageSelector';
    $chat = 'humhub\modules\matcherChat\adapters\http\ChatRequestBootstrap';
    $check(chatWebBootstrap(['log', $loader, 'other', $language]) === ['log', $loader, 'other', $chat, $language]);
    foreach ([[], [$language, $loader], [$loader, $loader, $language], [$loader, $chat, $language], [$loader, $language, $language]] as $boot) {
        $reject(static fn() => chatWebBootstrap($boot));
    }
    chatValidateRequest($request); $check(true);
    foreach (['HTTP_HOST' => 'localhost:8124', 'SERVER_PORT' => '8113', 'REMOTE_ADDR' => '192.0.2.1'] as $key => $value) {
        $reject(static fn() => chatValidateRequest([...$request, $key => $value]));
    }
    foreach ([400, 401, 403, 404, 405, 409, 500] as $status) {
        $result = chatErrorResponse(new \yii\web\HttpException($status));
        $check($result['status'] === $status && $result['headers'] === [] && !str_contains(json_encode($result), 'synthetic private detail'));
    }
    $check(chatErrorResponse(new \yii\web\HttpException(405), ['GET'])['headers'] === ['Allow' => 'GET']);
    foreach ([[], ['POST'], ['get'], [' GET'], ['GET '], ['GET, POST'], ['GET', 'POST'], ['GET', 'GET'], ['GET' . chr(13) . chr(10) . 'X-Untrusted: value'], [null], [true], ['allow' => 'GET']] as $allowValues) {
        $check(chatErrorResponse(new \yii\web\HttpException(405), $allowValues)['headers'] === []);
    }
    foreach ([400, 401, 403, 404, 409, 500, 503, 302] as $status) {
        $check(chatErrorResponse(new \yii\web\HttpException($status), ['GET'])['headers'] === []);
    }
    $check(chatErrorResponse(new \RuntimeException('synthetic secret'), ['GET'])['headers'] === []);
    $check(chatErrorResponse(new \RuntimeException('synthetic secret'))['status'] === 503);
    $check(chatErrorResponse(new \yii\web\HttpException(302))['status'] === 503);
    $path = tempnam(sys_get_temp_dir(), 'chat-guard-');
    try {
        chmod($path, 0600); chatPrivatePath($path, 0600); $check(true);
        chmod($path, 0644); $reject(static fn() => chatPrivatePath($path, 0600));
        chmod($path, 0600); symlink($path, $path . '-link');
        $reject(static fn() => chatPrivatePath($path . '-link', 0600));
        $reject(static fn() => chatPrivatePath($path . '-absent', 0600));
    } finally {
        if (is_link($path . '-link')) { unlink($path . '-link'); } unlink($path);
    }
    echo json_encode(['status' => 'passed', 'checks' => $checks, 'database_access' => false, 'real_credentials_read' => false]), PHP_EOL;
}
