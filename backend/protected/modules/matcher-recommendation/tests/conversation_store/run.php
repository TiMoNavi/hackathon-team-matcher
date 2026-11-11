<?php
declare(strict_types=1);
// Standalone: synthetic JSON, SQLite :memory: and one freshly-created temporary database only.
require dirname(__DIR__) . '/support/autoload.php';
use humhub\modules\matcherRecommendation\adapters\conversation\{ConversationSnapshotCodec, ConversationStorageException, ConversationStorageSchema as Schema, InMemoryConversationStore, PdoConversationStore};

$checks = [];
function csCheck(bool $ok, string $label): void {
    global $checks;
    if (!$ok) { throw new RuntimeException('FAIL: ' . $label); }
    $checks[] = $label;
}
function csReject(callable $operation, string $reason, string $label): void {
    try { $operation(); } catch (ConversationStorageException $error) {
        csCheck($error->reason === $reason && $error->getPrevious() === null && !str_contains($error->getMessage(), 'SYNTHETIC_PRIVATE'), $label);
        return;
    }
    csCheck(false, $label);
}
function csDb(): PDO { return new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]); }
function csSnapshot(int $version = 1): array {
    return ['version' => $version, 'turns' => [['role' => 'user', 'message' => '我负责产品，希望找愿意交付后端的队友。']],
        'candidate_refs' => ['synthetic-101', 'synthetic-102'], 'calls' => 2, 'active' => true, 'score' => 1.0, 'optional' => null,
        'request_ids' => ['synthetic-request-1' => 1], 'empty' => []];
}

$db = csDb();
$pdo = new PdoConversationStore($db);
csCheck((int)$db->query("SELECT count(*) FROM sqlite_master WHERE type='table'")->fetchColumn() === 0, 'constructing the PDO adapter does not install tables');
csReject(fn() => $pdo->load('missing', 1), 'dependency_unavailable', 'missing schema fails explicitly without fallback');
Schema::install($db);
csCheck($db->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN) === [Schema::TABLE], 'explicit installer creates only the recommendation-owned table');
csReject(fn() => Schema::install($db), 'dependency_unavailable', 'installer refuses to silently adopt an existing schema');
csCheck(str_contains(Schema::sql('mysql'), 'ENGINE=InnoDB') && str_contains(Schema::sql('mysql'), 'MEDIUMTEXT'), 'MySQL DDL uses transactional engine and bounded-compatible text capacity (syntax only)');
csReject(fn() => Schema::sql('pgsql'), 'driver_unsupported', 'unsupported schema driver is rejected');

foreach (['memory' => new InMemoryConversationStore(), 'pdo' => $pdo] as $name => $store) {
    csCheck($store->load('missing', 1) === null, $name . ' missing read is null');
    $input = csSnapshot();
    $store->create('synthetic-conversation', 1, 7, $input);
    csCheck($store->load('synthetic-conversation', 1) === $input, $name . ' JSON preserves values and integral float type');
    $input['turns'][0]['message'] = 'edited input';
    $loaded = $store->load('synthetic-conversation', 1);
    $loaded['turns'][0]['message'] = 'edited output';
    csCheck($store->load('synthetic-conversation', 1) === csSnapshot(), $name . ' input and loaded copies cannot mutate stored state');
    csCheck($store->load('synthetic-conversation', 2) === null, $name . ' wrong owner is indistinguishable from missing');
    csReject(fn() => $store->create('synthetic-conversation', 2, 8, csSnapshot()), 'duplicate_conversation', $name . ' duplicate identifier cannot replace any owner');
    csCheck(!$store->compareAndSwap('synthetic-conversation', 2, 1, csSnapshot(2)) && !$store->compareAndSwap('missing', 1, 1, csSnapshot(2)), $name . ' missing and wrong-owner CAS both return false');
    csCheck($store->compareAndSwap('synthetic-conversation', 1, 1, csSnapshot(2)), $name . ' CAS advances exactly one version');
    csCheck(!$store->compareAndSwap('synthetic-conversation', 1, 1, csSnapshot(2)), $name . ' stale expected version loses');
    csReject(fn() => $store->compareAndSwap('synthetic-conversation', 1, 2, csSnapshot(4)), 'invalid_data', $name . ' CAS cannot skip a version');
    csReject(fn() => $store->compareAndSwap('synthetic-conversation', 1, PHP_INT_MAX, csSnapshot(3)), 'invalid_data', $name . ' overflow version rejected');
    csCheck($store->load('synthetic-conversation', 1) === csSnapshot(2), $name . ' rejected mutations preserve winner');
    foreach (['', '../path', "sql';DROP", str_repeat('a', 129), '白'] as $id) {
        csReject(fn() => $store->create($id, 1, 7, csSnapshot()), 'invalid_data', $name . ' invalid opaque ID rejected');
    }
    csReject(fn() => $store->create('owner-zero', 0, 7, csSnapshot()), 'invalid_data', $name . ' nonpositive owner rejected');
    csReject(fn() => $store->create('event-zero', 1, 0, csSnapshot()), 'invalid_data', $name . ' nonpositive event rejected');
    csReject(fn() => $store->create('version-string', 1, 7, ['version' => '1']), 'invalid_data', $name . ' string version rejected');
    csReject(fn() => $store->create('version-two', 1, 7, csSnapshot(2)), 'invalid_data', $name . ' initial version must be one');
    foreach (['id' => 'another', 'owner_id' => 2, 'event_id' => 9] as $field => $value) {
        csReject(fn() => $store->create('binding-' . $field, 1, 7, csSnapshot() + [$field => $value]), 'invalid_data', $name . ' optional snapshot identity ' . $field . ' is bound');
    }
    $resource = fopen('php://memory', 'r');
    foreach ([new stdClass(), INF, NAN, $resource, "invalid-\xff"] as $value) {
        csReject(fn() => $store->create('invalid-value', 1, 7, ['version' => 1, 'value' => $value]), 'invalid_data', $name . ' non-JSON or invalid UTF8 value rejected');
    }
    fclose($resource);
    $called = false;
    $object = new class($called) implements JsonSerializable {
        public function __construct(private bool &$called) {}
        public function jsonSerialize(): mixed { $this->called = true; return 'must not execute'; }
    };
    csReject(fn() => $store->create('object-callback', 1, 7, ['version' => 1, 'value' => $object]), 'invalid_data', $name . ' JSON serialization callbacks forbidden');
    csCheck(!$called, $name . ' object callback was never invoked');
    $recursive = ['version' => 1]; $recursive['loop'] = &$recursive;
    csReject(fn() => $store->create('recursive', 1, 7, $recursive), 'invalid_data', $name . ' recursive array rejected without infinite traversal');
    unset($recursive);
    csReject(fn() => $store->create('oversize', 1, 7, ['version' => 1, 'message' => str_repeat('x', 262144)]), 'snapshot_too_large', $name . ' configured encoded byte limit enforced');
    csCheck($store->load('oversize', 1) === null, $name . ' oversized create leaves no partial record');
}

$codec = new ConversationSnapshotCodec();
$valid = $codec->encode('synthetic-codec', 1, 7, 1, csSnapshot());
foreach (['id' => 'different', 'owner_id' => 2, 'event_id' => 8, 'version' => 2, 'schema' => 2, 'snapshot' => ['version' => 2]] as $key => $value) {
    $data = json_decode($valid, true, 64, JSON_THROW_ON_ERROR); $data[$key] = $value;
    csReject(fn() => $codec->decode(json_encode($data, JSON_THROW_ON_ERROR), 'synthetic-codec', 1, 7, 1), 'corrupt_storage', 'envelope rejects mismatched ' . $key);
}
foreach (['{bad-json', 'null', '[]', 'O:8:"stdClass":0:{}', str_repeat('x', 262145)] as $raw) {
    csReject(fn() => $codec->decode($raw, 'synthetic-codec', 1, 7, 1), 'corrupt_storage', 'malformed or oversized persisted JSON rejected');
}
csReject(fn() => new InMemoryConversationStore(100), 'invalid_data', 'unreasonably small capacity configuration rejected');
csReject(fn() => new PdoConversationStore($db, 1048577), 'invalid_data', 'unbounded storage configuration rejected');
$small = new InMemoryConversationStore(1024);
$small->create('small', 1, 7, ['version' => 1, 'text' => str_repeat('x', 700)]);
csReject(fn() => $small->compareAndSwap('small', 1, 1, ['version' => 2, 'text' => str_repeat('x', 1024)]), 'snapshot_too_large', 'oversized CAS rejects before mutation');
csCheck($small->load('small', 1)['version'] === 1, 'oversized CAS leaves the old version intact');

foreach (['owner_id' => 2, 'event_id' => 8, 'version' => 2, 'snapshot_json' => '{broken'] as $column => $bad) {
    $fresh = csDb(); Schema::install($fresh); $store = new PdoConversationStore($fresh);
    $store->create('corrupt-row', 1, 7, csSnapshot());
    $query = $fresh->prepare('UPDATE ' . Schema::TABLE . ' SET ' . $column . ' = :bad'); $query->execute([':bad' => $bad]);
    $owner = $column === 'owner_id' ? 2 : 1;
    csReject(fn() => $store->load('corrupt-row', $owner), 'corrupt_storage', 'PDO read rejects row/envelope drift in ' . $column);
    csReject(fn() => $store->compareAndSwap('corrupt-row', $owner, 1, csSnapshot(2)), 'corrupt_storage', 'CAS refuses to overwrite corrupt ' . $column);
}

$db->exec("CREATE TRIGGER synthetic_fail_conversation BEFORE UPDATE ON " . Schema::TABLE . " BEGIN SELECT RAISE(ABORT, 'SYNTHETIC_PRIVATE_DATABASE_TEXT'); END");
csReject(fn() => $pdo->compareAndSwap('synthetic-conversation', 1, 2, csSnapshot(3)), 'dependency_unavailable', 'database failure exposes only safe storage reason');
csCheck($pdo->load('synthetic-conversation', 1) === csSnapshot(2), 'failed SQL statement leaves complete old record');
$db->exec('DROP TRIGGER synthetic_fail_conversation');
$db->beginTransaction();
foreach ([fn() => $pdo->load('synthetic-conversation', 1), fn() => $pdo->create('foreign-transaction', 1, 7, csSnapshot()), fn() => $pdo->compareAndSwap('synthetic-conversation', 1, 2, csSnapshot(3)), fn() => Schema::install($db)] as $operation) {
    csReject($operation, 'transaction_unsupported', 'externally owned transaction rejected');
}
csCheck($db->inTransaction(), 'store does not commit or roll back caller transaction');
$db->rollBack();
$warningDb = csDb(); $warningDb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_WARNING);
csReject(fn() => new PdoConversationStore($warningDb), 'invalid_data', 'warning-mode PDO rejected before SQL can leak errors');
csReject(fn() => Schema::install($warningDb), 'invalid_data', 'installer also rejects warning-mode PDO');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_WARNING);
csReject(fn() => $pdo->load('synthetic-conversation', 1), 'invalid_data', 'changing PDO error mode after construction still fails before SQL');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$temporary = tempnam(sys_get_temp_dir(), 'matcher-conversation-');
if ($temporary === false) { throw new RuntimeException('Cannot create isolated temporary database.'); }
try {
    $connectionA = new PDO('sqlite:' . $temporary); Schema::install($connectionA);
    $connectionB = new PDO('sqlite:' . $temporary);
    $a = new PdoConversationStore($connectionA); $b = new PdoConversationStore($connectionB);
    $a->create('persistent', 1, 7, csSnapshot());
    $readA = $a->load('persistent', 1); $readB = $b->load('persistent', 1);
    csCheck($readA === $readB && $readB === csSnapshot(), 'independent PDO connections recover the exact committed snapshot');
    csCheck($b->compareAndSwap('persistent', 1, $readB['version'], csSnapshot(2)), 'first competing writer wins');
    csCheck(!$a->compareAndSwap('persistent', 1, $readA['version'], csSnapshot(2)), 'stale competing connection cannot overwrite the winner');
    $a->create('race', 1, 7, ['version' => 1]);
    $workers = [];
    foreach (['A', 'B'] as $label) {
        $worker = proc_open([PHP_BINARY, '-n', '-d', 'allow_url_fopen=0', '-d', 'disable_functions=fsockopen,pfsockopen,stream_socket_client,curl_exec,curl_multi_exec', __DIR__ . '/race.php', $temporary, $label], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $workerPipes);
        if (!is_resource($worker)) { throw new RuntimeException('Cannot start synthetic CAS worker.'); }
        $workers[] = ['process' => $worker, 'pipes' => $workerPipes];
    }
    foreach ($workers as $worker) {
        csCheck(trim((string)fgets($worker['pipes'][1])) === 'ready:1', 'concurrent worker observes same initial version before release');
    }
    foreach ($workers as $worker) { fwrite($worker['pipes'][0], "go\n"); fclose($worker['pipes'][0]); }
    $won = [];
    foreach ($workers as $worker) {
        $result = stream_get_contents($worker['pipes'][1]); fclose($worker['pipes'][1]);
        $workerErrors = stream_get_contents($worker['pipes'][2]); fclose($worker['pipes'][2]);
        csCheck(proc_close($worker['process']) === 0 && $workerErrors === '', 'concurrent CAS worker completes without unhandled storage errors');
        $won[] = json_decode($result, true, 16, JSON_THROW_ON_ERROR);
    }
    csCheck(count(array_filter($won, static fn(array $result): bool => $result['won'])) === 1, 'simultaneous independent processes produce exactly one CAS winner');
    $winner = array_values(array_filter($won, static fn(array $result): bool => $result['won']))[0]['writer'];
    csCheck($a->load('race', 1) === ['version' => 2, 'writer' => $winner], 'concurrent loser leaves winning snapshot and version intact');
    unset($a, $b, $connectionA, $connectionB);
    $process = proc_open([PHP_BINARY, '-n', '-d', 'allow_url_fopen=0', '-d', 'disable_functions=fsockopen,pfsockopen,stream_socket_client,curl_exec,curl_multi_exec', __DIR__ . '/restore.php', $temporary], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($process)) { throw new RuntimeException('Cannot start isolated restore process.'); }
    fclose($pipes[0]); $output = stream_get_contents($pipes[1]); fclose($pipes[1]); $errors = stream_get_contents($pipes[2]); fclose($pipes[2]);
    $exit = proc_close($process);
    csCheck($exit === 0 && trim($output) === '{"version":2,"owner_isolated":true,"calls":2}' && $errors === '', 'fresh PHP process recovers conversation and enforces owner isolation');
} finally {
    unset($a, $b, $connectionA, $connectionB);
    if (is_file($temporary)) { unlink($temporary); }
}

echo json_encode(['suite' => 'conversation_store', 'status' => 'passed', 'checks' => count($checks), 'labels' => $checks, 'mysql' => 'DDL reviewed only; not executed', 'network_calls' => 0], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), PHP_EOL;
