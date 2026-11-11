<?php
declare(strict_types=1);

// R1 native registration in an isolated in-memory Yii application. No HumHub bootstrap.
defined('YII_ENABLE_ERROR_HANDLER') || define('YII_ENABLE_ERROR_HANDLER', false);
defined('YII_DEBUG') || define('YII_DEBUG', false);
defined('YII_ENV') || define('YII_ENV', 'test');
$moduleRoot = dirname(__DIR__, 2);
$backend = dirname($moduleRoot, 3);
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');

final class RecommendationTestApplication extends \yii\console\Application
{
    public array $loadedAppConfig = [];
}

final class MemoryInstallationState extends \yii\base\Component
{
    public function hasState(int $state): bool { return false; }
}

$checks = [];
$check = static function (bool $condition, string $name) use (&$checks): void {
    if (!$condition) { throw new \RuntimeException('FAIL: ' . $name); }
    $checks[] = $name;
};
$config = require $moduleRoot . '/config.php';
$info = json_decode(file_get_contents($moduleRoot . '/module.json'), true, 512, JSON_THROW_ON_ERROR);
$check(Yii::$app === null, 'config can load without an application or current user');
$check($config['id'] === $info['id'] && $config['id'] === 'matcher-recommendation', 'manifest and configuration IDs agree');
$check($config['namespace'] === 'humhub\modules\matcherRecommendation', 'native namespace is explicit');
$check($config['events'] === [] && count($config['urlManagerRules']) === 8, 'ordinary and default-disabled conversation API routes register without automatic request hooks');
$dependencies = (new \humhub\services\ModuleDependencyService($info))->getDependencies();
$check($dependencies === ['matcher-user-profile' => ['minVersion' => '0.8.0'], 'matcher-profile-privacy' => ['minVersion' => '0.1.0']], 'native dependency parser requires reviewed P1/P8 and no AI or rest module');
$check($info['humhub']['minVersion'] === '1.19.4', 'local supported HumHub baseline is explicit');

$dbAccesses = 0;
$app = new RecommendationTestApplication([
    'id' => 'recommendation-r1-memory-registration',
    'basePath' => $moduleRoot,
    'vendorPath' => $backend . '/protected/vendor',
    'runtimePath' => $moduleRoot . '/tests',
    'bootstrap' => [],
    'extensions' => [],
    'components' => [
        'installationState' => MemoryInstallationState::class,
        'cache' => \yii\caching\ArrayCache::class,
        'runtimeCache' => \yii\caching\ArrayCache::class,
        'log' => ['targets' => []],
        'db' => static function () use (&$dbAccesses): never {
            ++$dbAccesses;
            throw new \RuntimeException('Database access is forbidden in the R1 module test.');
        },
    ],
]);
$manager = new \humhub\components\ModuleManager();
$check($manager->register($moduleRoot, $config) === $config['id'], 'real ModuleManager accepts the module configuration');
$check(!$app->hasModule($config['id']), 'unenabled module remains dormant');
$check(Yii::getAlias('@humhub/modules/matcherRecommendation') === $moduleRoot, 'native manager registers namespace alias');

// This only modifies ModuleManager's in-process array, not module_enabled or settings.
$manager->markAsEnabled($config['id']);
$manager->register($moduleRoot, $config);
$check($app->hasModule($config['id']), 'in-memory activation registers the module in Yii');
$module = $app->getModule($config['id']);
$check($module instanceof \humhub\modules\matcherRecommendation\Module, 'actual recommendation Module loads');
$check($module instanceof \humhub\components\Module, 'module inherits the actual HumHub base class');
$check($module->getBasePath() === $moduleRoot, 'native module base path matches its independent directory');
$check($module->getVersion() === '0.3.0', 'native module reads its own manifest');
$check(isset($module->getComponents(true)['settings']) && !isset($module->getComponents(false)['settings']), 'native settings component remains lazy');
$check(!$module->hasDiscoveryService(), 'production service is unavailable until explicitly wired');
try {
    $module->getDiscoveryService();
    $check(false, 'missing adapters must not return a fake service');
} catch (\RuntimeException $error) {
    $check($error->getMessage() === 'Recommendation dependencies are not configured.', 'missing production dependencies fail explicitly');
}
$check(!$app->hasModule('matcher-user-profile'), 'registration does not load P1 or its native-controller overrides');
$check(!$app->hasModule('matcher-recommendation-ai'), 'registration does not need an AI module');

// Only the test composition root supplies synthetic adapters. Module never imports this factory.
require_once $moduleRoot . '/tests/support/autoload.php';
$fixture = \humhub\modules\matcherRecommendation\tests\support\FixtureEnvironment::create();
$service = $fixture->service();
$module->setDiscoveryService($service);
$check($module->hasDiscoveryService() && $module->getDiscoveryService() === $service, 'host explicitly injects the complete application service');
$result = $module->getDiscoveryService()->execute(1, $fixture::query(), 7);
$check(array_map(static fn($item): string => $item->candidate->targetId, $result->items) === ['102', '103', '101'], 'registered module executes the synthetic rule use case');
$check($fixture->relationships->historyCalls === 0 && $fixture->relationships->capabilityCalls === 0, 'ordinary discovery does not need AI contact-history capability');
$check(!isset($module->getComponents(false)['settings']), 'executing injected pure service keeps native settings lazy');
$check($dbAccesses === 0, 'configuration and registration never access the database');

echo json_encode([
    'status' => 'passed', 'phase' => 'R1 native registration only', 'checks' => count($checks),
    'passed' => $checks, 'database_calls' => $dbAccesses, 'model_calls' => 0,
    'production_configuration_loaded' => false, 'persistent_enable_called' => false,
    'http_or_database_integration_test' => false,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
Yii::$app = null;
