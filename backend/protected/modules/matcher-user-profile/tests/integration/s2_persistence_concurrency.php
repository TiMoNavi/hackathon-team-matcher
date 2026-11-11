<?php
declare(strict_types=1);
require __DIR__ . '/s2_persistence_bootstrap.php';
use humhub\modules\matcherProfile\adapters\persistence\ProfileSchemaUpgradeV2;
use humhub\modules\matcherProfile\adapters\persistence\SqlProfileRepository;
use humhub\modules\matcherProfile\adapters\persistence\NativeProfileAccessPolicy;
use humhub\modules\matcherProfile\application\ProfileService;
use humhub\modules\matcherProfile\domain\ProfileScope;
use yii\db\Query;

$checks = []; $current = 'bootstrap'; $tx = null;
$assert = static function (bool $condition, string $name) use (&$checks, &$current): void { $current = $name; if (!$condition) { throw new RuntimeException('Assertion failed: ' . $name); } $checks[] = $name; };
$spawn = static function (array $job) use ($target, $backend): array {
    $process = proc_open([PHP_BINARY, '-c', $backend . '/.runtime/php.ini', __DIR__ . '/s2_persistence_worker.php', $target], [['pipe','r'],['pipe','w'],['pipe','w']], $pipes);
    if (!is_resource($process)) { throw new RuntimeException('Unable to start concurrency worker.'); }
    fwrite($pipes[0], json_encode($job) . "\n"); fclose($pipes[0]);
    if (trim((string)fgets($pipes[1])) !== 'ready') { throw new RuntimeException('Concurrency worker bootstrap failed.'); }
    return [$process, $pipes];
};
$collect = static function (array $worker): array {
    [$process, $pipes] = $worker; $json = stream_get_contents($pipes[1]); $errors = stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]); $exit = proc_close($process);
    if ($exit !== 0 || $errors !== '') { throw new RuntimeException('Concurrency worker failed; raw output suppressed.'); }
    return json_decode($json, true, 512, JSON_THROW_ON_ERROR);
};
try {
    (new ProfileSchemaUpgradeV2($db))->install();
    $owner = (int)(new Query())->select('id')->from('user')->where(['status' => 1])->orderBy('id')->scalar($db);
    $scope = ProfileScope::global();
    $repo = new SqlProfileRepository($db, static function(int $id): void {});
    $service = new ProfileService($repo, new NativeProfileAccessPolicy($db, static fn(): bool => false));
    $assert($repo->findState($owner, $scope) === null, 'clone_starts_without_profile_state');
    $workers = [$spawn(['action' => 'ensure', 'owner' => $owner]), $spawn(['action' => 'ensure', 'owner' => $owner])];
    $results = array_map($collect, $workers);
    $assert($results[0]['status'] === 'ok' && $results[1]['status'] === 'ok' && $results[0]['id'] === $results[1]['id'], 'concurrent_first_creation_returns_one_state');
    $assert((int)(new Query())->from('{{%matcher_profile_state}}')->where(['user_id' => $owner, 'scope_key' => 'global'])->count('*', $db) === 1, 'concurrent_creation_unique_constraint_holds');
    $drafts = [];
    foreach (['合成并发值甲','合成并发值乙'] as $text) {
        $d = $service->startDraft($owner, $owner, $scope, 'manual', false);
        $drafts[] = $service->updateDraft($owner, $owner, $scope, $d['id'], $d['draft_version'], [['key' => 'headline', 'value' => $text]]);
    }
    $workers = [];
    foreach ($drafts as $d) { $workers[] = $spawn(['action' => 'confirm', 'owner' => $owner, 'draft' => $d['id'], 'version' => $d['draft_version'], 'base' => 0]); }
    $results = array_map($collect, $workers);
    $statuses = array_column($results, 'status'); sort($statuses);
    $assert($statuses === ['ok','rejected'], 'two_connections_allow_only_one_old_base_confirmation');
    $assert((int)$repo->findState($owner, $scope)['revision'] === 1, 'race_advances_revision_once');
    $assert((int)(new Query())->from('{{%matcher_profile_revision}}')->count('*', $db) === 1, 'race_creates_one_snapshot');
    // Membership removal on another connection waits for the access-policy shared lock.
    $space = (int)(new Query())->select('space_id')->from('space_membership')->where(['user_id' => $owner, 'status' => 3])->orderBy('space_id')->scalar($db);
    $tx = $db->beginTransaction();
    (new NativeProfileAccessPolicy($db, static fn(): bool => false))->assertOwner($owner, $owner, ProfileScope::event($space));
    $result = $collect($spawn(['action' => 'remove_member', 'owner' => $owner, 'space' => $space]));
    $assert($result['status'] === 'db_error' && $result['code'] === 1205, 'formal_membership_lock_prevents_mid_write_removal');
    $tx->rollBack(); $tx = null;
    // Projection failures are durable and retryable without repeating the confirmed mutation.
    $failing = new SqlProfileRepository($db, static function(int $id): void { throw new RuntimeException('Synthetic projection failure.'); });
    $state = $repo->findState($owner, $scope);
    // Existing healthy repo callback would clear the flag first, so invoke failing recovery explicitly.
    $db->createCommand()->update('{{%matcher_profile_state}}', ['projection_pending' => 1], ['id' => $state['id']])->execute();
    $failing->retryPendingProjections();
    $assert((int)(new Query())->select('projection_pending')->from('{{%matcher_profile_state}}')->where(['id' => $state['id']])->scalar($db) === 1, 'failed_projection_stays_pending');
    $repo->retryPendingProjections();
    $assert((int)(new Query())->select('projection_pending')->from('{{%matcher_profile_state}}')->where(['id' => $state['id']])->scalar($db) === 0, 'successful_projection_retry_clears_flag');
    $assert((int)$repo->findState($owner, $scope)['revision'] === 1, 'projection_retry_does_not_duplicate_revision');
    echo json_encode(['status' => 'passed', 'checks' => count($checks), 'passed' => $checks, 'separate_worker_connections' => true, 'preview_database_connected' => false], JSON_PRETTY_PRINT) . PHP_EOL;
} catch (Throwable $e) {
    if ($tx?->isActive) { $tx->rollBack(); }
    fwrite(STDERR, json_encode(['status' => 'failed', 'at' => $current, 'passed' => count($checks), 'error_type' => get_class($e), 'reason' => str_starts_with($e->getMessage(), 'Assertion failed: ') ? $e->getMessage() : 'Runtime failure; raw details suppressed']) . PHP_EOL); exit(1);
}
