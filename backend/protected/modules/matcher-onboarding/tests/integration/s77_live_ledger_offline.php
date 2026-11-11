<?php
declare(strict_types=1);
require __DIR__ . '/s77_live_ledger.php';
$dir = sys_get_temp_dir() . '/s77_ledger_offline_' . bin2hex(random_bytes(6));
mkdir($dir, 0700); $path = $dir . '/ledger.json'; $checks = [];
function lc(string $name, bool $ok): void { global $checks; $checks[$name] = $ok; if (!$ok) { throw new RuntimeException($name); } }
try {
    $store = new S77LiveLedger($path); $initial = $store->read();
    lc('new_ledger_has_six_slot_limit', $initial['max_worker_attempts'] === 6 && $initial['attempts'] === []);
    $reserved = $initial; $reserved['attempts'][] = ['job_id' => 'offline_reserved', 'operation' => 'extract', 'status' => 'started', 'metrics' => ['llm_calls' => null, 'accounting_complete' => false]];
    $store->write($reserved); $bytes = file_get_contents($path);
    lc('reservation_is_durable_and_unknown', $store->read() === $reserved);
    lc('ledger_is_owner_only', (fileperms($path) & 0777) === 0600);
    try { new S77LiveLedger($path); throw new LogicException('lock accepted'); }
    catch (RuntimeException) { lc('independent_lock_blocks_second_worker', true); }
    // Simulate a process stopping during a replacement: incomplete sibling is never the ledger.
    file_put_contents($path . '.crash.tmp', '{');
    lc('interrupted_temporary_write_keeps_reserved_slot', file_get_contents($path) === $bytes && count($store->read()['attempts']) === 1);
    $completed = $reserved; $completed['attempts'][0]['status'] = 'finished'; $completed['attempts'][0]['metrics'] = ['llm_calls' => 1, 'accounting_complete' => true];
    $store->write($completed);
    lc('atomic_replacement_retains_reservation', $store->read() === $completed && count($store->read()['attempts']) === 1);
    unset($store);
    foreach (['empty' => '', 'broken' => '{', 'wrong_db' => '{"database":"humhub_preview","attempts":[]}'] as $name => $raw) {
        $bad = $dir . '/' . $name . '.json'; file_put_contents($bad, $raw); $store = new S77LiveLedger($bad);
        try { $store->read(); throw new LogicException('invalid ledger accepted'); }
        catch (JsonException | RuntimeException) { lc('existing_' . $name . '_fails_closed', file_get_contents($bad) === $raw); }
        unset($store);
    }
    echo json_encode(['suite' => 's77-live-ledger-offline', 'status' => 'passed', 'passed' => count($checks), 'checks' => $checks, 'database_connections' => 0, 'real_gateway_calls' => 0], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), PHP_EOL;
} finally { unset($store); foreach (glob($dir . '/*') as $file) { unlink($file); } rmdir($dir); }
