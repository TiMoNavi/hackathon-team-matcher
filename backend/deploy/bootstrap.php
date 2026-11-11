<?php
$root = dirname(__DIR__);
$app = require __DIR__ . '/app.php';
$credentials = json_decode(file_get_contents($root . '/.runtime/preview-credentials.json'), true, flags: JSON_THROW_ON_ERROR);
if (($argv[1] ?? '') !== 'install') { throw new RuntimeException('Unsupported bootstrap action'); }
if (!$app->installationState->hasState(humhub\components\InstallationState::STATE_INSTALLED)) {
    if ($app->runAction('installer/install-db') !== 0) { throw new RuntimeException('Core migration failed'); }
    if ($app->runAction('installer/write-site-config', ['HumHub 免费模块预览', 'admin@localhost.test']) !== 0) { throw new RuntimeException('Site configuration failed'); }
}
if (!humhub\modules\user\models\User::find()->where(['username' => $credentials['admin_username']])->exists()) {
    $app->runAction('installer/create-admin-account', [$credentials['admin_username'], $credentials['admin_email'], $credentials['admin_password']]);
}
$app->settings->set('name', 'HumHub 免费模块预览');
$app->settings->set('baseUrl', 'http://127.0.0.1:8090');
$app->getModule('user')->settings->set('auth.allowGuestAccess', 0);
$app->getModule('user')->settings->set('auth.anonymousRegistration', 0);
$app->getModule('friendship')->settings->set('enable', 1);
$lock = json_decode(file_get_contents(__DIR__ . '/modules.lock.json'), true, flags: JSON_THROW_ON_ERROR);
foreach ($lock['modules'] as $module) {
    // Require an administrator to enroll a second factor before enforcing it on this preview.
    if (!$module['desired_enabled'] || $module['id'] === 'twofa') { continue; }
    if ($app->runAction('module/enable', [$module['id']]) !== 0) {
        throw new RuntimeException('Could not enable module: ' . $module['id']);
    }
}
echo "Local core and selected modules configured.\n";
