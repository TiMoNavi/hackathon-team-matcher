<?php
declare(strict_types=1);
$backend = dirname(__DIR__, 4);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
Yii::setAlias('@humhub/modules/matcherAuth', dirname(__DIR__));
Yii::setAlias('@humhubContrib/auth/github', $backend . '/protected/modules/auth-github');
