<?php
declare(strict_types=1);
/** Independent audit: reject other targets before loading any application configuration. */
$target = getenv('MATCHER_S76_TEST_DB') ?: ($argv[1] ?? '');
if ($target !== 'humhub_profile_s76_test_audit_6b49d027') { throw new RuntimeException('S76 audit database target rejected before connection.'); }
if (defined('MATCHER_S76_HTTP_WEB') && MATCHER_S76_HTTP_WEB) {
    if (($_SERVER['HTTP_HOST'] ?? '') !== '127.0.0.1:8105' || (int)($_SERVER['SERVER_PORT'] ?? 0) !== 8105) { throw new RuntimeException('S76 audit origin rejected before connection.'); }
}
$app = require __DIR__ . '/s76_http_bootstrap.php';
if ($app->db->createCommand('SELECT DATABASE()')->queryScalar() !== $target) { throw new RuntimeException('S76 audit database mismatch.'); }
return $app;
