<?php
declare(strict_types=1);
namespace S73Performance;

use yii\db\Connection;

/** Test-only instrumentation. Never serializes SQL, parameters, rows or exception messages. */
final class QueryProbe
{
    public static ?self $active = null;
    private array $groups = [];
    private array $samples = [];

    public function begin(): void { $this->groups = []; self::$active = $this; }
    public function end(): array
    {
        self::$active = null; ksort($this->groups);
        return ['query_count' => array_sum(array_column($this->groups, 'count')),
            'query_elapsed_ms' => round(array_sum(array_column($this->groups, 'elapsed_ms')), 3),
            'returned_rows' => array_sum(array_column($this->groups, 'returned_rows')), 'groups' => $this->groups];
    }
    public function record(string $sql, array $params, float $elapsed, mixed $result, string $method, bool $failed): void
    {
        $class = self::classify($sql);
        $group = $this->groups[$class] ?? ['count' => 0, 'elapsed_ms' => 0.0, 'returned_rows' => 0, 'failures' => 0];
        $group['count']++; $group['elapsed_ms'] += $elapsed; $group['failures'] += $failed ? 1 : 0;
        if (!$failed && $method === 'fetchAll' && is_array($result)) { $group['returned_rows'] += count($result); }
        $this->groups[$class] = $group;
        if (!$failed && str_starts_with(ltrim(strtoupper($sql)), 'SELECT') && !isset($this->samples[$class])) {
            // Bound values stay only in process memory until EXPLAIN. They are never returned or logged.
            $this->samples[$class] = [$sql, $params];
        }
    }
    public static function classify(string $sql): string
    {
        $sql = strtolower($sql);
        if (str_contains($sql, 'matcher_profile_draft')) { return 'p1_confirmed_identity'; }
        if (str_contains($sql, 'matcher_profile_attribute')) { return 'p1_profile_attributes'; }
        if (str_contains($sql, 'matcher_profile_state')) { return 'p1_profile_state'; }
        if (str_contains($sql, 'matcher_recommendation_discovery_settings')) { return 'ordinary_candidate_eligibility'; }
        if (str_contains($sql, ':privacyspace')) { return str_contains($sql, 'distinct') ? 'p8_owner_eligibility' : 'p8_viewer_eligibility'; }
        if (str_contains($sql, ':nativespaceid')) { return 'native_current_event_gate'; }
        if (str_contains($sql, 'matcher_recommendation_current_event')) { return 'current_event_selection'; }
        if (str_starts_with(ltrim($sql), 'show') || str_contains($sql, 'information_schema')) { return 'schema_metadata'; }
        return 'other';
    }
    public static function handlers(Connection $db): array
    {
        $keys = ['Handler_read_first', 'Handler_read_key', 'Handler_read_last', 'Handler_read_next', 'Handler_read_prev', 'Handler_read_rnd', 'Handler_read_rnd_next'];
        $out = [];
        foreach ($db->createCommand('SHOW SESSION STATUS WHERE Variable_name IN (\'' . implode('\',\'', $keys) . '\')')->queryAll() as $row) { $out[$row['Variable_name']] = (int)$row['Value']; }
        return $out;
    }
    public static function delta(array $before, array $after): array
    { $out = []; foreach ($after as $key => $value) { $out[$key] = $value - ($before[$key] ?? 0); } return $out; }

    /** EXPLAIN estimates are labelled separately from executed client timings and handler counters. */
    public function plans(Connection $db): array
    {
        self::$active = null; $out = [];
        foreach ($this->samples as $class => [$sql, $params]) {
            try {
                $rows = $db->createCommand('EXPLAIN FORMAT=TRADITIONAL ' . $sql, $params)->queryAll();
                $plan = [];
                foreach ($rows as $row) {
                    $clean = array_intersect_key($row, array_flip(['id', 'select_type', 'table', 'type', 'possible_keys', 'key', 'key_len', 'rows', 'filtered', 'Extra']));
                    if (isset($clean['rows'])) { $clean['estimated_rows'] = (int)$clean['rows']; unset($clean['rows']); }
                    $plan[] = $clean;
                }
                $out[$class] = ['measurement' => 'EXPLAIN optimizer estimates; not measured rows examined', 'plan' => $plan];
            } catch (\Throwable $error) { $out[$class] = ['available' => false, 'error_type' => get_class($error)]; }
        }
        return $out;
    }

    /** Numeric-only actual iterator metrics; raw TREE output can contain bound values and is discarded. */
    private function actualPlan(Connection $db, string $sql, array $params): array
    {
        try {
            $tree = (string)$db->createCommand('EXPLAIN ANALYZE ' . $sql, $params)->queryScalar();
            $number = '[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?';
            $aliases = []; $quote = chr(96);
            preg_match_all('/(?:FROM|JOIN) ' . $quote . '([a-zA-Z0-9_]+)' . $quote . ' ' . $quote . '([a-zA-Z0-9_]+)' . $quote . '/', $sql, $tableMatches, PREG_SET_ORDER);
            foreach ($tableMatches as $match) { $aliases[$match[2]] = $match[1]; }
            $nodes = [];
            foreach (explode("\n", $tree) as $line) {
                if (!preg_match('/actual time=(' . $number . ')\.\.(' . $number . ') rows=(' . $number . ') loops=(' . $number . ')/', $line, $match)) { continue; }
                $operation = 'other';
                foreach (['Nested loop inner join' => 'nested_loop_inner_join', 'Nested loop left join' => 'nested_loop_left_join', 'Inner hash join' => 'inner_hash_join',
                    'Left hash join' => 'left_hash_join', 'Table scan' => 'table_scan', 'Index range scan' => 'index_range_scan', 'Index scan' => 'index_scan',
                    'Single-row index lookup' => 'single_row_index_lookup', 'Index lookup' => 'index_lookup', 'Filter:' => 'filter', 'Sort:' => 'sort',
                    'Materialize' => 'materialize', 'Stream results' => 'stream_results'] as $prefix => $label) {
                    if (str_starts_with(ltrim($line, ' ->'), $prefix)) { $operation = $label; break; }
                }
                $node = ['node' => count($nodes), 'operation' => $operation, 'first_row_ms' => (float)$match[1], 'completion_ms' => (float)$match[2], 'rows_per_loop' => (float)$match[3], 'loops' => (float)$match[4]];
                if (preg_match('/(?:scan|lookup) on ([a-zA-Z][a-zA-Z0-9_]*)/', $line, $relation) && isset($aliases[$relation[1]])) { $node['table'] = $aliases[$relation[1]]; $node['alias'] = $relation[1]; }
                $nodes[] = $node;
            }
            return ['available' => $nodes !== [], 'measurement' => 'EXPLAIN ANALYZE actual iterator rows/times; not exact rows_examined; node order follows the execution tree', 'nodes' => $nodes];
        } catch (\Throwable $error) { return ['available' => false, 'error_type' => get_class($error), 'measurement' => 'EXPLAIN ANALYZE unavailable; no actual iterator rows claimed']; }
    }

    /** Same SELECT and parameters, only an optimizer hint changes; no index DDL is executed. */
    public function attributeIndexComparison(Connection $db, int $repetitions = 3): array
    {
        self::$active = null; $sample = $this->samples['p1_profile_attributes'] ?? null;
        if ($sample === null) { return ['available' => false, 'reason' => 'No ordinary profile attribute SELECT was observed.']; }
        [$sql, $params] = $sample;
        $table = $db->tablePrefix . 'matcher_profile_attribute';
        $indexRows = $db->createCommand('SHOW INDEX FROM ' . $db->quoteTableName($table))->queryAll();
        $indexes = []; foreach ($indexRows as $row) { $indexes[$row['Key_name']][(int)$row['Seq_in_index']] = $row['Column_name']; }
        foreach ($indexes as &$columns) { ksort($columns); $columns = array_values($columns); } unset($columns);
        $leadingState = array_keys(array_filter($indexes, static fn(array $columns): bool => $columns[0] === 'state_id'));
        if ($leadingState === []) { return ['available' => false, 'reason' => 'No state_id-leading existing index.', 'index_columns' => $indexes]; }
        $quoted = implode(', ', array_map($db->quoteColumnName(...), $leadingState));
        $needle = $db->quoteTableName($table) . ' ' . $db->quoteTableName('a');
        if (substr_count($sql, $needle) !== 1) { return ['available' => false, 'reason' => 'Unexpected SELECT table alias shape.', 'index_columns' => $indexes]; }
        $variants = ['optimizer_default' => $sql, 'use_state_indexes' => str_replace($needle, $needle . ' USE INDEX (' . $quoted . ')', $sql),
            'ignore_state_indexes' => str_replace($needle, $needle . ' IGNORE INDEX (' . $quoted . ')', $sql)];
        $out = []; $expected = null;
        foreach ($variants as $name => $query) {
            $times = []; $counters = []; $count = 0;
            for ($i = 0; $i < $repetitions; $i++) {
                $before = self::handlers($db); $start = hrtime(true); $rows = $db->createCommand($query, $params)->queryAll();
                $times[] = (hrtime(true) - $start) / 1e6; $counters[] = self::delta($before, self::handlers($db));
                $fingerprint = hash('sha256', serialize($rows)); $expected ??= $fingerprint;
                if ($fingerprint !== $expected) { throw new \RuntimeException('Index hint comparison changed the result.'); }
                $count = count($rows); unset($rows);
            }
            $plan = $db->createCommand('EXPLAIN FORMAT=TRADITIONAL ' . $query, $params)->queryAll();
            $plan = array_map(static function(array $row): array {
                $p = array_intersect_key($row, array_flip(['table', 'type', 'key', 'rows', 'filtered', 'Extra']));
                if (isset($p['rows'])) { $p['estimated_rows'] = (int)$p['rows']; unset($p['rows']); } return $p;
            }, $plan);
            $out[$name] = ['client_query_elapsed_ms' => $times, 'returned_rows' => $count, 'session_handler_read_delta' => $counters,
                'explain_estimated' => $plan, 'explain_analyze_actual' => $this->actualPlan($db, $query, $params)];
        }
        return ['available' => true, 'same_result_for_all_variants' => true, 'ordinary_discovery_query' => 'p1_profile_attributes',
            'existing_index_columns' => $indexes, 'measurement_note' => 'Handler counters are actual engine read operations, not rows_examined. EXPLAIN rows are estimates.', 'variants' => $out];
    }
}

/** Uses the actual production Connection and preserves its MySQL command behavior. */
final class ProbeCommand extends \yii\db\Command
{
    protected function queryInternal($method, $fetchMode = null)
    {
        $probe = QueryProbe::$active; if ($probe === null) { return parent::queryInternal($method, $fetchMode); }
        $start = hrtime(true); $result = null; $failed = true;
        try { $result = parent::queryInternal($method, $fetchMode); $failed = false; return $result; }
        finally { $probe->record($this->getSql(), $this->params, (hrtime(true) - $start) / 1e6, $result, $method, $failed); }
    }
    public function execute()
    {
        if (QueryProbe::$active !== null) { throw new \RuntimeException('Ordinary discovery benchmark attempted a write.'); }
        return parent::execute();
    }
}
