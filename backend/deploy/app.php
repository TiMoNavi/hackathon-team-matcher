<?php
// Shared bootstrap for CLI-only local preview utilities.
$root = dirname(__DIR__);
define('YII_DEBUG', false);
define('YII_ENV', 'prod');
$loader = require $root . '/protected/vendor/autoload.php';
Dotenv\Dotenv::createMutable($root, '.env')->safeLoad();
require $root . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $root . '/protected/humhub');
$loader->addClassMap(['humhub\\services\\BootstrapService' => $root . '/protected/humhub/services/BootstrapService.php']);
$bootstrap = new humhub\services\BootstrapService();
$app = new humhub\components\console\Application($bootstrap->getConfig('console'));
return $app;
