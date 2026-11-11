<?php
declare(strict_types=1);
require __DIR__ . '/s2_persistence_bootstrap.php';
use humhub\modules\matcherProfile\adapters\persistence\ProfileSchemaUpgradeV2;
use humhub\modules\matcherProfile\adapters\persistence\SqlProfileRepository;
use humhub\modules\matcherProfile\domain\ProfileScope;
use yii\db\Query;

$checks = [];
$assert = static function(bool $ok, string $name) use (&$checks): void { if (!$ok) { throw new RuntimeException('Assertion failed: ' . $name); } $checks[] = $name; };
$start = static function(array $job) use($backend, $target): array {
    $process = proc_open([PHP_BINARY, '-c', $backend . '/.runtime/php.ini', __DIR__ . '/s2_persistence_worker.php', $target], [['pipe','r'],['pipe','w'],['pipe','w']], $pipes);
    fwrite($pipes[0], json_encode($job) . "\n"); fflush($pipes[0]);
    if (trim((string)fgets($pipes[1])) !== 'ready') { throw new RuntimeException('Race worker did not reach barrier.'); }
    return [$process, $pipes];
};
$collect = static function(array $worker): array {
    [$process, $pipes] = $worker; fclose($pipes[0]);
    $result = stream_get_contents($pipes[1]); $error = stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]);
    if (proc_close($process) !== 0 || $error !== '') { throw new RuntimeException('Race worker failed.'); }
    return json_decode($result, true, 512, JSON_THROW_ON_ERROR);
};
try {
    (new ProfileSchemaUpgradeV2($db))->install();
    $owner = (int)(new Query())->select('id')->from('user')->where(['status' => 1])->orderBy('id')->scalar($db);
    $repo = new SqlProfileRepository($db, static function(int $id): void {});
    $before = (int)($repo->findState($owner, ProfileScope::global())['revision'] ?? 0);
    $writer = $start(['action' => 'timezone_writer', 'owner' => $owner]);
    $reader = $start(['action' => 'timezone_reader', 'owner' => $owner]);
    fwrite($writer[1][0], "release\n"); fflush($writer[1][0]);
    $write = $collect($writer); $read = $collect($reader);
    $assert($write['status'] === 'ok', 'timezone_writer_completes_without_user_lock_upgrade_deadlock');
    $assert($read['status'] === 'ok', 'concurrent_locked_profile_reader_completes');
    $assert($write['revision'] === $before + 1 && $read['revision'] === $write['revision'], 'reader_observes_post_commit_revision');
    $assert($read['timezone'] === 'Pacific/Auckland', 'reader_observes_committed_native_timezone');
    echo json_encode(['status' => 'passed', 'checks' => count($checks), 'passed' => $checks, 'real_concurrent_connections' => true, 'preview_database_connected' => false], JSON_PRETTY_PRINT) . PHP_EOL;
} catch(Throwable $e) {
    fwrite(STDERR, json_encode(['status' => 'failed', 'passed' => count($checks), 'error_type' => get_class($e), 'reason' => str_starts_with($e->getMessage(), 'Assertion failed: ') ? $e->getMessage() : 'Race test failed; raw details suppressed']) . PHP_EOL); exit(1);
}
