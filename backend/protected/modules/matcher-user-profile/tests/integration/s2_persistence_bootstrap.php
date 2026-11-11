<?php
declare(strict_types=1);
use humhub\components\console\Application;
use humhub\services\BootstrapService;
use yii\caching\ArrayCache;
// A disposable clone is mandatory. Configuration is retargeted before any Application exists.
$target = $argv[1] ?? '';
if (!preg_match('/^humhub_profile_s2_test_[a-z0-9_]+$/D', $target)) {
    fwrite(STDERR, 'Usage: php s2_persistence.php humhub_profile_s2_test_<suffix>' . PHP_EOL);
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

$app = $makeApp();
$db = $app->db;
