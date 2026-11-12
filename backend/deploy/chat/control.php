<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' || !in_array($argv[1] ?? '', ['install', 'inspect', 'upgrade-ui', 'upgrade-chat', 'ui-on', 'ui-off', 'chat-read-on', 'chat-read-off', 'chat-ui-read-on', 'chat-ui-read-off', 'chat-takeover-on', 'chat-takeover-off', 'chat-send-on', 'chat-send-off', 'chat-attachments-on', 'chat-attachments-off'], true)) {
    fwrite(STDERR, 'Use a fixed chat harness action.' . PHP_EOL); exit(2);
}
ob_start();
$stage = 'bootstrap';
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
    if (in_array($action, ['install', 'upgrade-ui', 'upgrade-chat'], true)) {
        if ($action === 'upgrade-ui' && !in_array('matcher-chat-ui', $chatConfig['modules'], true)) {
            throw new RuntimeException('Fixed UI upgrade configuration is absent.');
        }
        if ($action === 'upgrade-chat' && $chatConfig['modules'] !== ['mail', 'matcher-chat-ui', 'matcher-chat']) {
            throw new RuntimeException('Fixed chat upgrade configuration is absent.');
        }
        $upgradeModules = match ($action) { 'upgrade-ui' => ['matcher-chat-ui'], 'upgrade-chat' => ['matcher-chat'], default => $chatConfig['modules'] };
        foreach ($upgradeModules as $id) {
            $stage = 'register-' . $id;
            if (!$app->moduleManager->hasModule($id)
                && $app->moduleManager->register($backend . '/protected/modules/' . $id) !== $id) {
                throw new RuntimeException('Module registration failed.');
            }
            $module = $app->moduleManager->getModule($id, false);
            $stage = 'enable-' . $id;
            if (!$module->isEnabled && $module->enable() === false) { throw new RuntimeException('Module enable failed.'); }
            if (is_dir($module->getBasePath() . '/migrations')) {
                $stage = 'migrate-' . $id;
                $migration = new class('migrate', $module, ['db' => $db, 'interactive' => false, 'color' => false,
                    'moduleId' => $id, 'migrationPath' => $module->getBasePath() . '/migrations']) extends humhub\commands\MigrateController {};
                if ($migration->runAction('up') !== 0) { throw new RuntimeException('Module migration failed.'); }
            }
            $record = humhub\models\ModuleEnabled::findOne(['module_id' => $id]);
            $stage = 'version-' . $id;
            if (!$record) { throw new RuntimeException('Module enable record missing.'); }
            $record->version = $module->version;
            if (!$record->save(false)) { throw new RuntimeException('Module version persistence failed.'); }
        }
        $app->moduleManager->flushCache(); $db->schema->refresh();
    }
    if (in_array($action, ['ui-on', 'ui-off'], true)) {
        if (!in_array('matcher-chat-ui', $chatConfig['modules'], true)) { throw new RuntimeException('UI module is absent.'); }
        $ui = $app->moduleManager->getModule('matcher-chat-ui', false);
        if (!$ui || !$ui->isEnabled || !method_exists($ui, 'isUiEnabled')) { throw new RuntimeException('UI module contract is unavailable.'); }
        $ui->settings->set('uiEnabled', $action === 'ui-on' ? '1' : '0');
        $app->moduleManager->flushCache();
    }
    if (in_array($action, ['chat-read-on', 'chat-read-off'], true)) {
        if ($chatConfig['modules'] !== ['mail', 'matcher-chat-ui', 'matcher-chat']) { throw new RuntimeException('Chat module is absent.'); }
        $chat = $app->moduleManager->getModule('matcher-chat', false);
        if (!$chat || !$chat->isEnabled || !method_exists($chat, 'isReadingEnabled')) { throw new RuntimeException('Chat module contract unavailable.'); }
        $chat->settings->set('readEnabled', $action === 'chat-read-on' ? '1' : '0');
        $app->moduleManager->flushCache();
        if ($chat->isReadingEnabled() !== ($action === 'chat-read-on')) { throw new RuntimeException('Read capability did not change.'); }
    }
    if (in_array($action, ['chat-ui-read-on', 'chat-ui-read-off'], true)) {
        if ($chatConfig['modules'] !== ['mail', 'matcher-chat-ui', 'matcher-chat']) { throw new RuntimeException('Fixed chat module set absent.'); }
        $ui = $app->moduleManager->getModule('matcher-chat-ui', false);
        if (!$ui || !$ui->isEnabled || !method_exists($ui, 'isReadUiEnabled')) { throw new RuntimeException('Read UI contract absent.'); }
        if ($action === 'chat-ui-read-on') {
            (new humhub\modules\matcherChatUi\adapters\assets\Manifest($ui->getBasePath() . '/resources/read-app'))->load();
        }
        $ui->settings->set('readUiEnabled', $action === 'chat-ui-read-on' ? '1' : '0');
        $app->moduleManager->flushCache();
        if ($ui->isReadUiEnabled() !== ($action === 'chat-ui-read-on')) { throw new RuntimeException('Read UI capability did not change.'); }
    }
    if (in_array($action, ['chat-takeover-on', 'chat-takeover-off'], true)) {
        if ($chatConfig['modules'] !== ['mail', 'matcher-chat-ui', 'matcher-chat']) { throw new RuntimeException('Fixed chat module set absent.'); }
        $chat = $app->moduleManager->getModule('matcher-chat', false);
        if (!$chat || !$chat->isEnabled || !method_exists($chat, 'isEntryTakeoverEnabled')) { throw new RuntimeException('Entry takeover contract absent.'); }
        $chat->settings->set('entryTakeoverEnabled', $action === 'chat-takeover-on' ? '1' : '0');
        $app->moduleManager->flushCache();
        if ($chat->isEntryTakeoverEnabled() !== ($action === 'chat-takeover-on')) { throw new RuntimeException('Entry takeover intention did not change.'); }
    }
    if (in_array($action, ['chat-send-on', 'chat-send-off'], true)) {
        if ($chatConfig['modules'] !== ['mail', 'matcher-chat-ui', 'matcher-chat']) { throw new RuntimeException('Fixed chat module set absent.'); }
        $chat = $app->moduleManager->getModule('matcher-chat', false);
        if (!$chat || !$chat->isEnabled || !method_exists($chat, 'isSendingEnabled')) { throw new RuntimeException('Send contract absent.'); }
        $chat->settings->set('sendEnabled', $action === 'chat-send-on' ? '1' : '0');
        $app->moduleManager->flushCache();
        if ($chat->isSendingEnabled() !== ($action === 'chat-send-on')) { throw new RuntimeException('Send intention did not change.'); }
    }
    if (in_array($action, ['chat-attachments-on', 'chat-attachments-off'], true)) {
        if ($chatConfig['modules'] !== ['mail', 'matcher-chat-ui', 'matcher-chat']) { throw new RuntimeException('Fixed modules absent.'); }
        $chat = $app->moduleManager->getModule('matcher-chat', false);
        if (!$chat || !$chat->isEnabled || !method_exists($chat, 'isAttachmentsEnabled')) { throw new RuntimeException('Attachment contract absent.'); }
        $chat->settings->set('attachmentsEnabled', $action === 'chat-attachments-on' ? '1' : '0');
        $app->moduleManager->flushCache();
        if ($chat->isAttachmentsEnabled() !== ($action === 'chat-attachments-on')) { throw new RuntimeException('Attachment intention did not change.'); }
    }
    $counts = [];
    $business = ['user', 'profile', 'space', 'space_membership', 'user_auth', 'message', 'user_message', 'message_entry', 'file'];
    if (in_array('matcher-chat', $chatConfig['modules'], true)) {
        $business = array_merge($business, ['matcher_chat_conversation', 'matcher_chat_entry_sequence', 'matcher_chat_member', 'matcher_chat_read_state', 'matcher_chat_viewer_revision', 'matcher_chat_send_receipt', 'matcher_chat_attachment']);
    }
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
        'outbound_transports_blocked' => true, 'real_ai_calls' => 0, 'worker_started' => false, 'cron_started' => false,
        'seeded_users' => ($counts['user'] ?? 0) > 0 ? null : false];
    $result['baseline_installed'] = $counts['user'] !== null && $counts['profile'] !== null
        && $counts['message'] !== null && $counts['user_message'] !== null && $counts['message_entry'] !== null;
    foreach ($modules as $module) {
        $result['baseline_installed'] = $result['baseline_installed'] && $module['enabled']
            && $module['installed_version'] === $module['code_version'];
    }
    if (in_array('matcher-chat', $chatConfig['modules'], true)) {
        foreach (['matcher_chat_lock', 'matcher_chat_conversation', 'matcher_chat_entry_sequence', 'matcher_chat_member', 'matcher_chat_read_state', 'matcher_chat_viewer_revision', 'matcher_chat_send_receipt', 'matcher_chat_attachment'] as $table) {
            if ($db->schema->getTableSchema('{{%' . $table . '}}', true) === null) { $result['baseline_installed'] = false; $result['empty_business_data'] = false; }
        }
    }
    if (in_array('matcher-chat-ui', $chatConfig['modules'], true)) {
        $ui = $app->moduleManager->getModule('matcher-chat-ui', false);
        $result['ui_enabled'] = $ui !== null && $ui->isEnabled && method_exists($ui, 'isUiEnabled') && $ui->isUiEnabled();
        $result['chat_ui_read_enabled'] = $ui !== null && $ui->isEnabled && method_exists($ui, 'isReadUiEnabled') && $ui->isReadUiEnabled();
    }
    if (in_array('matcher-chat', $chatConfig['modules'], true)) {
        $chat = $app->moduleManager->getModule('matcher-chat', false);
        $result['chat_attachments_enabled'] = $chat !== null && $chat->isEnabled && method_exists($chat, 'isAttachmentsEnabled') && $chat->isAttachmentsEnabled();
        $result['chat_send_enabled'] = $chat !== null && $chat->isEnabled && method_exists($chat, 'isSendingEnabled') && $chat->isSendingEnabled();
        $result['chat_read_enabled'] = $chat !== null && $chat->isEnabled && method_exists($chat, 'isReadingEnabled') && $chat->isReadingEnabled();
        $result['chat_entry_takeover_enabled'] = $chat !== null && $chat->isEnabled && method_exists($chat, 'isEntryTakeoverEnabled') && $chat->isEntryTakeoverEnabled();
    }
    ob_end_clean();
    echo PHP_EOL, '__CHAT_CONTROL_RESULT__', PHP_EOL, json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    while (ob_get_level() > 0) { ob_end_clean(); }
    fwrite(STDERR, json_encode(['status' => 'failed', 'stage' => $stage, 'exception_type' => get_class($error), 'reason' => 'Chat control failed; private diagnostics suppressed.']) . PHP_EOL);
    exit(1);
}
