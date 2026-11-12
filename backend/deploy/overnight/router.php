<?php
declare(strict_types=1);
require_once __DIR__ . '/guard.php';
try {
    overnightValidateRequest($_SERVER);
    $runtime = dirname(__DIR__, 2) . '/.runtime/overnight-integration';
    $path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
    if (str_contains($path, '\\') || str_contains($path, "\0") || preg_match('~(?:^|/)\.\.?(?:/|$)~', $path)) {
        http_response_code(404); exit;
    }
    if (str_starts_with($path, '/assets/')) {
        $file = realpath($runtime . $path);
        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        if ($file && is_file($file) && str_starts_with($file, $runtime . '/assets/')
            && in_array($extension, ['js', 'mjs', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'ico', 'woff', 'woff2', 'ttf', 'otf'], true)) {
            header('X-Content-Type-Options: nosniff');
            return false;
        }
        http_response_code(404); exit;
    }
    if (preg_match('~^/(?:private\.json|marker\.json|mysql\.cnf|server\.json|runtime|sessions|uploads|mail|cache|themes|modules|backups|protected|deploy|\.)~', $path)) {
        http_response_code(404); exit;
    }
    $app = require __DIR__ . '/bootstrap.php';
    $app->run();
} catch (Throwable $error) {
    http_response_code(503);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode(['error' => ['code' => 'ISOLATED_HARNESS_UNAVAILABLE', 'message' => 'The isolated harness refused this request.']]);
}
