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
define('MATCHER_S5_HTTP_WEB', true);
$app = require __DIR__ . '/s5_http_bootstrap.php';
// Test-only external-source adapter: real HTTP/application/database flow remains intact.
if (!$app->user->isGuest && str_starts_with((string)$app->user->identity->username, 's5_')) {
    $github = $app->getModule('matcher-github-import');
    if ($github !== null) {
        $github->setSourceReader(new \humhub\modules\matcherGithubImport\application\GithubSourceReader(
            new \humhub\modules\matcherGithubImport\adapters\native\NativeGithubIdentity($app->db),
            new \humhub\modules\matcherGithubImport\tests\integration\GithubFixtureApi((int)$app->user->id, $app->runtimePath),
        ));
    }
}
$app->response->on(yii\web\Response::EVENT_BEFORE_SEND, static function () use ($app): void {
    $error = $app->errorHandler->exception;
    if ($error !== null) {
        $trace = array_map(static fn(array $frame): array => array_intersect_key($frame, array_flip(['file', 'line', 'function', 'class'])), $error->getTrace());
        file_put_contents($app->runtimePath . '/last-error-location.json', json_encode(['type' => get_class($error), 'file' => $error->getFile(), 'line' => $error->getLine(), 'trace' => $trace], JSON_THROW_ON_ERROR));
    }
});
if ($path === '/__s5_test/login') {
    $id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);
    $user = humhub\modules\user\models\User::findOne($id ?: 0);
    if (!$user || !str_starts_with((string)$user->username, 's5_')) { http_response_code(403); exit; }
    $app->user->login($user, 0);
    $linked = \humhub\modules\user\models\Auth::find()->where(['user_id'=>$user->id,'source'=>'github'])->exists();
    $app->session->set('currentAuthClientId', $linked ? 'github' : 'local');
    $app->response->format = yii\web\Response::FORMAT_JSON;
    $app->response->data = ['user_id' => (int)$user->id, 'csrf' => $app->request->getCsrfToken()];
    $app->response->send(); return;
}
if ($path === '/__s5_test/github-count') {
    if ($app->user->isGuest || !str_starts_with((string)$app->user->identity->username, 's5_')) { http_response_code(403); exit; }
    $count=0;$log=$app->runtimePath.'/github-fixture-requests.jsonl';
    if(is_file($log)){foreach(file($log,FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $line){$entry=json_decode($line,true);if(($entry['owner_id']??0)===(int)$app->user->id){++$count;}}}
    $app->response->format=\yii\web\Response::FORMAT_JSON;$app->response->data=['requests'=>$count];$app->response->send();return;
}
$app->run();
