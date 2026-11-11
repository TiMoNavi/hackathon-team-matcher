<?php
declare(strict_types=1);
// Real Yii URL rules from both modules, with no bootstrap, DB, session or application configuration.
$backend = dirname(__DIR__, 5);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
$modules = $backend . '/protected/modules';
foreach (['matcherProfile' => 'matcher-user-profile', 'matcherRecommendation' => 'matcher-recommendation'] as $ns => $directory) { Yii::setAlias('@humhub/modules/' . $ns, $modules . '/' . $directory); }
$configs = [require $modules . '/matcher-user-profile/config.php', require $modules . '/matcher-recommendation/config.php'];
$checks = [];
foreach ([$configs, array_reverse($configs)] as $order) {
    $manager = new yii\web\UrlManager(['enablePrettyUrl' => true, 'showScriptName' => false, 'enableStrictParsing' => true, 'cache' => false]);
    foreach ($order as $config) { $manager->addRules($config['urlManagerRules'], false); }
    foreach ([
        ['api/v1/me/current-event', 'matcher-recommendation/api/current-event', []],
        ['api/v1/me/events/7/discovery-settings', 'matcher-recommendation/api/discovery-settings', ['spaceId' => '7']],
        ['api/v1/events/7/discovery', 'matcher-recommendation/api/discovery', ['spaceId' => '7']],
        ['api/v1/events/7/discovery/people/81', 'matcher-recommendation/api/person', ['spaceId' => '7', 'ownerId' => '81']],
        ['api/v1/events/7/recommendation-conversations', 'matcher-recommendation/conversation/create', ['spaceId' => '7']],
        ['api/v1/recommendation-conversations/conversation-' . str_repeat('a', 64), 'matcher-recommendation/conversation/read', ['id' => 'conversation-' . str_repeat('a', 64)]],
        ['api/v1/recommendation-conversations/conversation-' . str_repeat('b', 32) . '/turns', 'matcher-recommendation/conversation/turn', ['id' => 'conversation-' . str_repeat('b', 32)]],
        ['api/v1/recommendation-conversations/conversation-' . str_repeat('b', 32) . '/requirements/confirm', 'matcher-recommendation/conversation/confirm', ['id' => 'conversation-' . str_repeat('b', 32)]],
        ['api/v1/me', 'matcher-user-profile/api/me', []],
        ['api/v1/me/profile', 'matcher-user-profile/api/profile', []],
        ['api/v1/me/events/7/profile-context', 'matcher-user-profile/api/context', ['spaceId' => '7']],
        ['api/v1/me/profile/preview', 'matcher-profile-privacy/api/preview', []],
        ['api/v1/me/contacts', 'matcher-profile-privacy/api/my-contacts', []],
        ['api/v1/me/profile/source-capabilities', 'matcher-user-profile/source/capabilities', []],
        ['api/v1/me/profile/ai-capabilities', 'matcher-onboarding/api/ai-capabilities', []],
        ['api/v1/me/current-event/extra', 'matcher-user-profile/api/not-found', ['unknown' => 'current-event/extra']],
        ['api/v1/me/events/7/discovery-settings/extra', 'matcher-user-profile/api/not-found', ['unknown' => 'events/7/discovery-settings/extra']],
        ['api/v1/me/events/invalid/discovery-settings', 'matcher-user-profile/api/not-found', ['unknown' => 'events/invalid/discovery-settings']],
        ['api/v1/me/not-an-endpoint', 'matcher-user-profile/api/not-found', ['unknown' => 'not-an-endpoint']],
    ] as [$path, $route, $params]) {
        $request = new yii\web\Request(['scriptUrl' => '/index.php', 'baseUrl' => '', 'hostInfo' => 'http://synthetic.invalid']);
        $request->setPathInfo($path); $result = $manager->parseRequest($request);
        if ($result !== [$route, $params]) { throw new RuntimeException('Unexpected route: ' . $path . ' ' . json_encode($result)); }
        $checks[] = $order[0]['id'] . ' first: ' . $path;
    }
}
echo json_encode(['status' => 'passed', 'checks' => count($checks), 'passed' => $checks, 'database_calls' => 0, 'llm_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
