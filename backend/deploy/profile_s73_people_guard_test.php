<?php
/** Guard checks are offline: never bootstrap Yii, connect a database or call HTTP. */
declare(strict_types=1);
require_once __DIR__ . '/profile_s73_people.php';
$checks = 0;
function s73GuardCheck(bool $condition, string $label): void
{
    global $checks;
    if (!$condition) { throw new RuntimeException('Guard failed: ' . $label); }
    ++$checks;
}
function s73GuardReject(callable $call, string $label): void
{
    try { $call(); } catch (RuntimeException) { s73GuardCheck(true, $label); return; }
    throw new RuntimeException('Expected rejection: ' . $label);
}
$previous = getenv('MATCHER_S73_TEST_DB');
try {
    $root = 'humhub_profile_s73_test_root_4a70f3d1';
    $audit = 'humhub_profile_s73_test_audit_b7a2c940';
    $valid = ['tool', 'seed', '--target=' . $root, '--viewer-id=1', '--prefix=s73_sim_'];
    foreach ([$root, $audit] as $target) {
        putenv('MATCHER_S73_TEST_DB=' . $target);
        $options = s73PeopleOptions(['tool', 'inspect', '--target=' . $target, '--viewer-id=1', '--prefix=s73_sim_']);
        s73GuardCheck($options['target'] === $target && $options['viewer-id'] === 1, 'exact assigned target');
    }
    putenv('MATCHER_S73_TEST_DB=' . $root);
    foreach (['humhub_preview', 'humhub_profile_s73_test_root_4a70f3d1_extra', 'humhub_profile_s73_test_other', 'humhub_profile_s7_test_root', 'production', '', '../humhub_preview'] as $target) {
        s73GuardReject(fn() => s73PeopleOptions(['tool', 'seed', '--target=' . $target, '--viewer-id=1', '--prefix=s73_sim_']), 'unassigned target');
        s73GuardReject(fn() => s73PeopleTargetDsn('mysql:host=localhost;dbname=humhub_preview', $target), 'unassigned target before DSN');
    }
    foreach ([['tool'], ['tool', 'reset', '--target=' . $root, '--viewer-id=1', '--prefix=s73_sim_'],
              ['tool', 'seed', '--viewer-id=1', '--prefix=s73_sim_'], ['tool', 'seed', '--target=' . $root, '--prefix=s73_sim_'],
              ['tool', 'seed', '--target=' . $root, '--viewer-id=0', '--prefix=s73_sim_'],
              ['tool', 'seed', '--target=' . $root, '--viewer-id=1'],
              ['tool', 'seed', '--target=' . $root, '--viewer-id=1', '--prefix=s7_sim_'],
              [...$valid, '--target=' . $root], [...$valid, '--prefix=s73_sim_'], [...$valid, '--password=bad'],
              [...$valid, '--confirm-preview=seed-synthetic-400']] as $argv) {
        s73GuardReject(fn() => s73PeopleOptions($argv), 'invalid argument set');
    }
    putenv('MATCHER_S73_TEST_DB');
    s73GuardReject(fn() => s73PeopleOptions($valid), 'unset target environment');
    putenv('MATCHER_S73_TEST_DB=' . $audit);
    s73GuardReject(fn() => s73PeopleOptions($valid), 'different assigned target environment');
    putenv('MATCHER_S73_TEST_DB=humhub_preview');
    s73GuardReject(fn() => s73PeopleOptions($valid), 'main target environment');
    putenv('MATCHER_S73_TEST_DB=' . $root);
    s73GuardCheck(s73PeopleTargetDsn('mysql:host=127.0.0.1;port=3306;dbname=humhub_preview;charset=utf8mb4', $root) === 'mysql:host=127.0.0.1;port=3306;dbname=' . $root . ';charset=utf8mb4', 'replace database exactly once');
    s73GuardCheck(s73PeopleTargetDsn('mysql:unix_socket=/tmp/s73-mysql.sock;dbname=humhub_preview', $audit) === 'mysql:unix_socket=/tmp/s73-mysql.sock;dbname=' . $audit, 'local socket target');
    foreach (['pgsql:host=127.0.0.1;dbname=humhub_preview', 'mysql:host=db.example.org;dbname=humhub_preview',
              'mysql:dbname=humhub_preview', 'mysql:host=127.0.0.1;dbname=humhub_preview;dbname=production',
              'mysql:host=localhost;unix_socket=/tmp/m.sock;dbname=humhub_preview', 'mysql:unix_socket=relative.sock;dbname=humhub_preview',
              'mysql:host=localhost;dbname=humhub_preview;unknown=1', 'mysql:host=localhost;dbname=humhub_preview;port=0',
              'mysql:host=localhost;dbname=humhub_preview;port=65536'] as $dsn) {
        s73GuardReject(fn() => s73PeopleTargetDsn($dsn, $root), 'remote ambiguous or invalid DSN');
    }
    [$data] = s73PeopleReadDataset(dirname(__DIR__, 2) . '/docs/用户画像收集/examples/s73-people_2026-11-12.json');
    $journal = ['spaces' => [], 'people' => ['s73_sim_001' => ['number' => 1, 'guid' => s73PeopleGuid(), 'status' => 'reserved', 'discovery' => []]]];
    s73PeopleValidateJournalRecords($journal, $data); s73GuardCheck(true, 'valid owned reserved identity');
    $extra = $journal; $extra['people']['s73_sim_401'] = ['number' => 401, 'guid' => s73PeopleGuid(), 'status' => 'reserved', 'discovery' => []];
    s73GuardReject(fn() => s73PeopleValidateJournalRecords($extra, $data), 'extra identity');
    $old = $journal; $old['people']['s7_sim_001'] = $old['people']['s73_sim_001'];
    s73GuardReject(fn() => s73PeopleValidateJournalRecords($old, $data), 'original dataset identity');
    $duplicate = $journal; $duplicate['people']['s73_sim_002'] = $duplicate['people']['s73_sim_001']; $duplicate['people']['s73_sim_002']['number'] = 2;
    s73GuardReject(fn() => s73PeopleValidateJournalRecords($duplicate, $data), 'duplicate GUID ownership');
    $crossSpace = $journal; $crossSpace['people']['s73_sim_001']['discovery']['secondary'] = ['status' => 'complete'];
    s73GuardReject(fn() => s73PeopleValidateJournalRecords($crossSpace, $data), 'unrelated Space');
    $renumbered = $journal; $renumbered['people']['s73_sim_001']['number'] = 400;
    s73GuardReject(fn() => s73PeopleValidateJournalRecords($renumbered, $data), 'identity sequence mismatch');
    echo json_encode(['status' => 'passed', 'checks' => $checks, 'database_connections' => 0, 'network_requests' => 0, 'llm_calls' => 0]), PHP_EOL;
} catch (Throwable $error) { fwrite(STDERR, json_encode(['status' => 'failed', 'reason' => $error->getMessage()]) . PHP_EOL); exit(1); }
finally { putenv($previous === false ? 'MATCHER_S73_TEST_DB' : 'MATCHER_S73_TEST_DB=' . $previous); }
