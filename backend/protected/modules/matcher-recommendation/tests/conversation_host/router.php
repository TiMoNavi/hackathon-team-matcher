<?php
declare(strict_types=1);
$app=require __DIR__.'/bootstrap.php';
require __DIR__.'/TestPorts.php';
$mode=\humhub\modules\matcherRecommendation\tests\conversation_host\State::mode();
$core=$app->getModule('matcher-recommendation'); $ai=$app->getModule('matcher-recommendation-ai');
if($mode['history']??false) { $core->setConversationDependencies(new \humhub\modules\matcherRecommendation\tests\conversation_host\History(),new \humhub\modules\matcherRecommendation\tests\conversation_host\Platform()); }
if(($mode['provider']??true) && $ai!==null) { $ai->configureConversationProvider(new \humhub\modules\matcherRecommendation\tests\conversation_host\Provider(),'audit-config-v1'); }
$app->run();
