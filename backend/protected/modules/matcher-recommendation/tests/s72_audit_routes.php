<?php
declare(strict_types=1);
/** Independent real Yii route matching across all four module registration orders. */
$backend = dirname(__DIR__, 4);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
$modules = $backend . '/protected/modules'; $configs = [];
foreach (['matcherProfile' => 'matcher-user-profile', 'matcherPrivacy' => 'matcher-profile-privacy', 'matcherRecommendation' => 'matcher-recommendation', 'matcherIdeas' => 'matcher-ideas'] as $ns => $directory) {
    Yii::setAlias('@humhub/modules/' . $ns, $modules . '/' . $directory); $configs[] = require $modules . '/' . $directory . '/config.php';
}
function orders(array $rows): array { if (count($rows) < 2) { return [$rows]; } $result = []; foreach ($rows as $i => $row) { $tail = $rows; unset($tail[$i]); foreach (orders(array_values($tail)) as $order) { $result[] = [$row, ...$order]; } } return $result; }
$cases = [
    ['api/v1/me/profile/presentation', 'matcher-profile-privacy/api/presentation', []],
    ['api/v1/me/profile/relation-sharing', 'matcher-profile-privacy/api/relation-sharing', []],
    ['api/v1/events/7/profiles/81/overview', 'matcher-profile-privacy/api/overview', ['spaceId' => '7', 'ownerId' => '81']],
    ['api/v1/events/7/profiles/81/relations', 'matcher-profile-privacy/api/relations', ['spaceId' => '7', 'ownerId' => '81']],
    ['api/v1/me/ideas', 'matcher-ideas/api/me', []],
    ['api/v1/me/ideas/drafts', 'matcher-ideas/api/drafts', []],
    ['api/v1/me/ideas/drafts/12', 'matcher-ideas/api/draft', ['draftId' => '12']],
    ['api/v1/me/ideas/drafts/12/confirm', 'matcher-ideas/api/confirm', ['draftId' => '12']],
    ['api/v1/ideas/12/activities', 'matcher-ideas/api/activities', ['ideaId' => '12']],
    ['api/v1/ideas/12', 'matcher-ideas/api/idea', ['ideaId' => '12']],
    ['api/v1/idea-activities/12/messenger', 'matcher-ideas/api/messenger', ['activityId' => '12']],
    ['api/v1/idea-activities/12', 'matcher-ideas/api/activity', ['activityId' => '12']],
    ['api/v1/me/current-event', 'matcher-recommendation/api/current-event', []],
    ['api/v1/me/events/7/discovery-settings', 'matcher-recommendation/api/discovery-settings', ['spaceId' => '7']],
    ['api/v1/events/7/discovery/people/81', 'matcher-recommendation/api/person', ['spaceId' => '7', 'ownerId' => '81']],
    ['api/v1/me/profile', 'matcher-user-profile/api/profile', []],
    ['api/v1/me/contacts', 'matcher-profile-privacy/api/my-contacts', []],
    ['api/v1/me/profile/presentation/extra', 'matcher-user-profile/api/not-found', ['unknown' => 'profile/presentation/extra']],
    ['api/v1/me/profile/relation-sharing/extra', 'matcher-user-profile/api/not-found', ['unknown' => 'profile/relation-sharing/extra']],
    ['api/v1/me/ideas/drafts/invalid', 'matcher-user-profile/api/not-found', ['unknown' => 'ideas/drafts/invalid']],
    ['api/v1/me/no-such-endpoint', 'matcher-user-profile/api/not-found', ['unknown' => 'no-such-endpoint']],
];
$count = 0; $tested = [];
foreach (orders($configs) as $order) {
    $manager = new yii\web\UrlManager(['enablePrettyUrl' => true, 'showScriptName' => false, 'enableStrictParsing' => true, 'cache' => false]);
    foreach ($order as $config) { $manager->addRules($config['urlManagerRules'], false); }
    foreach ($cases as [$path, $route, $params]) {
        $request = new yii\web\Request(['scriptUrl' => '/index.php', 'baseUrl' => '', 'hostInfo' => 'http://synthetic.invalid']); $request->setPathInfo($path); $actual = $manager->parseRequest($request);
        if ($actual !== [$route, $params]) { throw new RuntimeException('Route mismatch for ' . $path . ' under ' . implode(',', array_column($order, 'id')) . ': ' . json_encode($actual)); }
        $count++;
    }
    $tested[] = array_column($order, 'id');
}
echo json_encode(['status' => 'passed', 'checks' => $count, 'registration_orders' => $tested, 'paths' => array_column($cases, 0), 'database_calls' => 0, 'network_calls' => 0, 'model_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
