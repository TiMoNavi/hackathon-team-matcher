<?php
/** Pure offline guard tests. Never bootstrap HumHub, inspect credentials, or connect to a database. */
declare(strict_types=1);
require __DIR__ . '/profile_s7_people.php';
$checks = 0;
function s7GuardCheck(bool $condition, string $label): void { global $checks; ++$checks; s7PeopleAssert($condition, $label); }
function s7GuardReject(callable $operation, string $label): void {
    global $checks; ++$checks;
    try { $operation(); } catch (RuntimeException) { return; }
    throw new RuntimeException('Guard did not reject: ' . $label);
}
try {
    $valid = ['tool', 'seed', '--target=humhub_profile_s7_test_unit', '--viewer-id=1'];
    s7GuardCheck(s7PeopleOptions($valid)['target'] === 'humhub_profile_s7_test_unit', 'explicit clone');
    foreach (['production', 'humhub_profile_s6_test_x', 'humhub_profile_s7_test_', 'humhub_profile_s7_test_x;dbname=production', 'HUMHUB_PROFILE_S7_TEST_X', '../humhub_preview'] as $target) {
        s7GuardReject(fn() => s7PeopleOptions(['tool', 'seed', '--target=' . $target, '--viewer-id=1']), 'invalid database target');
    }
    foreach ([['tool'], ['tool', 'reset', '--target=humhub_preview', '--viewer-id=1'], ['tool', 'seed', '--viewer-id=1'], ['tool', 'inspect', '--target=humhub_preview'], ['tool', 'inspect', '--target=humhub_preview', '--viewer-id=0'], [...$valid, '--target=humhub_preview'], [...$valid, '--password=bad'], ['tool', 'seed', '--target=humhub_preview', '--viewer-id=1']] as $argv) {
        s7GuardReject(fn() => s7PeopleOptions($argv), 'invalid argument set');
    }
    s7GuardCheck(s7PeopleTargetDsn('mysql:host=127.0.0.1;port=3306;dbname=humhub_preview;charset=utf8mb4', 'humhub_profile_s7_test_unit') === 'mysql:host=127.0.0.1;port=3306;dbname=humhub_profile_s7_test_unit;charset=utf8mb4', 'replace explicit local database once');
    s7GuardCheck(s7PeopleTargetDsn('mysql:unix_socket=/tmp/s7-mysql.sock;dbname=humhub_preview', 'humhub_preview') === 'mysql:unix_socket=/tmp/s7-mysql.sock;dbname=humhub_preview', 'local socket accepted');
    foreach (['pgsql:host=127.0.0.1;dbname=humhub_preview', 'mysql:host=db.example.org;dbname=humhub_preview', 'mysql:dbname=humhub_preview', 'mysql:host=127.0.0.1;dbname=humhub_preview;dbname=production', 'mysql:host=localhost;unix_socket=/tmp/m.sock;dbname=humhub_preview', 'mysql:unix_socket=relative.sock;dbname=humhub_preview', 'mysql:host=localhost;dbname=production'] as $dsn) {
        s7GuardReject(fn() => s7PeopleTargetDsn($dsn, 'humhub_preview'), 'remote/ambiguous/incorrect source DSN');
    }
    s7GuardReject(fn() => s7PeopleVerifyBackup('/does-not-exist', ['action' => 'seed', 'target' => 'humhub_preview', 'backup-marker' => '/does-not-exist/manifest.json']), 'missing backup');
    [$data] = s7PeopleReadDataset(dirname(__DIR__, 2) . '/docs/用户画像收集/examples/s7-people_2026-11-12.json');
    $journal = ['spaces' => [], 'people' => ['s7_sim_001' => ['number' => 1, 'guid' => s7PeopleGuid(), 'status' => 'reserved', 'discovery' => []]]];
    s7PeopleValidateJournalRecords($journal, $data); s7GuardCheck(true, 'valid reserved identity can resume');
    $unrelated = $journal; $unrelated['people']['s7_sim_999'] = ['number' => 999, 'guid' => s7PeopleGuid(), 'status' => 'reserved', 'discovery' => []];
    s7GuardReject(fn() => s7PeopleValidateJournalRecords($unrelated, $data), 'extra account in journal');
    $duplicate = $journal; $duplicate['people']['s7_sim_002'] = $duplicate['people']['s7_sim_001']; $duplicate['people']['s7_sim_002']['number'] = 2;
    s7GuardReject(fn() => s7PeopleValidateJournalRecords($duplicate, $data), 'duplicate ownership GUID');
    $crossSpace = $journal; $crossSpace['people']['s7_sim_001']['discovery']['secondary'] = ['status' => 'complete'];
    s7GuardReject(fn() => s7PeopleValidateJournalRecords($crossSpace, $data), 'unrelated Space context');
    $renumbered = $journal; $renumbered['people']['s7_sim_001']['number'] = 100;
    s7GuardReject(fn() => s7PeopleValidateJournalRecords($renumbered, $data), 'identity sequence mismatch');
    $root = sys_get_temp_dir() . '/profile-s7-guard-' . bin2hex(random_bytes(5));
    $backup = $root . '/.runtime/backups/verified'; mkdir($backup, 0700, true);
    file_put_contents($backup . '/database.sql', '-- synthetic offline guard fixture');
    file_put_contents($backup . '/manifest.json', json_encode(['target' => 'humhub_preview', 'sha256' => hash_file('sha256', $backup . '/database.sql'), 'created_at_utc' => '2026-11-12T00:00:00Z']));
    file_put_contents($root . '/.runtime/profile-s7-backup-path', $backup);
    $options = ['action' => 'seed', 'target' => 'humhub_preview', 'backup-marker' => $backup . '/manifest.json'];
    s7GuardCheck(s7PeopleVerifyBackup($root, $options), 'verified local checksum');
    file_put_contents($backup . '/database.sql', 'tampered synthetic fixture');
    s7GuardReject(fn() => s7PeopleVerifyBackup($root, $options), 'backup checksum mismatch');
    file_put_contents($root . '/.runtime/profile-s7-backup-path', $root . '/elsewhere');
    s7GuardReject(fn() => s7PeopleVerifyBackup($root, $options), 'root marker mismatch');
    foreach (['database.sql', 'manifest.json'] as $name) { unlink($backup . '/' . $name); }
    unlink($root . '/.runtime/profile-s7-backup-path'); rmdir($backup); rmdir(dirname($backup)); rmdir($root . '/.runtime'); rmdir($root);
    echo json_encode(['status' => 'passed', 'checks' => $checks, 'database_connections' => 0, 'network_requests' => 0, 'llm_calls' => 0]), PHP_EOL;
} catch (Throwable $error) { fwrite(STDERR, json_encode(['status' => 'failed', 'reason' => $error->getMessage()]) . PHP_EOL); exit(1); }
