<?php
/** CLI-only S77 registration, native migration and anonymous inspection. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$action = $argv[1] ?? 'inspect';
$target = $argv[2] ?? null;
if (!in_array($action, ['inspect', 'upgrade'], true)) { fwrite(STDERR, 'Use inspect|upgrade [isolated_s77_database].' . PHP_EOL); exit(2); }
$backend = dirname(__DIR__);
try {
    if ($target !== null) {
        if (!in_array($target, ['humhub_profile_s77_test_root_f3a9d621', 'humhub_profile_s77_test_audit_a8c52e14'], true)) { throw new RuntimeException('An isolated S77 clone is required.'); }
        putenv('MATCHER_S77_TEST_DB=' . $target);
        $app = require $backend . '/protected/modules/matcher-onboarding/tests/integration/s77_http_bootstrap.php';
    } else { $app = require __DIR__ . '/app.php'; }
    $db = $app->db;
    $baselineColumns = [];
    $fingerprint = static function () use ($db, &$baselineColumns): array {
        $result = [];
        foreach (['user', 'profile', 'space', 'space_membership', 'profile_field', 'matcher_profile_state', 'matcher_profile_attribute', 'matcher_profile_revision', 'matcher_profile_draft', 'matcher_profile_question_batch', 'matcher_profile_question_answer', 'matcher_onboarding_session', 'matcher_profile_source', 'matcher_profile_source_snapshot', 'matcher_profile_source_job', 'matcher_profile_ai_job'] as $name) {
            $schema = $db->schema->getTableSchema('{{%' . $name . '}}', true);
            $baselineColumns[$name] ??= array_keys($schema->columns);
            $rows = (new yii\db\Query())->select($baselineColumns[$name])->from('{{%' . $name . '}}')->orderBy(array_fill_keys($schema->primaryKey, SORT_ASC))->all($db);
            $result[$name] = ['rows' => count($rows), 'sha256' => hash('sha256', json_encode($rows, JSON_THROW_ON_ERROR))];
        }
        return $result;
    };
    $before = $fingerprint();
    $backupVerified = false;
    if ($action === 'upgrade') {
        if ($target === null) {
            $directory = realpath(trim(file_get_contents($backend . '/.runtime/profile-s77-backup-path')));
            $backupRoot = realpath($backend . '/.runtime/backups');
            if (!$directory || !$backupRoot || !str_starts_with($directory, $backupRoot . '/')) { throw new RuntimeException('A private pre-S77 backup is required.'); }
            $manifest = json_decode(file_get_contents($directory . '/manifest.json'), true, 16, JSON_THROW_ON_ERROR);
            $backupVerified = is_file($directory . '/database.sql') && hash_equals($manifest['sha256'], hash_file('sha256', $directory . '/database.sql'));
            if (!$backupVerified) { throw new RuntimeException('The S77 backup checksum does not match.'); }
        }
        // S7.7 adds compatible progress projections to P1 and P2; no new schema migration.
        foreach (['matcher-user-profile', 'matcher-onboarding', 'matcher-onboarding-ai'] as $id) {
            $registered = $app->moduleManager->register($backend . '/protected/modules/' . $id);
            if ($registered !== $id) { throw new RuntimeException('Module registration mismatch.'); }
            $module = $app->moduleManager->getModule($id);
            if (!$module->isEnabled) { $module->getModuleService()->enable(); }
            $migration = new class('migrate', $module, ['db' => $db, 'interactive' => false, 'color' => false, 'moduleId' => $id, 'migrationPath' => $module->getBasePath() . '/migrations']) extends humhub\commands\MigrateController {
                public function stdout($string) { return strlen($string); }
                public function stderr($string) { return strlen($string); }
                public function pending(): array { return $this->getNewMigrations(); }
            };
            if (is_dir($module->getBasePath() . '/migrations')) {
                ob_start();
                try { $exitCode = $migration->runAction('up'); } finally { ob_end_clean(); }
                if ($exitCode !== 0 || $migration->pending() !== []) { throw new RuntimeException('Module migrations did not finish.'); }
            }
            $record = humhub\models\ModuleEnabled::findOne(['module_id' => $id]);
            $record->version = $module->version;
            if (!$record->save(false)) { throw new RuntimeException('Installed module version could not be saved.'); }
        }
        $db->schema->refresh();
        $app->moduleManager->flushCache();
    }
    $after = $fingerprint();
    if ($before !== $after) { throw new RuntimeException('Native account, profile or Space values changed during deployment.'); }
    if ($action === 'upgrade' && $target === null) { touch($backend . '/.runtime/profile-s77-installed'); }
    $modules = [];
    foreach (['auth-github', 'matcher-user-profile', 'matcher-profile-privacy', 'matcher-onboarding', 'matcher-github-import', 'matcher-resume-import', 'matcher-web-import', 'matcher-onboarding-ai', 'matcher-recommendation', 'matcher-ideas'] as $id) {
        $module = $app->getModule($id);
        $record = humhub\models\ModuleEnabled::findOne(['module_id' => $id]);
        $modules[$id] = ['enabled' => $module !== null && $module->isEnabled, 'code_version' => $module?->version, 'installed_version' => $record?->version];
    }
    $migrationNames = [];
    foreach (['auth-github', 'matcher-user-profile', 'matcher-profile-privacy', 'matcher-onboarding', 'matcher-github-import', 'matcher-resume-import', 'matcher-web-import', 'matcher-onboarding-ai', 'matcher-recommendation', 'matcher-ideas'] as $id) {
        foreach (glob($backend . '/protected/modules/' . $id . '/migrations/m*.php') as $path) { $migrationNames[] = basename($path, '.php'); }
    }
    $workflowTables = [];
    foreach (['matcher_profile_source', 'matcher_profile_source_snapshot', 'matcher_profile_source_job', 'matcher_profile_ai_job', 'matcher_recommendation_current_selection', 'matcher_recommendation_discovery_settings', 'matcher_profile_presentation', 'matcher_profile_relation_sharing', 'matcher_idea', 'matcher_idea_activity', 'matcher_idea_conversation', 'matcher_idea_draft'] as $table) {
        $schema = $db->schema->getTableSchema('{{%' . $table . '}}', true);
        $workflowTables[$table] = ['exists' => $schema !== null, 'rows' => $schema === null ? null : (int)(new yii\db\Query())->from('{{%' . $table . '}}')->count('*', $db)];
    }
    echo json_encode([
        'status' => 'passed', 'captured_at_utc' => gmdate('c'), 'action' => $action,
        'environment' => $target === null ? 'local_preview' : 'isolated_test_clone',
        'backup_checksum_verified' => $backupVerified, 'modules' => $modules,
        'native_rows_unchanged' => true, 'native_row_counts' => array_map(static fn(array $item): int => $item['rows'], $after),
        'profile_field_count' => (int)(new yii\db\Query())->from('{{%profile_field}}')->count('*', $db),
        'ordinary_field_count' => count(humhub\modules\matcherProfile\domain\FieldCatalog::definitions()),
        'workflow_tables' => $workflowTables,
        'migrations' => (new yii\db\Query())->select('version')->from('{{%migration}}')->where(['version' => $migrationNames])->orderBy('version')->column($db),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, json_encode(['status' => 'failed', 'action' => $action, 'type' => get_class($error), 'reason' => $error instanceof RuntimeException && !($error instanceof yii\db\Exception) ? $error->getMessage() : 'Deployment failed; inspect private runtime diagnostics.']) . PHP_EOL);
    exit(1);
}
