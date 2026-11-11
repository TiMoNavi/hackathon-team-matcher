<?php
declare(strict_types=1);
/** Root-only, one selected synthetic job. No source/model/configuration text is logged. */
const S77_ROOT_DB = 'humhub_profile_s77_test_root_f3a9d621';
if (PHP_SAPI !== 'cli' || getenv('MATCHER_S77_LIVE_GATEWAY') !== '1'
    || ($argv[1] ?? '') !== S77_ROOT_DB
    || (getenv('MATCHER_S77_TEST_DB') !== false && getenv('MATCHER_S77_TEST_DB') !== S77_ROOT_DB)
    || !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $argv[2] ?? '')) {
    fwrite(STDERR, "S77 explicit root synthetic worker guard rejected before connection.\n"); exit(2);
}
putenv('MATCHER_S77_TEST_DB=' . S77_ROOT_DB);
$jobId = $argv[2]; $ledger = null; $store = null; $index = null;
try {
    $app = require dirname(__DIR__) . '/protected/modules/matcher-onboarding/tests/integration/s77_http_bootstrap.php';
    if ($app->db->createCommand('SELECT DATABASE()')->queryScalar() !== S77_ROOT_DB) { throw new RuntimeException('Wrong database.'); }
    $job = (new yii\db\Query())->select(['id','owner_id','execution_status','applicability','operation'])->from('{{%matcher_profile_ai_job}}')->where(['id' => $jobId])->one($app->db);
    if (!$job || $job['execution_status'] !== 'queued' || $job['applicability'] !== 'current' || !in_array($job['operation'], ['extract','questions','compose'], true)) { throw new RuntimeException('Job is not an executable queued root job.'); }
    $username = (new yii\db\Query())->select('username')->from('{{%user}}')->where(['id' => $job['owner_id']])->scalar($app->db);
    if (!is_string($username) || !str_starts_with($username, 's77_root_')) { throw new RuntimeException('Synthetic owner required.'); }
    $runtime = dirname(__DIR__) . '/.runtime/profile-s77/' . S77_ROOT_DB;
    $checkpoint = json_decode((string)file_get_contents($runtime . '/live-checkpoint.json'), true, 64, JSON_THROW_ON_ERROR);
    if (($checkpoint['database'] ?? null) !== S77_ROOT_DB || ($checkpoint['pending_job']['job_id'] ?? null) !== $jobId || ($checkpoint['fixture']['users']['owner'] ?? null) !== (int)$job['owner_id']) { throw new RuntimeException('Only the checkpoint selected owner/job may run.'); }
    require_once dirname(__DIR__) . '/protected/modules/matcher-onboarding/tests/integration/s77_live_ledger.php';
    $store = new S77LiveLedger($runtime . '/live-worker-ledger.json');
    $ledger = $store->read();
    if (($ledger['database'] ?? null) !== S77_ROOT_DB || !is_array($ledger['attempts'] ?? null) || count($ledger['attempts']) >= 6) { throw new RuntimeException('S77 hard experiment budget exhausted.'); }
    foreach ($ledger['attempts'] as $entry) { if ($entry['job_id'] === $jobId) { throw new RuntimeException('The same job cannot execute twice.'); } }
    $index = count($ledger['attempts']);
    // Reserve before config loading/transport: interrupted execution consumes a conservative slot.
    $ledger['attempts'][] = ['job_id' => $jobId, 'operation' => $job['operation'], 'started_at' => gmdate('c'), 'status' => 'started', 'metrics' => ['llm_calls' => null, 'accounting_complete' => false]];
    $store->write($ledger);
    $module = $app->getModule('matcher-onboarding-ai');
    if ($module === null || !$module->isEnabled) { throw new RuntimeException('P6 must be enabled.'); }
    // Bootstrap is intentionally disabled; only this guarded CLI restores the production default.
    $module->configPath = null;
    $result = $app->getModule('matcher-onboarding')->getAiJobService()->work($jobId);
    if (!is_array($result)) { throw new RuntimeException('Selected job was not executed.'); }
    $safe = array_intersect_key($result, array_flip(['id','job_id','operation','execution_status','applicability','error_code','metrics']));
    $ledger['attempts'][$index] = array_replace($ledger['attempts'][$index], ['status' => 'finished', 'finished_at' => gmdate('c')], $safe);
    $store->write($ledger);
    echo json_encode(['worker' => 'completed', 'attempts_reserved' => count($ledger['attempts']), 'job' => $safe], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    if ($store !== null && is_array($ledger) && $index !== null) {
        $ledger['attempts'][$index]['status'] = 'worker_failed_or_interrupted';
        $ledger['attempts'][$index]['finished_at'] = gmdate('c');
        try { $store->write($ledger); } catch (Throwable) { /* Previous atomic reservation remains unknown. */ }
    }
    fwrite(STDERR, json_encode(['worker' => 'failed', 'type' => get_class($error), 'details_redacted' => true], JSON_THROW_ON_ERROR) . PHP_EOL);
    exit(1);
} finally { unset($store); }
