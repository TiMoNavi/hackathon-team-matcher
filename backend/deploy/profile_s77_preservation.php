<?php
declare(strict_types=1);
/** Capture and compare anonymous fingerprints of the main preview's original data. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$action = $argv[1] ?? '';
try {
    if (!in_array($action, ['capture', 'verify'], true)) { throw new RuntimeException('Use capture or verify.'); }
    $app = require __DIR__ . '/app.php'; $db = $app->db;
    if ($db->createCommand('SELECT DATABASE()')->queryScalar() !== 'humhub_preview') { throw new RuntimeException('Unexpected preservation target.'); }
    $db->enableLogging = $db->enableProfiling = false;
    $tables = ['user', 'profile', 'space', 'space_membership', 'profile_field', 'matcher_profile_state', 'matcher_profile_attribute', 'matcher_profile_revision', 'matcher_profile_draft', 'matcher_profile_presentation', 'matcher_profile_relation_sharing', 'matcher_idea', 'matcher_idea_activity', 'matcher_idea_conversation', 'matcher_idea_draft', 'message', 'message_entry', 'user_message', 'matcher_profile_question_batch', 'matcher_profile_question_answer', 'matcher_onboarding_session', 'matcher_profile_source', 'matcher_profile_source_snapshot', 'matcher_profile_source_job', 'matcher_profile_ai_job', 'matcher_recommendation_discovery_settings'];
    $fingerprints = [];
    foreach ($tables as $table) {
        $schema = $db->schema->getTableSchema('{{%' . $table . '}}', true);
        $columns = $table === 'user' ? array_values(array_intersect(['id', 'guid', 'username', 'email', 'status', 'visibility', 'language', 'time_zone', 'auth_mode', 'contentcontainer_id'], array_keys($schema->columns))) : array_keys($schema->columns);
        $rows = (new yii\db\Query())->select($columns)->from('{{%' . $table . '}}')->orderBy(array_fill_keys($schema->primaryKey, SORT_ASC))->all($db);
        $fingerprints[$table] = ['rows' => count($rows), 'sha256' => hash('sha256', json_encode($rows, JSON_THROW_ON_ERROR))];
    }
    $path = dirname(__DIR__) . '/.runtime/profile-s77-data-baseline.json';
    if ($action === 'capture') {
        if (is_file($path)) { throw new RuntimeException('Existing preservation baseline must not be overwritten.'); }
        file_put_contents($path, json_encode($fingerprints, JSON_THROW_ON_ERROR)); chmod($path, 0600);
    } else {
        $baseline = json_decode(file_get_contents($path), true, 32, JSON_THROW_ON_ERROR);
        if ($baseline !== $fingerprints) { throw new RuntimeException('Main preview data differs from the captured baseline.'); }
    }
    echo json_encode(['status' => 'passed', 'action' => $action, 'tables' => count($fingerprints), 'main_total_accounts' => $fingerprints['user']['rows'], 'main_total_spaces' => $fingerprints['space']['rows'], 'confirmed_attributes' => $fingerprints['matcher_profile_attribute']['rows'], 'checks' => array_map(static fn($table, $value) => ['table' => $table, 'rows' => $value['rows'], 'unchanged' => true], array_keys($fingerprints), array_values($fingerprints)), 'excluded_operational_fields' => 'login/activity timestamps and current Space selection'], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, json_encode(['status' => 'failed', 'error_type' => get_class($error), 'reason' => $error instanceof RuntimeException && !($error instanceof yii\db\Exception) ? $error->getMessage() : 'Preservation check failed; private details omitted.']) . PHP_EOL); exit(1);
}
