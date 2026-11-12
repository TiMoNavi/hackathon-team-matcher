<?php
declare(strict_types=1);
require_once __DIR__ . '/guard.php';
$backend = dirname(__DIR__, 2);
$chatRuntime = $backend . '/.runtime/chat-upgrade';
umask(0077);
if (is_link($backend . '/.runtime') || !is_dir($backend . '/.runtime')) { throw new RuntimeException('Runtime parent refused.'); }
chatPrivatePath($chatRuntime, 0700, true);
foreach (['private.json', 'marker.json', 'mysql.cnf'] as $name) { chatPrivatePath($chatRuntime . '/' . $name, 0600); }
$chatConfig = json_decode(file_get_contents($chatRuntime . '/private.json'), true, 32, JSON_THROW_ON_ERROR);
chatValidateConfig($chatConfig, $backend);
$marker = json_decode(file_get_contents($chatRuntime . '/marker.json'), true, 32, JSON_THROW_ON_ERROR);
$expectedMarker = array_intersect_key($chatConfig, array_flip(['spec', 'database', 'username', 'host', 'port', 'socket', 'runtime', 'nonce']));
ksort($marker); ksort($expectedMarker);
if ($marker !== $expectedMarker) { throw new RuntimeException('Runtime provenance mismatch.'); }
foreach (['runtime', 'sessions', 'assets', 'uploads', 'mail', 'cache', 'themes', 'modules', 'backups'] as $name) {
    chatPrivatePath($chatRuntime . '/' . $name, 0700, true);
}
$moduleNames = array_values(array_diff(scandir($chatRuntime . '/modules'), ['.', '..']));
$expectedModules = $chatConfig['modules']; sort($moduleNames); sort($expectedModules);
if ($moduleNames !== $expectedModules) { throw new RuntimeException('Unexpected isolated module tree.'); }
foreach ($chatConfig['modules'] as $name) {
    $source = $backend . '/protected/modules/' . $name;
    $link = $chatRuntime . '/modules/' . $name;
    if (!is_dir($source) || is_link($source) || !is_link($link) || realpath($link) !== realpath($source)) {
        throw new RuntimeException('Fixed module source link refused.');
    }
}
$web = PHP_SAPI === 'cli-server';
if ($web) {
    chatValidateRequest($_SERVER);
    $_SERVER['SCRIPT_NAME'] = '/index.php'; $_SERVER['PHP_SELF'] = '/index.php';
    $_SERVER['SCRIPT_FILENAME'] = $chatRuntime . '/index.php';
} elseif (PHP_SAPI !== 'cli') { throw new RuntimeException('Unsupported isolated runtime.'); }
foreach (['curl_exec', 'curl_multi_exec', 'fsockopen', 'pfsockopen', 'stream_socket_client', 'mail'] as $function) {
    if (function_exists($function)) { throw new RuntimeException('Use the fixed chat harness network restrictions.'); }
}
if (filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN)) { throw new RuntimeException('URL streams must be disabled.'); }
foreach (array_keys($_ENV) as $key) {
    if (str_starts_with($key, 'HUMHUB_') || str_starts_with($key, 'MATCHER_')) { unset($_ENV[$key]); }
}
if (is_link($chatConfig['socket']) || filetype($chatConfig['socket']) !== 'socket') { throw new RuntimeException('Fixed database socket refused.'); }
$dsn = 'mysql:unix_socket=' . $chatConfig['socket'] . ';dbname=' . $chatConfig['database'];
$probe = new PDO($dsn, $chatConfig['username'], $chatConfig['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
if ($probe->query('SELECT DATABASE()')->fetchColumn() !== $chatConfig['database']
    || $probe->query('SELECT CURRENT_USER()')->fetchColumn() !== 'chat_c02@localhost') { throw new RuntimeException('Database identity mismatch.'); }
$identity = $probe->query('SELECT spec,nonce FROM _chat_c02_guard WHERE id=1')->fetch(PDO::FETCH_ASSOC);
if (!$identity || $identity['spec'] !== $chatConfig['spec'] || !hash_equals($chatConfig['nonce'], $identity['nonce'])) {
    throw new RuntimeException('Database provenance mismatch.');
}
$chatInstalled = in_array('matcher-chat', $chatConfig['modules'], true)
    && (int)$probe->query("SELECT COUNT(*) FROM module_enabled WHERE module_id='matcher-chat'")->fetchColumn() === 1;
$probe = null;
defined('YII_DEBUG') || define('YII_DEBUG', false);
defined('YII_ENV') || define('YII_ENV', 'test');
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@vendor', $backend . '/protected/vendor');
$config = yii\helpers\ArrayHelper::merge(
    require $backend . '/protected/humhub/config/common.php',
    require $backend . '/protected/humhub/config/' . ($web ? 'web' : 'console') . '.php'
);
$config['runtimePath'] = $chatRuntime . '/runtime';
$config['vendorPath'] = $backend . '/protected/vendor';
$config['aliases']['@config'] = $chatRuntime;
$config['aliases']['@webroot'] = $chatRuntime;
$config['params']['moduleAutoloadPaths'] = ['@humhub/modules', $chatRuntime . '/modules'];
$config['components']['db'] = ['class' => yii\db\Connection::class, 'dsn' => $dsn,
    'username' => $chatConfig['username'], 'password' => $chatConfig['password'], 'charset' => 'utf8mb4',
    'enableLogging' => false, 'enableProfiling' => false, 'enableSchemaCache' => false,
    'on afterOpen' => ['humhub\libs\Helpers', 'SqlMode']];
$config['components']['log'] = ['class' => humhub\components\log\Dispatcher::class,
    'targets' => [['class' => yii\log\DbTarget::class, 'enabled' => false, 'logVars' => []]]];
$config['components']['cache'] = ['class' => yii\caching\FileCache::class, 'cachePath' => $chatRuntime . '/cache'];
$config['components']['mailer']['useFileTransport'] = true;
$config['components']['mailer']['fileTransportPath'] = $chatRuntime . '/mail';
$config['components']['assetManager']['basePath'] = $chatRuntime . '/assets';
$config['components']['assetManager']['baseUrl'] = '/assets';
$config['components']['assetManager']['linkAssets'] = false;
$config['components']['fs']['mounts']['assets']['path'] = $chatRuntime . '/assets';
$config['components']['fs']['mounts']['data']['path'] = $chatRuntime . '/uploads';
// C05B owns a separate non-webroot native data mount; no existing file relocation.
$privateFiles = $backend . '/.runtime/chat-upgrade-files';
if (file_exists($privateFiles) || is_link($privateFiles)) {
    chatPrivatePath($privateFiles, 0700, true);
    chatPrivatePath($privateFiles . '/data', 0700, true);
    chatPrivatePath($privateFiles . '/marker.json', 0600);
    $filesMarker = json_decode(file_get_contents($privateFiles . '/marker.json'), true, 8, JSON_THROW_ON_ERROR);
    if ($filesMarker !== ['spec' => 'chat-c05b-files-v1', 'database' => $chatConfig['database'], 'nonce' => $chatConfig['nonce']]) {
        throw new RuntimeException('Private attachment mount provenance mismatch.');
    }
    $config['components']['fs']['mounts']['data']['path'] = $privateFiles . '/data';
}

$config['components']['urlManager']['enablePrettyUrl'] = true;
$config['components']['urlManager']['showScriptName'] = false;
$config['components']['urlManager']['baseUrl'] = '';
if ($chatInstalled) {
    // A separate derivation domain; never expose this value in a report or DTO.
    $config['modules']['matcher-chat']['integrationReady'] = true;
    $config['modules']['matcher-chat']['cursorSecret'] = hash_hkdf('sha256', $chatConfig['cookie_key'], 32, 'chat-c04-cursor-v1', $chatConfig['nonce']);
    $config['modules']['matcher-chat']['nativeTimeZone'] = 'UTC';
    $config['modules']['matcher-chat']['attachmentsEnabled'] = true; // Fixed C05B isolation only; stored opt-in stays off.
    $config['modules']['matcher-chat']['groupsEnabled'] = true; // Fixed C07A isolation only; stored opt-in stays off.
    $config['modules']['matcher-chat']['sendEnabled'] = true; // Fixed C05 isolation only; stored opt-in remains off.
    $config['modules']['matcher-chat']['entryTakeoverEnabled'] = true; // Fixed isolated target; stored opt-in stays off.
    $config['modules']['matcher-chat-ui']['readUiEnabled'] = true;
    $config['timeZone'] = 'UTC';
    if ($web) { $config['bootstrap'] = chatWebBootstrap($config['bootstrap']); }
}
if ($web) {
    $config['components']['request']['cookieValidationKey'] = $chatConfig['cookie_key'];
    $config['components']['request']['csrfParam'] = '_chat_c02_csrf';
    $config['components']['request']['csrfCookie'] = ['name' => '_chat_c02_csrf', 'httpOnly' => true, 'sameSite' => 'Lax'];
    $config['components']['request']['scriptUrl'] = '/index.php';
    $config['components']['request']['baseUrl'] = '';
    $config['components']['request']['parsers'] = ['application/json' => yii\web\JsonParser::class];
    $config['components']['session'] = ['class' => yii\web\Session::class, 'savePath' => $chatRuntime . '/sessions',
        'name' => 'chat_c02_session', 'cookieParams' => ['httpOnly' => true, 'sameSite' => 'Lax']];
    $config['components']['user']['enableAutoLogin'] = false;
    $config['components']['user']['identityCookie']['name'] = 'chat_c02_identity';
}
$app = $web ? new humhub\components\Application($config) : new humhub\components\console\Application($config);
if ($app->db->createCommand('SELECT DATABASE()')->queryScalar() !== $chatConfig['database']) { throw new RuntimeException('Application database mismatch.'); }
return $app;
