<?php
declare(strict_types=1);
/** Independent audit: reject other targets before loading any application configuration. */
$target = getenv('MATCHER_S77_TEST_DB') ?: ($argv[1] ?? '');
if ($target !== 'humhub_profile_s77_test_audit_a8c52e14') { throw new RuntimeException('S77 audit database target rejected before connection.'); }
if (defined('MATCHER_S77_HTTP_WEB') && MATCHER_S77_HTTP_WEB) {
    if (($_SERVER['HTTP_HOST'] ?? '') !== '127.0.0.1:8107' || (int)($_SERVER['SERVER_PORT'] ?? 0) !== 8107) { throw new RuntimeException('S77 audit origin rejected before connection.'); }
}
$app = require __DIR__ . '/s77_http_bootstrap.php';
if ($app->db->createCommand('SELECT DATABASE()')->queryScalar() !== $target) { throw new RuntimeException('S77 audit database mismatch.'); }
return $app;
