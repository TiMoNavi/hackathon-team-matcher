<?php
declare(strict_types=1);
require_once __DIR__ . '/guard.php';
try {
    chatValidateRequest($_SERVER);
    $runtime = dirname(__DIR__, 2) . '/.runtime/chat-upgrade';
    $path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
    if (str_contains($path, chr(92)) || str_contains($path, chr(0)) || preg_match('~(?:^|/)[.][.]?(?:/|$)~', $path)) {
        http_response_code(404); exit;
    }
    if (str_starts_with($path, '/assets/')) {
        $file = realpath($runtime . $path);
        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        if ($file && is_file($file) && str_starts_with($file, $runtime . '/assets/')
            && in_array($extension, ['js', 'mjs', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'ico', 'woff', 'woff2', 'ttf', 'otf'], true)) {
            header('X-Content-Type-Options: nosniff'); return false;
        }
        http_response_code(404); exit;
    }
    // Native routes are dispatched by Yii; this never serves the private mail directory.
    $nativeMailRoute = preg_match('~^/mail/mail(?:/[a-z][a-z-]*)?$~D', $path) === 1;
    if (!$nativeMailRoute && preg_match('~^/(?:private[.]json|marker[.]json|c04-fixture[.]json|mysql[.]cnf|server[.]json|runtime|sessions|uploads|mail|cache|themes|modules|backups|protected|deploy|[.])(?:/|$)~', $path)) {
        http_response_code(404); exit;
    }
    $app = require __DIR__ . '/bootstrap.php'; $app->run();
} catch (Throwable $error) {
    // Yii test mode throws ExitException even after end() has sent its response.
    // Preserve that completed response; never turn an intentional 302 into a 500.
    if ($error instanceof \yii\base\ExitException && $error->statusCode === 0
        && class_exists(\Yii::class, false) && \Yii::$app instanceof \yii\web\Application
        && \Yii::$app->state === \yii\base\Application::STATE_END
        && \Yii::$app->has('response', true) && \Yii::$app->get('response', false)->isSent) { return; }
    $allowHeaderValues = [];
    // Do not create a response component or invent a policy for another route.
    if ($error instanceof \yii\web\HttpException && $error->statusCode === 405
        && class_exists(\Yii::class, false) && \Yii::$app instanceof \yii\web\Application
        && \Yii::$app->has('response', true)) {
        $applicationResponse = \Yii::$app->get('response', false);
        if ($applicationResponse instanceof \yii\web\Response) {
            $allowHeaderValues = $applicationResponse->getHeaders()->get('Allow', [], false);
        }
    }
    $response = chatErrorResponse($error, $allowHeaderValues);
    http_response_code($response['status']);
    foreach ($response['headers'] as $name => $value) { header($name . ': ' . $value); }
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff');
    echo json_encode($response['body'], JSON_THROW_ON_ERROR);
}
