<?php
declare(strict_types=1);
$root=getenv('MATCHER_REVIEW_ROOT')?:'/Users/550m/code/hackathon-team-matcher';
require $root.'/backend/protected/vendor/autoload.php';require $root.'/backend/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub',$root.'/backend/protected/humhub');
foreach(['matcherAuth'=>'matcher-auth','matcherRecommendation'=>'matcher-recommendation','matcherProfile'=>'matcher-user-profile','matcherPrivacy'=>'matcher-profile-privacy'] as $ns=>$dir)Yii::setAlias('@humhub/modules/'.$ns,$root.'/backend/protected/modules/'.$dir);
