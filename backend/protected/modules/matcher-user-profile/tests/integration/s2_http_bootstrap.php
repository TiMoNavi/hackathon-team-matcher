<?php
declare(strict_types=1);
/** Shared isolated-test bootstrap. Never includes a live-DB fallback. */
$target = getenv('MATCHER_S2_TEST_DB') ?: ($argv[1] ?? '');
if (!preg_match('/^humhub_profile_s2_test_[a-z0-9_]+$/D', $target)) { throw new RuntimeException('MATCHER_S2_TEST_DB must name an isolated S2 clone.'); }
$backend = dirname(__DIR__, 5);
$web = defined('MATCHER_S2_HTTP_WEB') && MATCHER_S2_HTTP_WEB;
defined('YII_DEBUG') || define('YII_DEBUG', false);
defined('YII_ENV') || define('YII_ENV', 'prod');
$loader = require $backend . '/protected/vendor/autoload.php';
Dotenv\Dotenv::createMutable($backend, '.env')->safeLoad();
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
$loader->addClassMap(['humhub\services\BootstrapService' => $backend . '/protected/humhub/services/BootstrapService.php']);
$bootstrap = new humhub\services\BootstrapService();
$config = $bootstrap->getConfig($web ? 'web' : 'console');
$dsn = $config['components']['db']['dsn'];
$testDsn = preg_replace('/dbname=[^;]*/', 'dbname=' . $target, $dsn, 1, $replaced);
if ($replaced !== 1 || $testDsn === $dsn) { throw new RuntimeException('A distinct test clone is required.'); }
$config['components']['db']['dsn'] = $testDsn;
$_ENV['HUMHUB_CONFIG__COMPONENTS__DB__DSN'] = $testDsn;
$config['components']['db']['enableSchemaCache'] = false;
$config['components']['db']['enableLogging'] = false;
$config['components']['db']['enableProfiling'] = false;
$config['components']['cache'] = ['class' => yii\caching\ArrayCache::class];
$config['components']['runtimeCache'] = ['class' => yii\caching\ArrayCache::class, 'serializer' => false];
$config['components']['log']['targets'] = [];
$runtime = $backend . '/.runtime/profile-s2-http/' . $target;
if (!is_dir($runtime)) { mkdir($runtime, 0700, true); }
$config['runtimePath'] = $runtime;
if ($web) {
    $sessionPath = $runtime . '/sessions'; if (!is_dir($sessionPath)) { mkdir($sessionPath, 0700, true); }
    $config['components']['session']['name'] = 'S2TEST' . substr(hash('sha256', $target), 0, 10);
    $config['components']['session']['savePath'] = $sessionPath;
    $config['components']['request']['scriptUrl'] = '/index.php';
    $config['components']['request']['scriptFile'] = $backend . '/index.php';
    $app = new humhub\components\Application($config);
} else { $app = new humhub\components\console\Application($config); }
if ($app->db->createCommand('SELECT DATABASE()')->queryScalar() !== $target) { throw new RuntimeException('Test clone mismatch.'); }
$module = $app->getModule('matcher-user-profile');
$module->mediaStoragePath = $runtime . '/media';
return $app;
