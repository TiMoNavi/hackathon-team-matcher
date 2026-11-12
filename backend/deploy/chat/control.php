<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' || !in_array($argv[1] ?? '', ['install', 'inspect', 'upgrade-ui', 'ui-on', 'ui-off'], true)) {
    fwrite(STDERR, 'Use a fixed chat harness action.' . PHP_EOL); exit(2);
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
        $app->settings->set('name', 'Chat C02 Isolated Validation');
        $app->settings->set('baseUrl', 'http://127.0.0.1:8124');
        $app->settings->set('mailerTransportType', 'file');
        $app->settings->set('mailerSystemEmailAddress', 'chat-c02@example.invalid');
        $app->getModule('user')->settings->set('auth.allowGuestAccess', 0);
        $app->getModule('user')->settings->set('auth.anonymousRegistration', 0);
        $app->getModule('user')->settings->set('auth.internalUsersCanInviteByEmail', 0);
        $app->getModule('user')->settings->set('auth.internalUsersCanInviteByLink', 0);
    }
    if (in_array($action, ['install', 'upgrade-ui'], true)) {
        if ($action === 'upgrade-ui' && $chatConfig['modules'] !== ['mail', 'matcher-chat-ui']) {
            throw new RuntimeException('Fixed UI upgrade configuration is absent.');
        }
        foreach ($action === 'upgrade-ui' ? ['matcher-chat-ui'] : $chatConfig['modules'] as $id) {
            if (!$app->moduleManager->hasModule($id)
                && $app->moduleManager->register($backend . '/protected/modules/' . $id) !== $id) {
                throw new RuntimeException('Module registration failed.');
            }
            $module = $app->moduleManager->getModule($id, false);
            if (!$module->isEnabled && $module->enable() === false) { throw new RuntimeException('Module enable failed.'); }
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
        $app->moduleManager->flushCache(); $db->schema->refresh();
    }
    if (in_array($action, ['ui-on', 'ui-off'], true)) {
        if ($chatConfig['modules'] !== ['mail', 'matcher-chat-ui']) { throw new RuntimeException('UI module is absent.'); }
        $ui = $app->moduleManager->getModule('matcher-chat-ui', false);
        if (!$ui || !$ui->isEnabled || !method_exists($ui, 'isUiEnabled')) { throw new RuntimeException('UI module contract is unavailable.'); }
        $ui->settings->set('uiEnabled', $action === 'ui-on' ? '1' : '0');
        $app->moduleManager->flushCache();
    }
    $counts = [];
    $business = ['user', 'profile', 'space', 'space_membership', 'user_auth', 'message', 'user_message', 'message_entry', 'file'];
    foreach (array_merge($business, ['queue', 'module_enabled', 'migration']) as $table) {
        $schema = $db->schema->getTableSchema('{{%' . $table . '}}', true);
        $counts[$table] = $schema === null ? null : (int)(new yii\db\Query())->from('{{%' . $table . '}}')->count('*', $db);
    }
    $empty = true;
    foreach ($business as $table) { if (($counts[$table] ?? 0) !== 0) { $empty = false; } }
    $modules = [];
    foreach ($chatConfig['modules'] as $id) {
        $module = $app->moduleManager->getModule($id, false);
        $record = humhub\models\ModuleEnabled::findOne(['module_id' => $id]);
        $modules[$id] = ['enabled' => $module !== null && $module->isEnabled, 'code_version' => $module?->version, 'installed_version' => $record?->version];
    }
    $result = ['status' => 'passed', 'action' => $action, 'database' => $chatConfig['database'],
        'php' => PHP_VERSION, 'mysql' => $db->createCommand('SELECT VERSION()')->queryScalar(), 'humhub' => $app->version,
        'counts' => $counts, 'modules' => $modules, 'empty_business_data' => $empty, 'mail_transport' => 'file',
        'outbound_transports_blocked' => true, 'real_ai_calls' => 0, 'worker_started' => false, 'cron_started' => false, 'seeded_users' => false];
    $result['baseline_installed'] = $counts['user'] !== null && $counts['profile'] !== null
        && $counts['message'] !== null && $counts['user_message'] !== null && $counts['message_entry'] !== null;
    foreach ($modules as $module) {
        $result['baseline_installed'] = $result['baseline_installed'] && $module['enabled']
            && $module['installed_version'] === $module['code_version'];
    }
    if (in_array('matcher-chat-ui', $chatConfig['modules'], true)) {
        $ui = $app->moduleManager->getModule('matcher-chat-ui', false);
        $result['ui_enabled'] = $ui !== null && $ui->isEnabled && method_exists($ui, 'isUiEnabled') && $ui->isUiEnabled();
    }
    ob_end_clean();
    echo PHP_EOL, '__CHAT_CONTROL_RESULT__', PHP_EOL, json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    while (ob_get_level() > 0) { ob_end_clean(); }
    fwrite(STDERR, json_encode(['status' => 'failed', 'reason' => 'Chat control failed; private diagnostics suppressed.']) . PHP_EOL);
    exit(1);
}
