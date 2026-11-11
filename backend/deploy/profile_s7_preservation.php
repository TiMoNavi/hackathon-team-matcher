<?php
declare(strict_types=1);
/** Read-only comparison with the original rows in the isolated S7 backup clone. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
try {
    $app = require __DIR__ . '/app.php';
    $main = $app->db;
    if ($main->createCommand('SELECT DATABASE()')->queryScalar() !== 'humhub_preview') { throw new RuntimeException('Unexpected main target.'); }
    $cloneName = 'humhub_profile_s7_test_root_e54d7303';
    $clone = new yii\db\Connection([
        'dsn' => preg_replace('/(?<=:|;)dbname=[^;]*/', 'dbname=' . $cloneName, $main->dsn, 1),
        'username' => $main->username, 'password' => $main->password,
        'charset' => $main->charset, 'tablePrefix' => $main->tablePrefix,
        'enableLogging' => false, 'enableProfiling' => false,
    ]);
    if ($clone->createCommand('SELECT DATABASE()')->queryScalar() !== $cloneName) { throw new RuntimeException('Unexpected baseline target.'); }
    $fixtureNames = array_map(static fn(int $n): string => sprintf('s7_sim_%03d', $n), range(1, 100));
    $ids = array_map('intval', (new yii\db\Query())->select('id')->from('{{%user}}')->where(['not in', 'username', $fixtureNames])->column($clone));
    // The baseline account IDs predate the synthetic namespace; the exact count is from the upgrade receipt.
    $receipt = json_decode(file_get_contents(dirname(__DIR__, 2) . '/docs/用户画像收集/sources/s7-main-upgrade_2026-11-12.json'), true, 32, JSON_THROW_ON_ERROR);
    if (count($ids) !== $receipt['native_row_counts']['user']) { throw new RuntimeException('Baseline account set is not exact.'); }
    $spaces = array_map('intval', (new yii\db\Query())->select('id')->from('{{%space}}')->where(['not in', 'name', ['S7 模拟人物主活动（100人）', 'S7 模拟人物第二活动（20人）']])->column($clone));
    if (count($spaces) !== $receipt['native_row_counts']['space']) { throw new RuntimeException('Baseline Space set is not exact.'); }
    $checks = [];
    $compare = static function (string $table, array $where, ?array $columns = null) use ($main, $clone, &$checks): void {
        $schema = $clone->schema->getTableSchema('{{%' . $table . '}}');
        $query = (new yii\db\Query())->select($columns ?? array_keys($schema->columns))->from('{{%' . $table . '}}')->where($where)->orderBy(array_fill_keys($schema->primaryKey, SORT_ASC));
        $before = $query->all($clone); $after = $query->all($main);
        if ($before !== $after) { throw new RuntimeException('Preservation comparison failed: ' . $table); }
        $checks[] = ['table' => $table, 'original_rows' => count($before), 'unchanged' => true];
    };
    $columns = array_values(array_intersect(['id', 'guid', 'username', 'email', 'status', 'visibility', 'language', 'time_zone', 'auth_mode', 'contentcontainer_id'], array_keys($clone->schema->getTableSchema('{{%user}}')->columns)));
    $compare('user', ['id' => $ids], $columns);
    $compare('profile', ['user_id' => $ids]);
    $compare('space', ['id' => $spaces]);
    $compare('space_membership', ['space_id' => $spaces, 'user_id' => $ids]);
    $compare('profile_field', []);
    $compare('matcher_profile_state', ['user_id' => $ids]);
    $states = (new yii\db\Query())->select('id')->from('{{%matcher_profile_state}}')->where(['user_id' => $ids])->column($clone);
    foreach (['matcher_profile_attribute', 'matcher_profile_revision', 'matcher_profile_draft'] as $table) { $compare($table, ['state_id' => $states]); }
    echo json_encode(['status' => 'passed', 'scope' => 'original account identity fields, native profiles, original Spaces and memberships, profile catalog and existing profile state/history/drafts', 'excluded_operational_fields' => 'login/activity timestamps and new synthetic Space memberships', 'original_accounts' => count($ids), 'original_spaces' => count($spaces), 'checks' => $checks], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, json_encode(['status' => 'failed', 'type' => get_class($error), 'reason' => $error instanceof RuntimeException ? $error->getMessage() : 'Read-only preservation check failed.']) . PHP_EOL);
    exit(1);
}
