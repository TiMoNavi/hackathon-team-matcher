<?php
declare(strict_types=1);
/** Test-only loopback session router; never include in a deployment. */
if (($_SERVER['REMOTE_ADDR'] ?? '') !== '127.0.0.1' || ($_SERVER['HTTP_HOST'] ?? '') !== '127.0.0.1:8107' || (int)($_SERVER['SERVER_PORT'] ?? 0) !== 8107) { http_response_code(403); exit; }
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
if (str_contains($path, "\0") || str_contains($path, '\\') || in_array('..', explode('/', $path), true) || preg_match('~^/(?:protected|deploy|\.runtime|\.local|uploads)(?:/|$)~', $path)) { http_response_code(404); exit; }
$backend = dirname(__DIR__, 5); $_SERVER['SCRIPT_NAME'] = '/index.php'; $_SERVER['SCRIPT_FILENAME'] = $backend . '/index.php';
define('MATCHER_S77_HTTP_WEB', true);
$app = require __DIR__ . '/s77_audit_bootstrap.php';
require __DIR__ . '/s77_audit_support.php';
s77AuditInject($app);
if ($path === '/__s77_audit/login') {
    $id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT); $user = humhub\modules\user\models\User::findOne($id ?: 0);
    if (!$user || !str_starts_with((string)$user->username, 's77_audit_')) { http_response_code(403); exit; }
    $app->user->login($user, 0); $app->response->format = yii\web\Response::FORMAT_JSON;
    $app->response->data = ['user_id' => (int)$user->id, 'csrf' => $app->request->getCsrfToken()]; $app->response->send(); return;
}
$app->run();
