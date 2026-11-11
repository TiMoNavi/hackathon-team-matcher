<?php
declare(strict_types=1);
/** Independent synthetic-only SQL fixture controls for the allocated S7 audit clone. */
$target = getenv('MATCHER_S7_TEST_DB') ?: ($argv[1] ?? '');
if ($target !== 'humhub_profile_s7_test_audit_c51bb175') { throw new RuntimeException('Use only the specifically allocated S7 audit database.'); }
$app = require dirname(__DIR__, 2) . '/matcher-onboarding/tests/integration/s7_http_bootstrap.php';
use yii\db\Query;
use humhub\modules\matcherProfile\domain\ProfileScope;

$names = array_map(static fn(int $n): string => sprintf('s7_sim_%03d', $n), range(1, 100));
$rows = (new Query())->select(['id', 'username', 'contentcontainer_id'])->from('{{%user}}')->where(['username' => $names])->all($app->db);
$users = [];
foreach ($rows as $row) {
    if (!preg_match('/^s7_sim_(\d{3})$/D', $row['username'], $match)) { throw new RuntimeException('Unexpected synthetic user namespace.'); }
    $number = (int)$match[1]; if ($number < 1 || $number > 100) { throw new RuntimeException('Unexpected synthetic user number.'); }
    $users[$number] = ['id' => (int)$row['id'], 'container' => (int)$row['contentcontainer_id']];
}
ksort($users); if (array_keys($users) !== range(1, 100)) { throw new RuntimeException('All 100 synthetic users must be installed before audit.'); }
$dataset = json_decode(file_get_contents(dirname(__DIR__, 5) . '/docs/用户画像收集/examples/s7-people_2026-11-12.json'), true, 512, JSON_THROW_ON_ERROR);
$spaces = [];
foreach ($dataset['spaces'] as $key => $info) {
    $matched = (new Query())->select(['id', 'contentcontainer_id'])->from('{{%space}}')->where(['name' => $info['name']])->all($app->db);
    if (count($matched) !== 1) { throw new RuntimeException('The dedicated synthetic Space must be unambiguous.'); }
    $spaces[$key] = ['id' => (int)$matched[0]['id'], 'container' => (int)$matched[0]['contentcontainer_id']];
}
$action = $argv[2] ?? 'metadata'; $value = $argv[3] ?? '';
$viewer = $users[81]['id']; $peer = $users[82]['id']; $candidate = $users[83]['id'];
if ($action === 'metadata') {
    $counts = [];
    foreach ($spaces as $key => $space) {
        $counts[$key] = [
            'members' => (int)(new Query())->from('{{%space_membership}}')->where(['space_id' => $space['id'], 'user_id' => array_column($users, 'id'), 'status' => 3])->count('*', $app->db),
            'optin' => (int)(new Query())->from('{{%matcher_recommendation_discovery_settings}}')->where(['space_id' => $space['id'], 'owner_id' => array_column($users, 'id'), 'discoverable' => 1])->count('*', $app->db),
        ];
    }
    $jobs = (int)(new Query())->from('{{%matcher_profile_ai_job}}')->where(['owner_id' => array_column($users, 'id')])->count('*', $app->db);
    $states = (new Query())->select('id')->from('{{%matcher_profile_state}}')->where(['user_id' => array_column($users, 'id')])->column($app->db);
    $profileCounts = [
        'states' => count($states),
        'confirmed_attributes_including_nickname' => (int)(new Query())->from('{{%matcher_profile_attribute}}')->where(['state_id' => $states, 'confirmation' => 'confirmed'])->count('*', $app->db),
        'nickname_attributes' => (int)(new Query())->from('{{%matcher_profile_attribute}}')->where(['state_id' => $states, 'field_key' => 'nickname', 'confirmation' => 'confirmed'])->count('*', $app->db),
        'editing_drafts' => (int)(new Query())->from('{{%matcher_profile_draft}}')->where(['state_id' => $states, 'status' => 'editing'])->count('*', $app->db),
    ];
    echo json_encode(['status' => 'ok', 'database' => $target, 'users' => array_map(static fn(array $u): int => $u['id'], $users), 'spaces' => array_map(static fn(array $s): int => $s['id'], $spaces), 'counts' => $counts, 'profile_counts' => $profileCounts, 'synthetic_ai_jobs' => $jobs], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
    exit;
}
if ($action === 'default_settings_probe') {
    $key = ['owner_id' => $users[99]['id'], 'space_id' => $spaces['primary']['id']];
    $original = (new Query())->from('{{%matcher_recommendation_discovery_settings}}')->where($key)->one($app->db);
    if (!is_array($original) || (int)$original['discoverable'] !== 0) { throw new RuntimeException('Probe is limited to the known opted-out synthetic person 99.'); }
    $selection = new class($key) implements \humhub\modules\matcherRecommendation\adapters\native\ServerSelectionSource {
        public function __construct(private readonly array $key) {}
        public function read(): array { return ['actor_id' => $this->key['owner_id'], 'space_id' => $this->key['space_id'], 'selection_revision' => 's7-audit-default-probe']; }
    };
    $events = new \humhub\modules\matcherRecommendation\adapters\native\NativeCurrentEventAccess($app->db, $selection, 's7-audit-default-policy');
    $context = $events->resolve($key['owner_id'], $key['space_id']);
    $store = new \humhub\modules\matcherRecommendation\adapters\browse\SqlDiscoverySettingsStore($app->db, $events);
    $checks = [];
    try {
        $app->db->createCommand()->delete('{{%matcher_recommendation_discovery_settings}}', $key)->execute();
        $default = $store->read($context);
        if ($default['discoverable'] !== false || $default['version'] !== 0) { throw new RuntimeException('Absent settings did not default to false/0.'); }
        $checks[] = 'absent MySQL settings default to discoverable=false/version=0';
        $created = $store->change($context, 0, true);
        if ($created['discoverable'] !== true || $created['version'] !== 1) { throw new RuntimeException('Initial explicit opt-in failed.'); }
        $checks[] = 'initial explicit opt-in creates version 1';
        $rejected = false;
        try { $store->change($context, 0, false); }
        catch (\humhub\modules\matcherRecommendation\domain\browse\DiscoveryException $error) { $rejected = $error->errorCode === 'DISCOVERY_VERSION_CONFLICT'; }
        if (!$rejected) { throw new RuntimeException('Stale first-write version was accepted.'); }
        $checks[] = 'stale expected_version=0 cannot replace initialized settings';
    } finally {
        $app->db->createCommand()->delete('{{%matcher_recommendation_discovery_settings}}', $key)->execute();
        $app->db->createCommand()->insert('{{%matcher_recommendation_discovery_settings}}', $original)->execute();
    }
    echo json_encode(['status' => 'passed', 'checks' => count($checks), 'checks_passed' => $checks], JSON_THROW_ON_ERROR) . PHP_EOL;
    exit;
}
if (in_array($action, ['relationship', 'relationship_hidden'], true)) {
    if ($action === 'relationship_hidden') { $peer = $users[8]['id']; }
    if (!in_array($value, ['none', 'pending_out', 'pending_in', 'friend'], true)) { throw new RuntimeException('Unsupported synthetic relationship state.'); }
    $app->db->createCommand()->delete('{{%user_friendship}}', ['or', ['user_id' => $viewer, 'friend_user_id' => $peer], ['user_id' => $peer, 'friend_user_id' => $viewer]])->execute();
    $links = match($value) { 'friend' => [[$viewer, $peer], [$peer, $viewer]], 'pending_out' => [[$viewer, $peer]], 'pending_in' => [[$peer, $viewer]], default => [] };
    foreach ($links as [$from, $to]) { $app->db->createCommand()->insert('{{%user_friendship}}', ['user_id' => $from, 'friend_user_id' => $to, 'created_at' => '2026-11-12 00:00:00'])->execute(); }
} elseif ($action === 'block') {
    if (!in_array($value, ['none', 'outgoing', 'incoming', 'space'], true)) { throw new RuntimeException('Unsupported synthetic block direction.'); }
    $pairs = ['outgoing' => [$users[81]['container'], $candidate], 'incoming' => [$users[83]['container'], $viewer], 'space' => [$spaces['primary']['container'], $candidate]];
    foreach ($pairs as [$container, $user]) { $app->db->createCommand()->delete('{{%contentcontainer_blocked_users}}', ['contentcontainer_id' => $container, 'user_id' => $user])->execute(); }
    if ($value !== 'none') { [$container, $user] = $pairs[$value]; $app->db->createCommand()->insert('{{%contentcontainer_blocked_users}}', ['contentcontainer_id' => $container, 'user_id' => $user])->execute(); }
} elseif ($action === 'membership') {
    if (!in_array($value, ['candidate_remove', 'candidate_restore', 'viewer_remove', 'viewer_restore'], true)) { throw new RuntimeException('Unsupported synthetic membership transition.'); }
    $who = str_starts_with($value, 'candidate') ? $candidate : $viewer;
    $app->db->createCommand()->update('{{%space_membership}}', ['status' => str_ends_with($value, 'restore') ? 3 : 2], ['user_id' => $who, 'space_id' => $spaces['primary']['id']])->execute();
} elseif ($action === 'rare_visibility') {
    if (!in_array($value, ['authenticated', 'friends', 'private'], true)) { throw new RuntimeException('Unsupported fixture visibility.'); }
    $owner = $users[100]['id']; $scope = ProfileScope::global(); $service = $app->getModule('matcher-user-profile')->getProfileService();
    $profile = $service->getProfile($owner, $owner, $scope);
    $found = array_values(array_filter($profile['attributes'], static fn(array $a): bool => $a['key'] === 'skill' && ($a['value']['code'] ?? '') === 'wasm-component-model'));
    if (count($found) !== 1) { throw new RuntimeException('Expected one synthetic rare skill.'); }
    $service->setVisibilities($owner, $owner, $scope, $profile['revision'], [['attribute_id' => $found[0]['attribute_id'], 'visibility' => $value]]);
} else { throw new RuntimeException('Unknown independent audit action.'); }
echo json_encode(['status' => 'ok', 'action' => $action, 'fixture' => $value], JSON_THROW_ON_ERROR) . PHP_EOL;
