<?php
declare(strict_types=1);
require __DIR__ . '/guard.php';
$backend = dirname(__DIR__, 2);
$config = ['spec' => 'overnight-n01-v1', 'database' => 'humhub_overnight_n01_20261112',
    'username' => 'overnight_n01', 'host' => '127.0.0.1', 'port' => 8113,
    'socket' => $backend . '/.runtime/mysql.sock', 'runtime' => $backend . '/.runtime/overnight-integration',
    'password' => str_repeat('a', 64), 'cookie_key' => str_repeat('b', 64), 'nonce' => str_repeat('c', 64),
    'modules' => ['auth-github', 'mail', 'matcher-user-profile', 'matcher-profile-privacy',
        'matcher-onboarding', 'matcher-resume-import', 'matcher-recommendation', 'matcher-ideas']];
$checks = 0;
overnightValidateConfig($config, $backend); $checks++;
$upgraded = $config; $upgraded['modules'][] = 'matcher-webapp';
overnightValidateConfig($upgraded, $backend); $checks++;
$authConfig = $upgraded; $authConfig['modules'] = [...$upgraded['modules'], 'matcher-github-import', 'matcher-auth'];
$authConfig['auth_mode'] = true;
overnightValidateConfig($authConfig, $backend); $checks++;
foreach ([['modules' => $upgraded['modules'], 'auth_mode' => true], ['auth_mode' => 'true'], ['auth_mode' => 1]] as $change) {
    try { overnightValidateConfig(array_replace($authConfig, $change), $backend); throw new LogicException('Invalid auth mode accepted.'); }
    catch (RuntimeException) { $checks++; }
}
foreach ([array_reverse($upgraded['modules']), [...$upgraded['modules'], 'matcher-onboarding-ai'],
    ['matcher-webapp'], [...$config['modules'], 'arbitrary-plugin']] as $modules) {
    $bad = $config; $bad['modules'] = $modules;
    try { overnightValidateConfig($bad, $backend); throw new LogicException('Unapproved module transition was accepted.'); }
    catch (RuntimeException $expected) { $checks++; }
}
foreach (['database' => 'humhub', 'username' => 'root', 'port' => 8090, 'host' => '0.0.0.0',
    'socket' => '/tmp/mysql.sock', 'runtime' => '/tmp/wrong', 'nonce' => 'wrong', 'modules' => []] as $key => $value) {
    $bad = $config; $bad[$key] = $value;
    try { overnightValidateConfig($bad, $backend); throw new LogicException('Invalid target was accepted.'); }
    catch (RuntimeException $expected) { $checks++; }
}
$request = ['HTTP_HOST' => '127.0.0.1:8113', 'SERVER_PORT' => '8113', 'REMOTE_ADDR' => '127.0.0.1'];
overnightValidateRequest($request); $checks++;
foreach (['HTTP_HOST' => '127.0.0.1:8090', 'SERVER_PORT' => '8090', 'REMOTE_ADDR' => '192.0.2.1'] as $key => $value) {
    $bad = $request; $bad[$key] = $value;
    try { overnightValidateRequest($bad); throw new LogicException('Invalid request was accepted.'); }
    catch (RuntimeException $expected) { $checks++; }
}
$privateMessage = 'synthetic-private-exception-content';
$beforeYii = overnightErrorResponse(new RuntimeException($privateMessage));
if ($beforeYii['status'] !== 503 || $beforeYii['body']['error']['code'] !== 'ISOLATED_HARNESS_UNAVAILABLE'
    || str_contains(json_encode($beforeYii), $privateMessage) || class_exists(\yii\web\HttpException::class, false)) {
    throw new LogicException('Pre-bootstrap error handling must not load Yii or reveal diagnostics.');
}
$checks++;
foreach (['base/Exception.php', 'base/UserException.php', 'web/HttpException.php'] as $file) {
    require $backend . '/protected/vendor/yiisoft/yii2/' . $file;
}
foreach ([400, 401, 403, 404, 405, 409, 429, 500, 503, 599] as $status) {
    $response = overnightErrorResponse(new \yii\web\HttpException($status, $privateMessage));
    if ($response['status'] !== $status || $response['body']['error']['code'] !== 'ISOLATED_HTTP_ERROR'
        || str_contains(json_encode($response), $privateMessage)) {
        throw new LogicException('HTTP error status or redaction regression.');
    }
    $checks++;
}
foreach ([200, 302, 399, 600, '400'] as $status) {
    if (overnightErrorResponse(new \yii\web\HttpException($status, $privateMessage))['status'] !== 503) {
        throw new LogicException('Invalid HTTP status was accepted.');
    }
    $checks++;
}
$lookalike = new class($privateMessage) extends RuntimeException { public int $statusCode = 404; };
foreach ([new RuntimeException($privateMessage), $lookalike, new TypeError($privateMessage)] as $error) {
    $response = overnightErrorResponse($error);
    if ($response['status'] !== 503 || $response['body']['error']['code'] !== 'ISOLATED_HARNESS_UNAVAILABLE'
        || str_contains(json_encode($response), $privateMessage)) {
        throw new LogicException('Non-HTTP guard failure must stay unavailable and redacted.');
    }
    $checks++;
}
$router = file_get_contents(__DIR__ . '/router.php');
if (strpos($router, 'catch (\yii\web\HttpException $error)') >= strpos($router, 'catch (Throwable $error)')) {
    throw new LogicException('HTTP exception catch must precede the generic guard fallback.');
}
$checks++;
echo json_encode(['status' => 'passed', 'checks' => $checks]), PHP_EOL;
