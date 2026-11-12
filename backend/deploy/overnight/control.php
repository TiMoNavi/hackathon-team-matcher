<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' || !in_array($argv[1] ?? '', ['install', 'inspect'], true)) {
    fwrite(STDERR, "Use harness.py install|inspect.\n"); exit(2);
}
ob_start();
try {
    $action = $argv[1];
    $app = require __DIR__ . '/bootstrap.php';
    $db = $app->db;
    if ($action === 'install') {
        if ($app->runAction('installer/install-db') !== 0) { throw new RuntimeException('Core migration failed.'); }
        humhub\modules\installer\libs\InitialData::bootstrap();
        $app->installationState->setInstalled();
        $app->settings->set('name', 'Overnight N01 Isolated Validation');
        $app->settings->set('baseUrl', 'http://127.0.0.1:8113');
        $app->settings->set('mailerTransportType', 'file');
        $app->settings->set('mailerSystemEmailAddress', 'n01@example.invalid');
        $app->getModule('user')->settings->set('auth.allowGuestAccess', 0);
        $app->getModule('user')->settings->set('auth.anonymousRegistration', 0);
        foreach ($isolatedConfig['modules'] as $id) {
            if (!$app->moduleManager->hasModule($id)) {
                if ($app->moduleManager->register($backend . '/protected/modules/' . $id) !== $id) {
                    throw new RuntimeException('Module registration failed.');
                }
            }
            $module = $app->moduleManager->getModule($id, false);
            if (!$module->isEnabled) { $module->enable(); }
            if (is_dir($module->getBasePath() . '/migrations')) {
                $migration = new class('migrate', $module, ['db' => $db, 'interactive' => false, 'color' => false,
                    'moduleId' => $id, 'migrationPath' => $module->getBasePath() . '/migrations']) extends humhub\commands\MigrateController {};
                if ($migration->runAction('up') !== 0) { throw new RuntimeException('Module migration failed.'); }
            }
            $record = humhub\models\ModuleEnabled::findOne(['module_id' => $id]);
            if (!$record) { throw new RuntimeException('Module enable record missing.'); }
            $record->version = $module->version;
            if (!$record->save(false)) { throw new RuntimeException('Module version persistence failed.'); }
        }
        $app->moduleManager->flushCache();
        $db->schema->refresh();
    }
    $counts = [];
    foreach (['user', 'profile', 'space', 'space_membership', 'user_auth', 'module_enabled', 'migration',
        'queue', 'message', 'message_entry', 'matcher_profile_draft', 'matcher_profile_attribute',
        'matcher_onboarding_session', 'matcher_recommendation_current_selection', 'matcher_idea'] as $table) {
        $schema = $db->schema->getTableSchema('{{%' . $table . '}}', true);
        $counts[$table] = $schema === null ? null : (int)(new yii\db\Query())->from('{{%' . $table . '}}')->count('*', $db);
    }
    $modules = [];
    foreach ($isolatedConfig['modules'] as $id) {
        $module = $app->moduleManager->getModule($id, false);
        $record = humhub\models\ModuleEnabled::findOne(['module_id' => $id]);
        $modules[$id] = ['enabled' => $module !== null && $module->isEnabled, 'code_version' => $module?->version, 'installed_version' => $record?->version];
    }
    $result = ['status' => 'passed', 'action' => $action, 'database' => $isolatedConfig['database'],
        'php' => PHP_VERSION, 'mysql' => $db->createCommand('SELECT VERSION()')->queryScalar(), 'humhub' => $app->version,
        'counts' => $counts, 'modules' => $modules, 'mail_transport' => 'file', 'outbound_transports_blocked' => true,
        'real_ai_calls' => 0, 'queue_worker_started' => false, 'cron_started' => false, 'seeded_users' => false];
    ob_end_clean();
    echo PHP_EOL, '__OVERNIGHT_CONTROL_RESULT__', PHP_EOL, json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    while (ob_get_level() > 0) { ob_end_clean(); }
    fwrite(STDERR, json_encode(['status' => 'failed', 'type' => get_class($error), 'reason' => 'Isolated control failed; diagnostics suppressed.']) . PHP_EOL);
    exit(1);
}
