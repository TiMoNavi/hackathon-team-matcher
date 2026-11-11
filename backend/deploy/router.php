<?php
// Development server router: never expose source, local state, or private uploads.
$root = dirname(__DIR__);
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
$segments = explode('/', $path);
if (str_contains($path, "\0") || str_contains($path, '\\') || in_array('..', $segments, true)) {
    http_response_code(404); exit;
}
foreach ($segments as $segment) {
    if ($segment !== '' && str_starts_with($segment, '.')) { http_response_code(404); exit; }
}
$forbidden = ['protected', 'deploy', 'docs', 'dist', 'node_modules', 'tests', 'vendor'];
if (in_array($segments[1] ?? '', $forbidden, true) || str_starts_with($path, '/uploads/file/') || str_starts_with($path, '/uploads/files/')) {
    http_response_code(404); exit;
}
$file = realpath($root . $path);
if ($file && str_starts_with($file, $root . '/') && is_file($file)) {
    $public = str_starts_with($path, '/assets/') || str_starts_with($path, '/themes/')
        || str_starts_with($path, '/uploads/profile_image/') || in_array($path, ['/favicon.ico', '/robots.txt'], true);
    if ($public && !preg_match('/\.(php\d*|phtml|phar)$/i', $file)) { return false; }
    if ($path !== '/index.php') { http_response_code(404); exit; }
}
$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['SCRIPT_FILENAME'] = $root . '/index.php';
require $root . '/index.php';
