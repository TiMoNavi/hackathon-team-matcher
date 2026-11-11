<?php
declare(strict_types=1);
/** Explicit opt-in, isolated synthetic-account worker. Never prints model text or configuration. */
if (PHP_SAPI !== 'cli' || getenv('MATCHER_S6_LIVE_GATEWAY') !== '1') {
    fwrite(STDERR, "An explicit synthetic live-gateway test opt-in is required.\n"); exit(2);
}
$database = $argv[1] ?? ''; $jobId = $argv[2] ?? '';
if (!preg_match('/^humhub_profile_s6_test_root_[a-f0-9]{8}$/D', $database) || !preg_match('/^[a-f0-9-]{36}$/D', $jobId)) {
    fwrite(STDERR, "Provide a root S6 isolated database and job ID.\n"); exit(2);
}
putenv('MATCHER_S6_TEST_DB=' . $database);
try {
    $app = require dirname(__DIR__) . '/protected/modules/matcher-onboarding/tests/integration/s6_http_bootstrap.php';
    $result = $app->getModule('matcher-onboarding')->getAiJobService()->work($jobId);
    if (!is_array($result)) { throw new RuntimeException('No requested job was executed.'); }
    $safe = array_intersect_key($result, array_flip(['id','job_id','execution_status','applicability','error_code','metrics']));
    echo json_encode(['worker' => 'completed', 'job' => $safe], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, json_encode(['worker' => 'failed', 'type' => get_class($error)], JSON_THROW_ON_ERROR) . PHP_EOL);
    exit(1);
}
