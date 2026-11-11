<?php
declare(strict_types=1);
/** Independent synthetic-only SQL fixture controls for the allocated S7.2 audit clone. */
$target = getenv('MATCHER_S72_TEST_DB') ?: ($argv[1] ?? '');
if ($target !== 'humhub_profile_s72_test_audit_b0c7d9a2') { throw new RuntimeException('Use only the specifically allocated S7.2 audit database.'); }
$app = require dirname(__DIR__, 2) . '/matcher-onboarding/tests/integration/s72_http_bootstrap.php';
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
if ($action === 'fixtures') {
    // Replays clear only this audit's synthetic business fixtures in its dedicated clone.
    $oldIdeas = (new Query())->select('id')->from('{{%matcher_idea}}')->where(['creator_id' => $candidate])->andWhere(['like', 'title', 's72_audit%', false])->column($app->db);
    if ($oldIdeas !== []) {
        $oldActivities = (new Query())->select('id')->from('{{%matcher_idea_activity}}')->where(['idea_id' => $oldIdeas])->column($app->db);
        $app->db->createCommand()->delete('{{%matcher_profile_relation_sharing}}', ['owner_id' => $peer, 'kind' => 'idea_groups', 'object_id' => array_map('strval', $oldActivities)])->execute();
        $app->db->createCommand()->delete('{{%matcher_idea_conversation}}', ['activity_id' => $oldActivities])->execute();
        $app->db->createCommand()->delete('{{%matcher_idea_activity}}', ['id' => $oldActivities])->execute();
        $app->db->createCommand()->delete('{{%matcher_idea_draft}}', ['owner_id' => $candidate, 'confirmed_idea_id' => $oldIdeas])->execute();
        $app->db->createCommand()->delete('{{%matcher_idea}}', ['id' => $oldIdeas])->execute();
    }
    $app->db->createCommand()->delete('{{%matcher_profile_relation_sharing}}', ['owner_id' => $peer, 'space_id' => $spaces['primary']['id'], 'kind' => 'activities'])->execute();
    $app->db->createCommand()->delete('{{%matcher_profile_presentation}}', ['id' => $peer])->execute();
    $messages = [];
    foreach (['legal' => [$candidate, [$candidate, $peer]], 'second' => [$candidate, [$candidate, $peer]], 'wrong_creator' => [$peer, [$candidate, $peer]], 'outside_secondary' => [$candidate, [$candidate, $users[1]['id']]]] as $label => [$creator, $members]) {
        $title = 's72_audit synthetic private conversation ' . $label;
        $row = (new Query())->from('{{%message}}')->where(['title' => $title, 'created_by' => $creator])->one($app->db);
        if (!$row) { $app->db->createCommand()->insert('{{%message}}', ['title' => $title, 'created_by' => $creator, 'updated_by' => $creator, 'created_at' => '2026-11-12 00:00:00', 'updated_at' => '2026-11-12 00:00:00'])->execute(); $id = (int)$app->db->getLastInsertID(); foreach ($members as $member) { $app->db->createCommand()->insert('{{%user_message}}', ['message_id' => $id, 'user_id' => $member, 'is_originator' => $member === $creator ? 1 : 0, 'created_by' => $creator, 'updated_by' => $creator])->execute(); } }
        else { $id = (int)$row['id']; }
        $messages[$label] = $id;
    }
    $service = $app->getModule('matcher-user-profile')->getProfileService(); $scope = ProfileScope::global(); $profile = $service->getProfile($peer, $peer, $scope);
    $definitions = [
        ['key' => 'education', 'value' => ['school' => 's72_audit Selected Synthetic School']],
        ['key' => 'education', 'value' => ['school' => 's72_audit Alternate Synthetic School']],
        ['key' => 'portfolio_link', 'value' => ['url' => 'https://example.org/s72-selected', 'label' => 's72_audit Selected Synthetic Work']],
        ['key' => 'portfolio_link', 'value' => ['url' => 'https://example.org/s72-alternate', 'label' => 's72_audit Alternate Synthetic Work']],
    ];
    $ops = [];
    foreach ($definitions as $definition) { $exists = array_filter($profile['attributes'], static fn(array $a): bool => $a['key'] === $definition['key'] && $a['value'] === $definition['value']); if ($exists === []) { $ops[] = $definition; } }
    if ($ops !== []) { $draft = $service->startDraft($peer, $peer, $scope, 'manual', false); $draft = $service->updateDraft($peer, $peer, $scope, $draft['id'], $draft['draft_version'], $ops); $profile = $service->confirmDraft($peer, $peer, $scope, $draft['id'], $draft['draft_version'], $draft['base_revision'])['profile']; }
    $ids = []; foreach ($definitions as $i => $definition) { $found = array_values(array_filter($profile['attributes'], static fn(array $a): bool => $a['key'] === $definition['key'] && $a['value'] === $definition['value'])); if (count($found) !== 1) { throw new RuntimeException('Synthetic audit attribute ambiguous.'); } $ids[$i] = $found[0]['attribute_id']; }
    echo json_encode(['status' => 'ok', 'messages' => $messages, 'education' => [$ids[0], $ids[1]], 'portfolio' => [$ids[2], $ids[3]]], JSON_THROW_ON_ERROR) . PHP_EOL; exit;
}
if ($action === 'delete_selection') {
    $service = $app->getModule('matcher-user-profile')->getProfileService(); $scope = ProfileScope::global(); $profile = $service->getProfile($peer, $peer, $scope);
    $ops = [];
    foreach ($profile['attributes'] as $a) { if (($a['value']['school'] ?? '') === 's72_audit Selected Synthetic School' || ($a['value']['label'] ?? '') === 's72_audit Selected Synthetic Work') { $ops[] = ['op' => 'delete', 'attribute_id' => $a['attribute_id']]; } }
    if (count($ops) !== 2) { throw new RuntimeException('Delete is confined to exact two audit-created selected references.'); }
    $draft = $service->startDraft($peer, $peer, $scope, 'manual', false); $draft = $service->updateDraft($peer, $peer, $scope, $draft['id'], $draft['draft_version'], $ops); $service->confirmDraft($peer, $peer, $scope, $draft['id'], $draft['draft_version'], $draft['base_revision']);
    echo json_encode(['status' => 'ok', 'deleted' => 2], JSON_THROW_ON_ERROR) . PHP_EOL; exit;
}
if ($action === 'side_effects') {
    $result = [];
    foreach (['message', 'user_message', 'message_entry', 'notification', 'queue'] as $table) { if ($app->db->schema->getTableSchema($table, true) !== null) { $result[$table] = (int)(new Query())->from($table)->count('*', $app->db); } }
    $result['synthetic_ai_jobs'] = (int)(new Query())->from('{{%matcher_profile_ai_job}}')->where(['owner_id' => array_column($users, 'id')])->count('*', $app->db);
    echo json_encode($result, JSON_THROW_ON_ERROR) . PHP_EOL; exit;
}
if ($action === 'nickname') {
    if (!in_array($value, ['private', 'pending', 'restore'], true)) { throw new RuntimeException('Unsupported synthetic nickname state.'); }
    $state = (new Query())->select('id')->from('{{%matcher_profile_state}}')->where(['user_id' => $peer, 'scope_key' => 'global'])->scalar($app->db);
    $changes = ['visibility' => $value === 'private' ? 'private' : 'authenticated', 'confirmation' => $value === 'pending' ? 'draft' : 'confirmed'];
    $affected = $app->db->createCommand()->update('{{%matcher_profile_attribute}}', $changes, ['state_id' => $state, 'field_key' => 'nickname'])->execute();
    echo json_encode(['status' => 'ok', 'action' => $action, 'affected' => $affected], JSON_THROW_ON_ERROR) . PHP_EOL; exit;
}
if ($action === 'owner_membership' || $action === 'viewer_membership') {
    if (!in_array($value, ['remove', 'restore'], true)) { throw new RuntimeException('Unsupported synthetic membership transition.'); }
    $who = $action === 'owner_membership' ? $peer : $viewer;
    $app->db->createCommand()->update('{{%space_membership}}', ['status' => $value === 'restore' ? 3 : 2], ['user_id' => $who, 'space_id' => $spaces['primary']['id']])->execute();
    echo json_encode(['status' => 'ok', 'action' => $action], JSON_THROW_ON_ERROR) . PHP_EOL; exit;
}
if ($action === 'owner_block') {
    if (!in_array($value, ['none', 'outgoing', 'incoming', 'space'], true)) { throw new RuntimeException('Unsupported synthetic block state.'); }
    $pairs = ['outgoing' => [$users[81]['container'], $peer], 'incoming' => [$users[82]['container'], $viewer], 'space' => [$spaces['primary']['container'], $peer]];
    foreach ($pairs as [$container, $id]) { $app->db->createCommand()->delete('{{%contentcontainer_blocked_users}}', ['contentcontainer_id' => $container, 'user_id' => $id])->execute(); }
    if ($value !== 'none') { [$container, $id] = $pairs[$value]; $app->db->createCommand()->insert('{{%contentcontainer_blocked_users}}', ['contentcontainer_id' => $container, 'user_id' => $id])->execute(); }
    echo json_encode(['status' => 'ok', 'action' => $action], JSON_THROW_ON_ERROR) . PHP_EOL; exit;
}
if ($action === 'hide_members') {
    if (!in_array($value, ['hide', 'show'], true)) { throw new RuntimeException('Unsupported synthetic hide state.'); }
    $key = ['module_id' => 'space', 'contentcontainer_id' => $spaces['primary']['container'], 'name' => 'hideMembers'];
    $app->db->createCommand()->delete('{{%contentcontainer_setting}}', $key)->execute();
    if ($value === 'hide') { $app->db->createCommand()->insert('{{%contentcontainer_setting}}', $key + ['value' => '1'])->execute(); }
    echo json_encode(['status' => 'ok', 'action' => $action], JSON_THROW_ON_ERROR) . PHP_EOL; exit;
}
if ($action === 'conversation_author') {
    if (!in_array($value, ['remove', 'restore'], true)) { throw new RuntimeException('Unsupported author transition.'); }
    $message = (new Query())->select('id')->from('{{%message}}')->where(['title' => 's72_audit synthetic private conversation legal', 'created_by' => $candidate])->scalar($app->db);
    if (!$message) { throw new RuntimeException('Expected known synthetic conversation.'); }
    $app->db->createCommand()->delete('{{%user_message}}', ['message_id' => $message, 'user_id' => $candidate])->execute();
    if ($value === 'restore') { $app->db->createCommand()->insert('{{%user_message}}', ['message_id' => $message, 'user_id' => $candidate, 'is_originator' => 1, 'created_by' => $candidate, 'updated_by' => $candidate])->execute(); }
    echo json_encode(['status' => 'ok', 'action' => $action], JSON_THROW_ON_ERROR) . PHP_EOL; exit;
}
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
