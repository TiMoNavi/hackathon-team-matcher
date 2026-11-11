<?php
declare(strict_types=1);

use humhub\components\console\Application;
use humhub\models\ModuleEnabled;
use humhub\modules\matcherProfile\Module;
use humhub\modules\matcherProfile\adapters\identity\NativeDisplayName;
use humhub\modules\user\models\Profile;
use humhub\modules\user\models\User;
use humhub\services\BootstrapService;
use yii\base\Event;
use yii\caching\ArrayCache;
use yii\db\JsonExpression;
use yii\db\Query;

// A disposable clone is mandatory. Configuration is retargeted before any Application exists.
$target = $argv[1] ?? '';
if (!preg_match('/^humhub_profile_s1_test_[a-z0-9_]+$/D', $target)) {
    fwrite(STDERR, 'Usage: php native_module.php humhub_profile_s1_test_<suffix>' . PHP_EOL);
    exit(2);
}
$backend = dirname(__DIR__, 5);
$moduleRoot = dirname(__DIR__, 2);
defined('YII_DEBUG') || define('YII_DEBUG', false);
defined('YII_ENV') || define('YII_ENV', 'prod');
$loader = require $backend . '/protected/vendor/autoload.php';
Dotenv\Dotenv::createMutable($backend, '.env')->safeLoad();
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
$loader->addClassMap(['humhub\services\BootstrapService' => $backend . '/protected/humhub/services/BootstrapService.php']);
$bootstrap = new BootstrapService();
$originalConfig = $bootstrap->getConfig('console');
$originalDsn = $originalConfig['components']['db']['dsn'] ?? '';
$testDsn = preg_replace('/dbname=[^;]*/', 'dbname=' . $target, $originalDsn, 1, $replaced);
if ($replaced !== 1 || $testDsn === $originalDsn || !str_starts_with($testDsn, 'mysql:')) {
    throw new RuntimeException('A distinct MySQL test database is required.');
}
$_ENV['HUMHUB_CONFIG__COMPONENTS__DB__DSN'] = $testDsn;
$makeApp = static function () use ($bootstrap, $testDsn, $target): Application {
    $config = $bootstrap->getConfig('console');
    $config['components']['db']['dsn'] = $testDsn;
    $config['components']['db']['enableSchemaCache'] = false;
    $config['components']['db']['enableLogging'] = false;
    $config['components']['db']['enableProfiling'] = false;
    $config['components']['cache'] = ['class' => ArrayCache::class];
    $config['components']['runtimeCache'] = ['class' => ArrayCache::class];
    $config['components']['log']['targets'] = [];
    $app = new Application($config);
    if ($app->db->createCommand('SELECT DATABASE()')->queryScalar() !== $target) {
        throw new RuntimeException('Test database verification failed.');
    }
    return $app;
};

$passed = [];
$current = 'bootstrap_clone';
$transaction = null;
$assert = static function (bool $condition, string $label) use (&$passed, &$current): void {
    $current = $label;
    if (!$condition) { throw new RuntimeException('Assertion failed: ' . $label); }
    $passed[] = $label;
};
$reject = static function (callable $operation, string $label, string $exceptionClass = LogicException::class) use ($assert): void {
    try { $operation(); } catch (Throwable $error) {
        if ($error instanceof $exceptionClass) { $assert(true, $label); return; }
        throw $error;
    }
    $assert(false, $label);
};
$uuid = static function (): string {
    $h = bin2hex(random_bytes(16));
    return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-4' . substr($h, 13, 3) . '-a' . substr($h, 17, 3) . '-' . substr($h, 20, 12);
};

try {
    $app = $makeApp();
    $db = $app->db;
    $originalColumns = array_keys($db->schema->getTableSchema(Profile::tableName(), true)->columns);
    $nativeBefore = (new Query())->select($originalColumns)->from(Profile::tableName())->orderBy('user_id')->all($db);
    $current = 'native_module_register';
    $registered = $app->moduleManager->register($moduleRoot);
    $assert($registered === 'matcher-user-profile', 'native_module_registered');
    $module = $app->moduleManager->getModule('matcher-user-profile');
    $assert($module instanceof Module, 'native_manager_instantiates_module');
    $current = 'native_module_enable';
    $enabled = $module->enable();
    $assert($enabled !== false && ModuleEnabled::find()->where(['module_id' => 'matcher-user-profile'])->exists(), 'native_enable_records_module');
    foreach (['state', 'attribute', 'revision', 'draft'] as $name) {
        $assert($db->schema->getTableSchema('{{%matcher_profile_' . $name . '}}', true) !== null, 'native_enable_schema_' . $name);
    }
    $assert(Event::hasHandlers(yii\base\Application::class, yii\base\Application::EVENT_BEFORE_REQUEST), 'module_registers_request_event');

    // Rebuild Application and class-event registration to exercise a new request lifecycle.
    $current = 'fresh_application_bootstrap';
    $db->close();
    $app->errorHandler->unregister();
    Event::offAll();
    Yii::$app = null;
    $app = $makeApp();
    $db = $app->db;
    $assert($app->hasModule('matcher-user-profile'), 'fresh_application_loads_enabled_module');
    $userModule = $app->getModule('user');
    $userModule->displayNameCallback = null;
    $app->trigger(yii\base\Application::EVENT_BEFORE_REQUEST);
    $assert($userModule->displayNameCallback === [NativeDisplayName::class, 'resolve'], 'fresh_before_request_installs_identity_callback');
    $module = $app->getModule('matcher-user-profile');
    $assert($module instanceof Module, 'fresh_module_instance');
    $assert(Event::hasHandlers(Profile::class, Profile::EVENT_AFTER_VALIDATE), 'native_profile_validation_event_registered');
    $table = static fn(string $name): string => $db->tablePrefix . $name;
    $stateTable = $table('matcher_profile_state');
    $attributeTable = $table('matcher_profile_attribute');
    $assert((int)(new Query())->from($stateTable)->count('*', $db) === 0, 'fixture_requires_empty_profile_states');
    $userId = (int)(new Query())->select('id')->from(User::tableName())->orderBy('id')->scalar($db);
    $spaceId = (int)(new Query())->select('id')->from(humhub\modules\space\models\Space::tableName())->orderBy('id')->scalar($db);
    $assert($userId > 0 && $spaceId > 0, 'clone_has_native_user_and_space');
    $user = User::findOne($userId);
    $neutral = '成员·' . substr((string)$user->guid, -8);
    $readName = static function () use ($app, $userId): string {
        $app->runtimeCache->flush();
        return User::findOne($userId)->getDisplayName();
    };
    $assert($readName() === $neutral, 'empty_state_uses_neutral_name');
    $assert(NativeDisplayName::resolve(new User()) === '新成员', 'unsaved_user_uses_transient_name');

    $transaction = $db->beginTransaction();
    $current = 'synthetic_identity_fixtures';
    $now = '2026-11-11 00:00:00.000000';
    $stateId = $uuid(); $eventStateId = $uuid(); $nicknameId = $uuid();
    $db->createCommand()->update(Profile::tableName(), ['matcher_nickname' => '合成确认昵称'], ['user_id' => $userId])->execute();
    $assert($readName() === $neutral, 'raw_native_nickname_is_not_confirmation');
    $db->createCommand()->insert($stateTable, ['id' => $stateId, 'user_id' => $userId, 'scope_key' => 'global', 'identity_version' => 1, 'confirmed_avatar_ref' => 'synthetic/avatar-reference', 'created_at' => $now, 'updated_at' => $now])->execute();
    $assert($readName() === $neutral, 'avatar_version_alone_does_not_confirm_nickname');
    $db->createCommand()->insert($stateTable, ['id' => $eventStateId, 'user_id' => $userId, 'scope_key' => 'space:' . $spaceId, 'space_id' => $spaceId, 'created_at' => $now, 'updated_at' => $now])->execute();
    $db->createCommand()->insert($attributeTable, ['attribute_id' => $uuid(), 'state_id' => $eventStateId, 'scope_key' => 'space:' . $spaceId, 'field_key' => 'nickname', 'storage_kind' => 'inline', 'value_json' => new JsonExpression('合成活动内值'), 'visibility' => 'authenticated', 'confirmation' => 'confirmed', 'last_confirmed_at' => $now])->execute();
    $assert($readName() === $neutral, 'event_inline_value_cannot_be_identity_marker');
    $db->createCommand()->insert($attributeTable, ['attribute_id' => $nicknameId, 'state_id' => $stateId, 'scope_key' => 'global', 'field_key' => 'nickname', 'storage_kind' => 'native', 'native_binding' => 'nickname', 'visibility' => 'authenticated', 'confirmation' => 'draft'])->execute();
    $assert($readName() === $neutral, 'draft_nickname_marker_does_not_disclose');
    $db->createCommand()->update($attributeTable, ['confirmation' => 'confirmed', 'last_confirmed_at' => $now], ['attribute_id' => $nicknameId])->execute();
    $assert($readName() === '合成确认昵称', 'confirmed_nickname_appears_through_native_user');
    $db->createCommand()->update($attributeTable, ['visibility' => 'private'], ['attribute_id' => $nicknameId])->execute();
    $assert($readName() === $neutral, 'private_marker_is_not_display_identity');
    $db->createCommand()->update($attributeTable, ['visibility' => 'authenticated'], ['attribute_id' => $nicknameId])->execute();
    $db->createCommand()->update($stateTable, ['identity_version' => 0], ['id' => $stateId])->execute();
    $assert($readName() === $neutral, 'identity_version_required_even_with_marker');
    $db->createCommand()->update($stateTable, ['identity_version' => 1], ['id' => $stateId])->execute();
    $reject(fn() => $db->createCommand()->update($attributeTable, ['native_binding' => 'city'], ['attribute_id' => $nicknameId])->execute(), 'wrong_nickname_binding_rejected', yii\db\Exception::class);
    $assert($readName() === '合成确认昵称', 'failed_binding_write_preserves_confirmed_identity');

    $current = 'native_name_validation';
    $profile = Profile::findOne(['user_id' => $userId]);
    $profile->scenario = Profile::SCENARIO_EDIT_PROFILE;
    $profile->firstname = str_repeat('甲', 60);
    $profile->lastname = str_repeat('乙', 60);
    $assert(!$profile->validate(['firstname', 'lastname']) && $profile->hasErrors('firstname') && $profile->hasErrors('lastname'), 'native_after_validate_rejects_combined_121');
    $profile->lastname = str_repeat('乙', 59);
    $assert($profile->validate(['firstname', 'lastname']), 'native_after_validate_accepts_combined_120');
    $profile->firstname = str_repeat('甲', 120);
    $profile->lastname = '';
    $assert($profile->validate(['firstname', 'lastname']), 'native_full_name_mode_accepts_120');
    $profile->firstname = str_repeat('甲', 70);
    $profile->lastname = str_repeat('乙', 70);
    $profile->setOldAttribute('firstname', $profile->firstname);
    $profile->setOldAttribute('lastname', $profile->lastname);
    $profile->title = '合成标题';
    $assert($profile->validate(['title']), 'unrelated_edit_does_not_reject_legacy_name');
    $profile->title = str_repeat('甲', 160);
    $assert($profile->validate(['title']), 'native_headline_accepts_160');
    $profile->title = str_repeat('甲', 161);
    $assert(!$profile->validate(['title']) && $profile->hasErrors('title'), 'native_headline_rejects_161');

    $current = 'maintenance_and_retention';
    $beforeMaintenance = [
        'states' => (new Query())->from($stateTable)->orderBy('id')->all($db),
        'attributes' => (new Query())->from($attributeTable)->orderBy('attribute_id')->all($db),
        'profile' => (new Query())->from(Profile::tableName())->where(['user_id' => $userId])->one($db),
    ];
    $module->enterMaintenance();
    $assert($module->isInMaintenance() && $app->hasModule('matcher-user-profile'), 'maintenance_retains_loaded_module');
    $assert($readName() === '合成确认昵称', 'maintenance_retains_identity_adapter');
    $module->leaveMaintenance();
    $assert(!$module->isInMaintenance(), 'maintenance_can_resume');
    $reject(fn() => $module->disable(), 'ordinary_disable_is_refused');
    $assert(!$module->getModuleService()->canRemove(), 'native_remove_action_unavailable');
    $reject(fn() => $module->getModuleService()->remove(), 'ordinary_remove_is_refused');
    $reject(fn() => $module->getModuleService()->remove(false), 'remove_without_disable_is_refused');
    $assert(ModuleEnabled::find()->where(['module_id' => 'matcher-user-profile'])->exists() && $app->hasModule('matcher-user-profile'), 'retention_keeps_module_enabled');
    $afterMaintenance = [
        'states' => (new Query())->from($stateTable)->orderBy('id')->all($db),
        'attributes' => (new Query())->from($attributeTable)->orderBy('attribute_id')->all($db),
        'profile' => (new Query())->from(Profile::tableName())->where(['user_id' => $userId])->one($db),
    ];
    $assert($beforeMaintenance === $afterMaintenance, 'maintenance_and_retention_preserve_profile_data');
    $transaction->rollBack();
    $transaction = null;
    $assert((int)(new Query())->from($stateTable)->count('*', $db) === 0, 'synthetic_state_transaction_rolled_back');
    $nativeAfter = (new Query())->select($originalColumns)->from(Profile::tableName())->orderBy('user_id')->all($db);
    $assert($nativeBefore === $nativeAfter, 'all_original_native_values_preserved');
    $assert(ModuleEnabled::find()->where(['module_id' => 'matcher-user-profile'])->exists(), 'module_enable_persists_only_in_test_clone');
    echo json_encode(['status' => 'passed', 'checks' => count($passed), 'passed' => $passed, 'synthetic_changes_rolled_back' => true, 'preview_database_connected' => false], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
} catch (Throwable $error) {
    if ($transaction?->isActive) { $transaction->rollBack(); }
    fwrite(STDERR, json_encode(['status' => 'failed', 'at' => $current, 'passed' => count($passed), 'error_type' => get_class($error), 'reason' => str_starts_with($error->getMessage(), 'Assertion failed: ') ? $error->getMessage() : 'Runtime operation failed; raw details suppressed'], JSON_UNESCAPED_UNICODE) . PHP_EOL);
    exit(1);
}
