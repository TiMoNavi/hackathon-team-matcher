<?php
declare(strict_types=1);
/** Read-only comparison with the original rows in the isolated S7.6 backup clone. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
try {
    $app = require __DIR__ . '/app.php';
    $main = $app->db;
    if ($main->createCommand('SELECT DATABASE()')->queryScalar() !== 'humhub_preview') { throw new RuntimeException('Unexpected main target.'); }
    $cloneName = 'humhub_profile_s76_test_root_e25c8a91';
    $clone = new yii\db\Connection([
        'dsn' => preg_replace('/(?<=:|;)dbname=[^;]*/', 'dbname=' . $cloneName, $main->dsn, 1),
        'username' => $main->username, 'password' => $main->password,
        'charset' => $main->charset, 'tablePrefix' => $main->tablePrefix,
        'enableLogging' => false, 'enableProfiling' => false,
    ]);
    if ($clone->createCommand('SELECT DATABASE()')->queryScalar() !== $cloneName) { throw new RuntimeException('Unexpected baseline target.'); }
    $fixtureNames = []; // The root clone is retained as an untouched comparison baseline.
    $ids = array_map('intval', (new yii\db\Query())->select('id')->from('{{%user}}')->where(['not in', 'username', $fixtureNames])->column($clone));
    // The baseline account IDs predate the synthetic namespace; the exact count is from the upgrade receipt.
    $receipt = json_decode(file_get_contents(dirname(__DIR__, 2) . '/docs/用户画像收集/sources/s76-main-baseline_2026-11-12.json'), true, 32, JSON_THROW_ON_ERROR);
    if (count($ids) !== $receipt['native_row_counts']['user']) { throw new RuntimeException('Baseline account set is not exact.'); }
    $spaces = array_map('intval', (new yii\db\Query())->select('id')->from('{{%space}}')->where(['id' => [1,2,3,4]])->column($clone));
    if (count($spaces) !== $receipt['native_row_counts']['space']) { throw new RuntimeException('Baseline Space set is not exact.'); }
    $mainAccounts = (int)(new yii\db\Query())->from('{{%user}}')->count('*', $main);
    $mainSpaces = (int)(new yii\db\Query())->from('{{%space}}')->count('*', $main);
    $scaleAccountsOnMain = (int)(new yii\db\Query())->from('{{%user}}')->where(['username' => $fixtureNames])->count('*', $main);
    if ($mainAccounts !== count($ids) || $mainSpaces !== count($spaces) || $scaleAccountsOnMain !== 0) { throw new RuntimeException('Main preview account or Space totals changed.'); }
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
    foreach (['matcher_profile_presentation','matcher_profile_relation_sharing','matcher_idea','matcher_idea_activity','matcher_idea_conversation','matcher_idea_draft','message','message_entry','user_message','matcher_profile_question_batch','matcher_profile_question_answer','matcher_onboarding_session','matcher_profile_source','matcher_profile_source_snapshot','matcher_profile_source_job','matcher_profile_ai_job'] as $table) { $compare($table, []); }
    $compare('matcher_recommendation_discovery_settings', ['owner_id' => $ids]);
    echo json_encode(['status' => 'passed', 'scope' => 'original account identity fields, native profiles, Spaces and memberships, profile catalog/state/history/drafts, presentation/ideas/messages and source/onboarding/AI records', 'excluded_operational_fields' => 'login/activity timestamps and current Space selection', 'original_accounts' => count($ids), 'original_spaces' => count($spaces), 'main_total_accounts' => $mainAccounts, 'main_total_spaces' => $mainSpaces, 'scale_accounts_on_main' => $scaleAccountsOnMain, 'checks' => $checks], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, json_encode(['status' => 'failed', 'type' => get_class($error), 'reason' => $error instanceof RuntimeException ? $error->getMessage() : 'Read-only preservation check failed.']) . PHP_EOL);
    exit(1);
}
