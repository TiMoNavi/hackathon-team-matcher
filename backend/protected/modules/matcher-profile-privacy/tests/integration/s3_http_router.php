<?php
declare(strict_types=1);
/** Test-only loopback router; requires an isolated database and synthetic users. */
if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) { http_response_code(403); exit; }
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
if (str_contains($path, "\0") || str_contains($path, '\\') || in_array('..', explode('/', $path), true)) { http_response_code(404); exit; }
$backend = dirname(__DIR__, 5);
if (str_starts_with($path, '/assets/') || str_starts_with($path, '/themes/')) {
    $file = realpath($backend . $path);
    if ($file && str_starts_with($file, $backend . '/') && is_file($file) && !preg_match('/\.(php\d*|phtml|phar)$/i', $file)) { return false; }
}
if (preg_match('~^/(?:protected|deploy|\.runtime|\.local|uploads/file|uploads/files)(?:/|$)~', $path)) { http_response_code(404); exit; }
$_SERVER['SCRIPT_NAME'] = '/index.php'; $_SERVER['SCRIPT_FILENAME'] = $backend . '/index.php';
define('MATCHER_S3_HTTP_WEB', true);
$app = require __DIR__ . '/s3_http_bootstrap.php';
$app->response->on(yii\web\Response::EVENT_BEFORE_SEND, static function () use ($app): void {
    $error = $app->errorHandler->exception;
    if ($error !== null) {
        $trace = array_map(static fn(array $frame): array => array_intersect_key($frame, array_flip(['file', 'line', 'function', 'class'])), $error->getTrace());
        file_put_contents($app->runtimePath . '/last-error-location.json', json_encode(['type' => get_class($error), 'file' => $error->getFile(), 'line' => $error->getLine(), 'trace' => $trace], JSON_THROW_ON_ERROR));
    }
});
if ($path === '/__s3_test/login') {
    $id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);
    $user = humhub\modules\user\models\User::findOne($id ?: 0);
    if (!$user || !str_starts_with((string)$user->username, 's3_')) { http_response_code(403); exit; }
    $app->user->login($user, 0);
    $app->response->format = yii\web\Response::FORMAT_JSON;
    $app->response->data = ['user_id' => (int)$user->id, 'csrf' => $app->request->getCsrfToken()];
    $app->response->send(); return;
}
$app->run();
