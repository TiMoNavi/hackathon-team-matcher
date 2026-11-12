<?php
declare(strict_types=1);
require_once __DIR__ . '/guard.php';
$backend = dirname(__DIR__, 2);
$isolatedRuntime = $backend . '/.runtime/overnight-integration';
umask(0077);
if (is_link($backend . '/.runtime') || is_link($isolatedRuntime) || !is_dir($isolatedRuntime)
    || (fileperms($isolatedRuntime) & 0777) !== 0700) { throw new RuntimeException('Isolated runtime guard refused.'); }
foreach (['private.json', 'marker.json'] as $file) {
    $path = $isolatedRuntime . '/' . $file;
    if (!is_file($path) || is_link($path) || (fileperms($path) & 0777) !== 0600) { throw new RuntimeException('Private config guard refused.'); }
}
$isolatedConfig = json_decode(file_get_contents($isolatedRuntime . '/private.json'), true, 32, JSON_THROW_ON_ERROR);
overnightValidateConfig($isolatedConfig, $backend);
$marker = json_decode(file_get_contents($isolatedRuntime . '/marker.json'), true, 32, JSON_THROW_ON_ERROR);
foreach (['spec', 'database', 'username', 'host', 'port', 'socket', 'runtime', 'nonce'] as $key) {
    if (($marker[$key] ?? null) !== $isolatedConfig[$key]) { throw new RuntimeException('Runtime provenance mismatch.'); }
}
foreach (['runtime', 'sessions', 'assets', 'uploads', 'mail', 'cache', 'themes', 'modules', 'backups'] as $directory) {
    if (!is_dir($isolatedRuntime . '/' . $directory) || is_link($isolatedRuntime . '/' . $directory)) {
        throw new RuntimeException('Isolated directory guard refused.');
    }
}
$web = PHP_SAPI === 'cli-server';
if ($web) {
    overnightValidateRequest($_SERVER);
    $_SERVER['SCRIPT_NAME'] = '/index.php';
    $_SERVER['PHP_SELF'] = '/index.php';
    $_SERVER['SCRIPT_FILENAME'] = $isolatedRuntime . '/index.php';
} elseif (PHP_SAPI !== 'cli') { throw new RuntimeException('Unsupported isolated runtime.'); }
foreach (['curl_exec', 'curl_multi_exec', 'fsockopen', 'pfsockopen', 'stream_socket_client', 'mail'] as $function) {
    if (function_exists($function)) { throw new RuntimeException('Use harness.py to apply the isolated network restrictions.'); }
}
if (filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN)) { throw new RuntimeException('URL streams must be disabled.'); }
foreach (array_keys($_ENV) as $key) {
    if (str_starts_with($key, 'HUMHUB_') || str_starts_with($key, 'MATCHER_')) { unset($_ENV[$key]); }
}
// Verify provenance with the limited user before Yii or any application bootstrap.
$dsn = 'mysql:unix_socket=' . $isolatedConfig['socket'] . ';dbname=' . $isolatedConfig['database'];
$probe = new PDO($dsn, $isolatedConfig['username'], $isolatedConfig['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
if ($probe->query('SELECT DATABASE()')->fetchColumn() !== $isolatedConfig['database']) { throw new RuntimeException('Connected database mismatch.'); }
$identity = $probe->query('SELECT spec,nonce FROM _overnight_n01_guard WHERE id=1')->fetch(PDO::FETCH_ASSOC);
if (!$identity || $identity['spec'] !== $isolatedConfig['spec'] || !hash_equals($identity['nonce'], $isolatedConfig['nonce'])) {
    throw new RuntimeException('Database provenance mismatch.');
}
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
$config['runtimePath'] = $isolatedRuntime . '/runtime';
$config['vendorPath'] = $backend . '/protected/vendor';
$config['aliases']['@config'] = $isolatedRuntime;
$config['aliases']['@webroot'] = $isolatedRuntime;
$config['params']['moduleAutoloadPaths'] = ['@humhub/modules', $isolatedRuntime . '/modules'];
$config['components']['db'] = ['class' => yii\db\Connection::class, 'dsn' => $dsn,
    'username' => $isolatedConfig['username'], 'password' => $isolatedConfig['password'], 'charset' => 'utf8mb4',
    'enableLogging' => false, 'enableProfiling' => false, 'enableSchemaCache' => false,
    'on afterOpen' => ['humhub\libs\Helpers', 'SqlMode']];
$config['components']['log'] = ['class' => humhub\components\log\Dispatcher::class,
    'targets' => [['class' => yii\log\DbTarget::class, 'enabled' => false, 'logVars' => []]]];
$config['components']['cache'] = ['class' => yii\caching\FileCache::class, 'cachePath' => $isolatedRuntime . '/cache'];
$config['components']['mailer']['useFileTransport'] = true;
$config['components']['mailer']['fileTransportPath'] = $isolatedRuntime . '/mail';
$config['components']['assetManager']['basePath'] = $isolatedRuntime . '/assets';
$config['components']['assetManager']['baseUrl'] = '/assets';
$config['components']['assetManager']['linkAssets'] = false;
$config['components']['fs']['mounts']['assets']['path'] = $isolatedRuntime . '/assets';
$config['components']['fs']['mounts']['data']['path'] = $isolatedRuntime . '/uploads';
$config['components']['urlManager']['enablePrettyUrl'] = true;
$config['components']['urlManager']['showScriptName'] = false;
$config['components']['urlManager']['baseUrl'] = '';
if ($web) {
    $config['components']['request']['cookieValidationKey'] = $isolatedConfig['cookie_key'];
    $config['components']['request']['scriptUrl'] = '/index.php';
    $config['components']['request']['baseUrl'] = '';
    $config['components']['request']['parsers'] = ['application/json' => yii\web\JsonParser::class];
    $config['components']['session'] = ['class' => yii\web\Session::class, 'savePath' => $isolatedRuntime . '/sessions', 'name' => 'overnight_n01_session'];
    $config['components']['user']['enableAutoLogin'] = false;
    $config['components']['user']['identityCookie']['name'] = 'overnight_n01_identity';
}
$app = $web ? new humhub\components\Application($config) : new humhub\components\console\Application($config);
if ($app->db->createCommand('SELECT DATABASE()')->queryScalar() !== $isolatedConfig['database']) { throw new RuntimeException('Application database mismatch.'); }
return $app;
