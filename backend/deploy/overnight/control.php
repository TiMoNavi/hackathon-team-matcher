<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' || !in_array($argv[1] ?? '', ['install', 'inspect', 'sync-modules', 'upgrade-n05', 'ui-on', 'ui-off', 'auth-configure'], true)) {
    fwrite(STDERR, "Use a fixed harness.py control action.\n"); exit(2);
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
    }
    if (in_array($action, ['install', 'sync-modules', 'upgrade-n05'], true)) {
        if ($action === 'sync-modules' && !in_array('matcher-webapp', $isolatedConfig['modules'], true)) {
            throw new RuntimeException('Run the guarded module configuration synchronization first.');
        }
        $migrationModules = $action === 'sync-modules'
            ? array_values(array_intersect(['matcher-webapp', 'matcher-github-import', 'matcher-auth'], $isolatedConfig['modules']))
            : $isolatedConfig['modules'];
        if ($action === 'upgrade-n05') {
            if (!in_array('matcher-event-access', $isolatedConfig['modules'], true)) { throw new RuntimeException('N05 configuration is required.'); }
            $migrationModules = ['matcher-user-profile', 'matcher-auth', 'matcher-recommendation', 'matcher-event-access'];
            foreach (['matcher-user-profile' => '0.10.1', 'matcher-auth' => '0.1.1', 'matcher-recommendation' => '0.4.1', 'matcher-event-access' => '0.1.0'] as $id => $version) {
                $metadata = json_decode(file_get_contents($backend . '/protected/modules/' . $id . '/module.json'), true, 16, JSON_THROW_ON_ERROR);
                if (($metadata['version'] ?? null) !== $version) { throw new RuntimeException('Reviewed N05 source version changed.'); }
            }
        }
        foreach ($migrationModules as $id) {
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
    if (in_array($action, ['ui-on', 'ui-off'], true)) {
        if (!in_array('matcher-webapp', $isolatedConfig['modules'], true)) { throw new RuntimeException('Webapp is not in the isolated configuration.'); }
        $webapp = $app->moduleManager->getModule('matcher-webapp', false);
        if ($webapp === null || !$webapp->isEnabled) { throw new RuntimeException('Webapp is not installed and enabled.'); }
        $webapp->settings->set('uiEnabled', $action === 'ui-on' ? '1' : '0');
        $app->moduleManager->flushCache();
    }
    if ($action === 'auth-configure') {
        if (!$authMode || !isset($authInput)) { throw new RuntimeException('Authentication mode is not configured.'); }
        $github = $app->getModule('auth-github');
        if (!$github || !$github->isEnabled) { throw new RuntimeException('Native GitHub auth is unavailable.'); }
        $github->settings->set('enabled', 1);
        $github->settings->set('clientId', $authInput['github']['client_id']);
        $github->settings->set('clientSecret', $authInput['github']['client_secret']);
        $app->moduleManager->flushCache();
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
        'counts' => $counts, 'modules' => $modules, 'mail_transport' => 'file', 'outbound_transports_blocked' => !$authMode,
        'real_ai_calls' => 0, 'queue_worker_started' => false, 'cron_started' => false, 'seeded_users' => false];
    $result['authentication_mode'] = $authMode;
    $result['otp_transport'] = $authMode ? 'designated-gmail-tls-max-three-attempts' : 'unavailable';
    $result['oauth_scope'] = $authMode ? 'github-user-email' : 'unavailable';
    if ($authMode) {
        // Aggregate verification only: no account identifiers, mailbox, code, receipt or source text.
        $evidence = ['native_provider_counts' => [], 'dual_provider_accounts' => 0, 'github_import_states' => [], 'github_source_states' => []];
        foreach (['email-code', 'github'] as $provider) {
            $evidence['native_provider_counts'][$provider] = (int)(new yii\db\Query())->from('{{%user_auth}}')->where(['source' => $provider])->count('*', $db);
        }
        $evidence['dual_provider_accounts'] = (int)$db->createCommand('SELECT COUNT(DISTINCT e.user_id) FROM {{%user_auth}} e INNER JOIN {{%user_auth}} g ON g.user_id=e.user_id WHERE e.source=:email AND g.source=:github', [':email' => 'email-code', ':github' => 'github'])->queryScalar();
        foreach (['pending', 'running', 'succeeded', 'failed', 'revoked', 'skipped_existing'] as $state) {
            $evidence['github_import_states'][$state] = (int)(new yii\db\Query())->from('{{%matcher_auth_import}}')->where(['state' => $state])->count('*', $db);
        }
        foreach (['running', 'ready', 'failed', 'deleted'] as $state) {
            $evidence['github_source_states'][$state] = (int)(new yii\db\Query())->from('{{%matcher_profile_source}}')->where(['kind' => 'github', 'status' => $state])->count('*', $db);
        }
        $evidence['github_sources_total'] = (int)(new yii\db\Query())->from('{{%matcher_profile_source}}')->where(['kind' => 'github'])->count('*', $db);
        $evidence['otp_consumed_challenges'] = (int)(new yii\db\Query())->from('{{%matcher_auth_challenge}}')->where(['status' => 'consumed'])->count('*', $db);
        $result['authentication_evidence'] = $evidence;
        require_once __DIR__ . '/auth_evidence.php';
        $result['authentication_session_evidence'] = overnightAuthEvidenceSummary($isolatedRuntime);
    }
    if (in_array('matcher-webapp', $isolatedConfig['modules'], true)) {
        $webapp = $app->moduleManager->getModule('matcher-webapp', false);
        $result['ui_enabled'] = $webapp !== null && $webapp->isEnabled && $webapp->isUiEnabled();
    }
    ob_end_clean();
    echo PHP_EOL, '__OVERNIGHT_CONTROL_RESULT__', PHP_EOL, json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    while (ob_get_level() > 0) { ob_end_clean(); }
    fwrite(STDERR, json_encode(['status' => 'failed', 'type' => get_class($error), 'reason' => 'Isolated control failed; diagnostics suppressed.']) . PHP_EOL);
    exit(1);
}
