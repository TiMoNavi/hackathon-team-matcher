<?php
declare(strict_types=1);
// This test root is never loaded by a production config. Validate every target before bootstrap.
$backend = dirname(__DIR__, 5);
$auditRuntime = $backend . '/.runtime/recommendation-integration-audit';
umask(0077);
$auditConfig = json_decode(file_get_contents($auditRuntime . '/private.json'), true, 32, JSON_THROW_ON_ERROR);
if ($auditConfig['database'] !== 'humhub_recommendation_it_audit_20261112_7f2c9a'
    || $auditConfig['username'] !== 'reco_audit_7f2c9a' || $auditConfig['socket'] !== $backend . '/.runtime/mysql.sock'
    || $auditConfig['host'] !== '127.0.0.1' || $auditConfig['port'] !== 8112
    || (fileperms($auditRuntime) & 0777) !== 0700 || (fileperms($auditRuntime . '/private.json') & 0777) !== 0600) { throw new RuntimeException('Audit isolation target mismatch'); }
$web = PHP_SAPI === 'cli-server';
if ($web && (($_SERVER['HTTP_HOST'] ?? '') !== '127.0.0.1:8112' || ($_SERVER['SERVER_PORT'] ?? '') != '8112' || ($_SERVER['REMOTE_ADDR'] ?? '') !== '127.0.0.1')) { http_response_code(403); exit('Audit target refused'); }
if($web) { $_SERVER['SCRIPT_NAME']='/index.php'; $_SERVER['PHP_SELF']='/index.php'; $_SERVER['SCRIPT_FILENAME']=$auditRuntime.'/index.php'; }
foreach (array_keys($_ENV) as $key) { if (str_starts_with($key, 'HUMHUB_')) { unset($_ENV[$key]); } }
defined('YII_DEBUG') || define('YII_DEBUG', false);
defined('YII_ENV') || define('YII_ENV', 'test');
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@vendor', $backend . '/protected/vendor');
$config = yii\helpers\ArrayHelper::merge(require $backend . '/protected/humhub/config/common.php', require $backend . '/protected/humhub/config/' . ($web ? 'web' : 'console') . '.php');
$config['runtimePath'] = $auditRuntime . '/runtime';
$config['vendorPath'] = $backend . '/protected/vendor';
$config['aliases']['@config'] = $auditRuntime;
$config['aliases']['@webroot'] = $auditRuntime;
$config['params']['moduleAutoloadPaths'] = ['@humhub/modules', $auditRuntime . '/modules'];
$config['components']['db'] = ['class'=>yii\db\Connection::class, 'dsn'=>'mysql:unix_socket=' . $auditConfig['socket'] . ';dbname=' . $auditConfig['database'], 'username'=>$auditConfig['username'], 'password'=>$auditConfig['password'], 'charset'=>'utf8mb4', 'enableLogging'=>false, 'enableProfiling'=>false, 'enableSchemaCache'=>false];
$config['components']['db']['on afterOpen'] = ['humhub\libs\Helpers', 'SqlMode'];
$config['components']['log'] = ['class'=>humhub\components\log\Dispatcher::class,'targets'=>[['class'=>yii\log\DbTarget::class,'enabled'=>false,'logVars'=>[]]]];
$config['components']['cache'] = ['class'=>yii\caching\FileCache::class,'cachePath'=>$auditRuntime . '/cache'];
$config['components']['mailer']['useFileTransport'] = true;
$config['components']['mailer']['fileTransportPath'] = $auditRuntime . '/mail';
$config['components']['assetManager']['basePath'] = $auditRuntime . '/assets';
$config['components']['assetManager']['baseUrl'] = '/assets';
$config['components']['fs']['mounts']['assets']['path'] = $auditRuntime . '/assets';
$config['components']['fs']['mounts']['data']['path'] = $auditRuntime . '/uploads';
$config['components']['urlManager']['enablePrettyUrl'] = true;
$config['components']['urlManager']['showScriptName'] = false;
$config['components']['urlManager']['baseUrl'] = '';
if ($web) {
    require_once __DIR__.'/ErrorHandler.php';
    $config['components']['errorHandler']['class']=AuditErrorHandler::class;
    $config['components']['request']['cookieValidationKey'] = $auditConfig['cookie_key'];
    $config['components']['request']['scriptUrl'] = '/index.php';
    $config['components']['request']['baseUrl'] = '';
    $config['components']['request']['parsers'] = ['application/json'=>yii\web\JsonParser::class];
    $config['components']['session'] = ['class'=>yii\web\Session::class,'savePath'=>$auditRuntime . '/sessions','name'=>'recommendation_audit'];
    $config['components']['user']['enableAutoLogin'] = false;
    $config['components']['user']['identityCookie']['name'] = 'recommendation_audit_identity';
}
$app = $web ? new humhub\components\Application($config) : new humhub\components\console\Application($config);
foreach (['matcher-user-profile','matcher-profile-privacy','matcher-recommendation','matcher-recommendation-ai'] as $id) { if(!$app->moduleManager->hasModule($id)) { $app->moduleManager->register($backend . '/protected/modules/' . $id); } }
if ($app->db->createCommand('SELECT DATABASE()')->queryScalar() !== $auditConfig['database']) { throw new RuntimeException('Connected database mismatch'); }
return $app;
