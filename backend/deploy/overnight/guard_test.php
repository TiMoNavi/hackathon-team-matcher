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
echo json_encode(['status' => 'passed', 'checks' => $checks]), PHP_EOL;
