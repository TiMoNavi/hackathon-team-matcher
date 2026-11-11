<?php
declare(strict_types=1);
/** CLI: run.php isolated-db viewer-id space-id baseline|final [repetitions] [scenario-json] */
use humhub\modules\matcherRecommendation\adapters\native\{NativeCurrentEventAccess, ServerSelectionSource};
use humhub\modules\matcherRecommendation\adapters\browse\{NativeOrdinaryDiscoverySource, HmacOrdinaryCursorCodec};
use humhub\modules\matcherRecommendation\adapters\time\SystemClock;
use humhub\modules\matcherRecommendation\application\BrowsePeople;
use humhub\modules\matcherRecommendation\domain\browse\OrdinaryDiscoveryQuery;
use S73Performance\{QueryProbe, ProbeCommand};

try {
    $target = $argv[1] ?? '';
    if ($target !== 'humhub_profile_s73_test_root_4a70f3d1') { throw new RuntimeException('Only the allocated S73 root clone is permitted.'); }
    $viewerId = filter_var($argv[2] ?? '', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    $spaceId = filter_var($argv[3] ?? '', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    $stage = $argv[4] ?? ''; $repetitions = (int)($argv[5] ?? 3);
    if (!$viewerId || !$spaceId || !in_array($stage, ['baseline', 'final'], true) || $repetitions < 1 || $repetitions > 10) { throw new RuntimeException('Invalid fixture benchmark arguments.'); }
    putenv('MATCHER_S73_TEST_DB=' . $target);
    $app = require dirname(__DIR__, 3) . '/matcher-onboarding/tests/integration/s73_http_bootstrap.php';
    require __DIR__ . '/QueryProbe.php';
    $db = $app->db; $db->enableLogging = false; $db->enableProfiling = false; $db->commandClass = ProbeCommand::class;
    $serverVersion = (string)$db->createCommand('SELECT VERSION()')->queryScalar();
    $selection = new class($viewerId, $spaceId) implements ServerSelectionSource {
        public function __construct(private readonly int $viewerId, private readonly int $spaceId) {}
        public function read(): array { return ['actor_id' => $this->viewerId, 'space_id' => $this->spaceId, 'selection_revision' => 's73-performance-fixture']; }
    };
    $events = new NativeCurrentEventAccess($db, $selection, 'ordinary-activity-access-v1');
    $profile = $app->getModule('matcher-user-profile'); $privacy = $app->getModule('matcher-profile-privacy');
    $batchMetrics = [];
    $profiles = $privacy->getDiscoveryBatchService()->read(...); $identities = $profile->getConfirmedIdentityBatchReader()->read(...);
    $source = new NativeOrdinaryDiscoverySource($db, $events,
        static function(int $viewer, int $space, array $ids, array $keys) use ($profiles, &$batchMetrics): array {
            $start = hrtime(true); $result = $profiles($viewer, $space, $ids, $keys);
            $batchMetrics['p8_profiles'][] = ['requested_owners' => count($ids), 'returned_profiles' => count($result['profiles']), 'elapsed_ms' => round((hrtime(true) - $start) / 1e6, 3)];
            return $result;
        },
        static function(array $ids) use ($identities, &$batchMetrics): array {
            $start = hrtime(true); $result = $identities($ids);
            $batchMetrics['p1_identities'][] = ['requested_owners' => count($ids), 'returned_identities' => count($result), 'elapsed_ms' => round((hrtime(true) - $start) / 1e6, 3)];
            return $result;
        });
    $browse = new BrowsePeople($events, $source, new HmacOrdinaryCursorCodec(str_repeat('s73-performance-fixture-only-', 3)), new SystemClock());
    $scenarios = [['name' => 'recent_first', 'sort' => 'recent', 'limit' => 24], ['name' => 'relevance_first', 'sort' => 'relevance', 'limit' => 24],
        ['name' => 'recent_max48', 'sort' => 'recent', 'limit' => 48], ['name' => 'empty_filter', 'filters' => ['skill' => ['s73-unmatchable-performance-probe']]]];
    if (isset($argv[6])) {
        $scenarios = json_decode(file_get_contents($argv[6]), true, 64, JSON_THROW_ON_ERROR);
        if (!is_array($scenarios) || !array_is_list($scenarios) || count($scenarios) > 30) { throw new RuntimeException('Scenario list invalid.'); }
    }
    $probe = new QueryProbe(); $out = [];
    foreach ($scenarios as $scenario) {
        $name = $scenario['name'] ?? '';
        if (!is_string($name) || !preg_match('/^[a-z0-9_]{1,64}$/D', $name)) { throw new RuntimeException('Scenario needs a safe identifier.'); }
        $query = new OrdinaryDiscoveryQuery($scenario['filters'] ?? [], $scenario['sort'] ?? 'recent', $scenario['limit'] ?? 24);
        $samples = []; $expected = null;
        for ($i = 0; $i < $repetitions; $i++) {
            $batchMetrics = []; $before = QueryProbe::handlers($db); $probe->begin(); $start = hrtime(true);
            $page = $browse->page($viewerId, $spaceId, $query); $wall = (hrtime(true) - $start) / 1e6; $measurement = $probe->end();
            $handlers = QueryProbe::delta($before, QueryProbe::handlers($db));
            $ids = array_column($page['items'], 'owner_id'); $digest = hash('sha256', json_encode($ids, JSON_THROW_ON_ERROR)); $expected ??= $digest;
            if ($digest !== $expected) { throw new RuntimeException('Benchmark fixture changed between repetitions.'); }
            $samples[] = $measurement + ['use_case_elapsed_ms' => round($wall, 3), 'non_query_elapsed_ms' => round($wall - $measurement['query_elapsed_ms'], 3),
                'batch_calls' => $batchMetrics, 'session_handler_read_delta' => $handlers, 'items' => count($ids), 'has_more' => $page['has_more'], 'owner_id_order_sha256' => $digest];
        }
        $times = array_column($samples, 'use_case_elapsed_ms'); sort($times, SORT_NUMERIC);
        $out[$name] = ['repetitions' => $repetitions, 'median_use_case_ms' => $times[intdiv(count($times), 2)], 'samples' => $samples];
    }
    $paths = [
        'ordinary_source' => dirname(__DIR__, 2) . '/adapters/browse/NativeOrdinaryDiscoverySource.php',
        'browse_use_case' => dirname(__DIR__, 2) . '/application/BrowsePeople.php',
        'p1_field_catalog' => dirname(__DIR__, 3) . '/matcher-user-profile/domain/FieldCatalog.php',
        'p1_profile_batch' => dirname(__DIR__, 3) . '/matcher-user-profile/adapters/persistence/SqlDiscoveryProfileBatchSource.php',
        'p8_batch' => dirname(__DIR__, 3) . '/matcher-profile-privacy/application/DiscoveryBatchService.php',
    ];
    $hashes = array_map(static fn(string $path): string => hash_file('sha256', $path), $paths);
    $result = ['status' => 'passed', 'stage' => $stage, 'date_utc' => gmdate('c'), 'database' => $target, 'server_version' => $serverVersion,
        'scope' => 'ordinary discovery BrowsePeople with real native current-event gates, P1/P8 and MySQL; fixed server-selection fixture excludes HTTP/session selection SQL and response serialization',
        'measurement_notes' => ['client query time includes PDO execute/fetch and Yii command overhead', 'returned_rows counts fetchAll results including repeated authorization reads; not scanned rows',
            'session Handler_read counters measure engine operations and are not exact rows examined', 'EXPLAIN rows are optimizer estimates, not ANALYZE actual rows',
            'no SQL text, bound parameters, profile values, credentials or exception messages are exported', 'recommendation candidate indexes are outside this ordinary browse path'],
        'source_sha256' => $hashes, 'scenarios' => $out, 'explain_estimated' => $probe->plans($db),
        'index_comparison' => $probe->attributeIndexComparison($db), 'model_calls' => 0, 'network_calls' => 0, 'writes_during_measured_read' => 0];
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    if (class_exists(QueryProbe::class, false)) { QueryProbe::$active = null; }
    fwrite(STDERR, json_encode(['status' => 'failed', 'error_type' => get_class($error), 'code' => $error->getCode()], JSON_THROW_ON_ERROR) . PHP_EOL); exit(1);
}
