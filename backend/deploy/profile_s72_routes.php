<?php
declare(strict_types=1);
// Real Yii URL rules from both modules, with no bootstrap, DB, session or application configuration.
$backend = dirname(__DIR__);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
$modules = $backend . '/protected/modules';
foreach (['matcherProfile' => 'matcher-user-profile', 'matcherRecommendation' => 'matcher-recommendation', 'matcherPrivacy' => 'matcher-profile-privacy', 'matcherIdeas' => 'matcher-ideas'] as $ns => $directory) { Yii::setAlias('@humhub/modules/' . $ns, $modules . '/' . $directory); }
$configs = [require $modules . '/matcher-user-profile/config.php', require $modules . '/matcher-recommendation/config.php', require $modules . '/matcher-profile-privacy/config.php', require $modules . '/matcher-ideas/config.php'];
$checks = [];
$permutations = static function(array $items) use (&$permutations): array {
    if (count($items) < 2) { return [$items]; }
    $result = [];
    foreach ($items as $i => $item) { $remaining = $items; unset($remaining[$i]); foreach ($permutations(array_values($remaining)) as $tail) { $result[] = [$item, ...$tail]; } }
    return $result;
};
foreach ($permutations($configs) as $order) {
    $manager = new yii\web\UrlManager(['enablePrettyUrl' => true, 'showScriptName' => false, 'enableStrictParsing' => true, 'cache' => false]);
    foreach ($order as $config) { $manager->addRules($config['urlManagerRules'], false); }
    foreach ([
        ['api/v1/me/current-event', 'matcher-recommendation/api/current-event', []],
        ['api/v1/me/events/7/discovery-settings', 'matcher-recommendation/api/discovery-settings', ['spaceId' => '7']],
        ['api/v1/events/7/discovery', 'matcher-recommendation/api/discovery', ['spaceId' => '7']],
        ['api/v1/events/7/discovery/people/81', 'matcher-recommendation/api/person', ['spaceId' => '7', 'ownerId' => '81']],
        ['api/v1/me/profile/presentation', 'matcher-profile-privacy/api/presentation', []],
        ['api/v1/me/profile/relation-sharing', 'matcher-profile-privacy/api/relation-sharing', []],
        ['api/v1/events/7/profiles/81/overview', 'matcher-profile-privacy/api/overview', ['spaceId' => '7', 'ownerId' => '81']],
        ['api/v1/events/7/profiles/81/relations', 'matcher-profile-privacy/api/relations', ['spaceId' => '7', 'ownerId' => '81']],
        ['api/v1/me/ideas', 'matcher-ideas/api/me', []],
        ['api/v1/me/ideas/drafts', 'matcher-ideas/api/drafts', []],
        ['api/v1/me/ideas/drafts/12', 'matcher-ideas/api/draft', ['draftId' => '12']],
        ['api/v1/me/ideas/drafts/12/confirm', 'matcher-ideas/api/confirm', ['draftId' => '12']],
        ['api/v1/ideas/4/activities', 'matcher-ideas/api/activities', ['ideaId' => '4']],
        ['api/v1/ideas/4', 'matcher-ideas/api/idea', ['ideaId' => '4']],
        ['api/v1/idea-activities/14/messenger', 'matcher-ideas/api/messenger', ['activityId' => '14']],
        ['api/v1/idea-activities/14', 'matcher-ideas/api/activity', ['activityId' => '14']],
        ['api/v1/me/profile/presentation/extra', 'matcher-user-profile/api/not-found', ['unknown' => 'profile/presentation/extra']],
        ['api/v1/me/ideas/drafts/12/extra', 'matcher-user-profile/api/not-found', ['unknown' => 'ideas/drafts/12/extra']],
        ['api/v1/me/ideas/drafts/invalid', 'matcher-user-profile/api/not-found', ['unknown' => 'ideas/drafts/invalid']],
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
echo json_encode(['status' => 'passed', 'module_registration_orders' => 24, 'checks' => count($checks), 'passed' => $checks, 'database_calls' => 0, 'llm_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
