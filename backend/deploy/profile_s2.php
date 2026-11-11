<?php
/** CLI-only S2 upgrade/inspection. Uses HumHub's migration history and a private preview backup. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$action = $argv[1] ?? 'inspect';
$target = $argv[2] ?? null;
if (!in_array($action, ['inspect', 'upgrade'], true)) { fwrite(STDERR, "Usage: profile_s2.php inspect|upgrade [isolated_test_database]\n"); exit(2); }
$root = dirname(__DIR__);
try {
    if ($target !== null) {
        if (!preg_match('/^humhub_profile_s2_test_[a-z0-9_]+$/D', $target)) { throw new RuntimeException('Only an isolated S2 database override is supported.'); }
        putenv('MATCHER_S2_TEST_DB=' . $target);
        $app = require $root . '/protected/modules/matcher-user-profile/tests/integration/s2_http_bootstrap.php';
    } else { $app = require __DIR__ . '/app.php'; }
    $db = $app->db;
    $module = $app->getModule('matcher-user-profile');
    if (!$module instanceof humhub\modules\matcherProfile\Module || !$module->isEnabled) { throw new RuntimeException('The S1 profile module must already be enabled.'); }
    $fingerprint = static function () use ($db): array {
        $result = [];
        foreach (['user', 'profile', 'space', 'space_membership'] as $name) {
            $schema = $db->schema->getTableSchema('{{%' . $name . '}}', true);
            $rows = (new yii\db\Query())->from('{{%' . $name . '}}')->orderBy(array_fill_keys($schema->primaryKey, SORT_ASC))->all($db);
            $result[$name] = ['rows' => count($rows), 'sha256' => hash('sha256', json_encode($rows, JSON_THROW_ON_ERROR))];
        }
        return $result;
    };
    $before = $fingerprint();
    $backupVerified = false;
    if ($action === 'upgrade') {
        if ($target === null) {
            $marker = $root . '/.runtime/profile-s2-backup-path';
            $directory = is_file($marker) ? realpath(trim(file_get_contents($marker))) : false;
            $backupRoot = realpath($root . '/.runtime/backups');
            if (!$directory || !$backupRoot || !str_starts_with($directory, $backupRoot . '/')) { throw new RuntimeException('A private S2 preview backup is required.'); }
            $manifest = json_decode(file_get_contents($directory . '/manifest.json'), true, 16, JSON_THROW_ON_ERROR);
            $backupVerified = is_file($directory . '/database.sql') && hash_equals($manifest['sha256'], hash_file('sha256', $directory . '/database.sql'));
            if (!$backupVerified) { throw new RuntimeException('The S2 backup checksum does not match.'); }
        }
        // Console stdout bypasses MigrationService's web output buffer. Use the same
        // native controller/history with a quiet output adapter and an explicit exit code.
        $migration = new class('migrate', $module, ['db' => $db, 'interactive' => false, 'color' => false, 'moduleId' => $module->id, 'migrationPath' => $module->getBasePath() . '/migrations']) extends humhub\commands\MigrateController {
            public function stdout($string) { return strlen($string); }
            public function stderr($string) { return strlen($string); }
            public function pending(): array { return $this->getNewMigrations(); }
        };
        ob_start();
        try { $exitCode = $migration->runAction('up'); } finally { ob_end_clean(); }
        if ($exitCode !== 0 || $migration->pending() !== []) { throw new RuntimeException('S2 migration did not complete; inspect private runtime logs.'); }
        $record = humhub\models\ModuleEnabled::findOne(['module_id' => $module->id]);
        $record->version = $module->version;
        if (!$record->save(false)) { throw new RuntimeException('The installed module version was not saved.'); }
        $db->schema->refresh();
        $app->moduleManager->flushCache();
    }
    $after = $fingerprint();
    if ($before !== $after) { throw new RuntimeException('Native account/profile/Space data changed during schema upgrade.'); }
    $tables = [];
    foreach (['state', 'attribute', 'revision', 'draft'] as $part) {
        $table = '{{%matcher_profile_' . $part . '}}';
        $schema = $db->schema->getTableSchema($table, true);
        $tables[$part] = ['rows' => (int)(new yii\db\Query())->from($table)->count('*', $db), 'columns' => array_keys($schema->columns)];
    }
    $catalog = humhub\modules\matcherProfile\domain\FieldCatalog::definitions();
    $moduleMigrations = array_map(static fn(string $path): string => basename($path, '.php'), glob($module->getBasePath() . '/migrations/m*.php'));
    $migrationRows = (new yii\db\Query())->select('version')->from('{{%migration}}')->where(['version' => $moduleMigrations])->orderBy('version')->column($db);
    echo json_encode([
        'captured_at_utc' => gmdate('c'), 'status' => 'passed', 'action' => $action,
        'environment' => $target === null ? 'local_preview' : 'isolated_test_clone',
        'backup_checksum_verified' => $backupVerified,
        'module_version' => $module->version,
        'installed_version' => humhub\models\ModuleEnabled::findOne(['module_id' => $module->id])->version,
        'humhub_version' => $app->version, 'catalog_version' => humhub\modules\matcherProfile\domain\FieldCatalog::VERSION,
        'ordinary_field_count' => count($catalog),
        'profile_field_count' => (int)(new yii\db\Query())->from('{{%profile_field}}')->count('*', $db),
        'visibility_default' => $db->schema->getTableSchema('{{%matcher_profile_attribute}}', true)->getColumn('visibility')->defaultValue,
        'native_rows_unchanged' => $before === $after,
        'native_row_counts' => array_map(static fn(array $row): int => $row['rows'], $after),
        'core_tables' => $tables, 'migrations' => $migrationRows,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, json_encode(['status' => 'failed', 'action' => $action, 'error_type' => get_class($error), 'reason' => $error instanceof RuntimeException && !($error instanceof yii\db\Exception) ? $error->getMessage() : 'Runtime failure; raw details suppressed.']) . PHP_EOL);
    exit(1);
}
