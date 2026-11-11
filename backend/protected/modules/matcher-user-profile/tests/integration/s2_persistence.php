<?php
declare(strict_types=1);
require __DIR__ . '/s2_persistence_bootstrap.php';
use humhub\modules\matcherProfile\adapters\persistence\ProfileSchemaUpgradeV2;
use humhub\modules\matcherProfile\adapters\persistence\SqlProfileRepository;
use humhub\modules\matcherProfile\adapters\persistence\NativeProfileAccessPolicy;
use humhub\modules\matcherProfile\application\ProfileService;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\user\models\User;
use humhub\modules\user\models\Profile;
use yii\db\Query;

$passed = []; $current = 'upgrade';
$assert = static function (bool $ok, string $label) use (&$passed, &$current): void { $current = $label; if (!$ok) { throw new RuntimeException('Assertion failed: ' . $label); } $passed[] = $label; };
$reject = static function (callable $call, string $label, ?string $code = null) use ($assert): void {
    try { $call(); } catch (ProfileException $e) { $assert($code === null || $e->errorCode === $code, $label); return; }
    $assert(false, $label);
};
$tx = null;
try {
    $upgrade = new ProfileSchemaUpgradeV2($db);
    $upgrade->install(); $upgrade->install();
    $assert($db->schema->getTableSchema('{{%matcher_profile_attribute}}', true)->getColumn('visibility')->defaultValue === 'authenticated', 'migration_changes_default_only');
    $assert($db->schema->getTableSchema('{{%matcher_profile_draft}}', true)->getColumn('confirmation_hash') !== null, 'migration_adds_confirmation_receipt');
    $repo = new SqlProfileRepository($db, static function (int $id): void {});
    $maintenance = false;
    $access = new NativeProfileAccessPolicy($db, static function () use (&$maintenance): bool { return $maintenance; });
    $service = new ProfileService($repo, $access);
    $members = (new Query())->from('space_membership')->where(['status' => 3])->orderBy(['space_id' => SORT_ASC, 'user_id' => SORT_ASC])->all($db);
    $spaces = array_values(array_unique(array_column($members, 'space_id')));
    $owner = (int)$members[0]['user_id']; $spaceA = (int)$spaces[0]; $spaceB = (int)$spaces[1];
    $users = (new Query())->select('id')->from('user')->where(['status' => 1])->orderBy('id')->column($db);
    $other = (int)array_values(array_filter($users, fn($id) => (int)$id !== $owner))[0];
    $global = ProfileScope::global();
    $nativeBefore = (new Query())->from('profile')->orderBy('user_id')->all($db);
    $tx = $db->beginTransaction();
    foreach ([$owner, $other] as $uid) {
        foreach ([$spaceA, $spaceB] as $sid) {
            $db->createCommand()->upsert('space_membership', ['user_id' => $uid, 'space_id' => $sid, 'status' => 3, 'group_id' => 'member'], ['status' => 3])->execute();
        }
    }
    $draft = $service->startDraft($owner, $owner, $global, 'manual', false);
    $state = $repo->findState($owner, $global);
    $assert((int)$state['revision'] === 0, 'new_state_starts_unconfirmed');
    $assert($service->getProfile($other, $owner, $global, $spaceA)['attributes'] === [], 'native_legacy_not_published');
    $draft = $service->updateDraft($owner, $owner, $global, $draft['id'], $draft['draft_version'], [
        ['key' => 'headline', 'value' => '合成开发者'], ['key' => 'contact_phone', 'value' => '+86 13800138000'],
        ['key' => 'contact_wechat', 'value' => 'synthetic_user'],
        ['key' => 'project', 'value' => ['title' => '合成项目一']], ['key' => 'project', 'value' => ['title' => '合成项目二']],
        ['key' => 'collaboration_preference', 'value' => ['codes' => ['written_first']]],
    ]);
    $version = $draft['draft_version'];
    $result = $service->confirmDraft($owner, $owner, $global, $draft['id'], $version, 0);
    $assert($result['confirmed_revision'] === 1, 'confirmation_advances_revision');
    $assert($result == $service->confirmDraft($owner, $owner, $global, $draft['id'], $version, 0), 'confirmation_replay_exact');
    $reject(fn() => $service->confirmDraft($owner, $owner, $global, $draft['id'], $version + 1, 0), 'confirmation_replay_wrong_version_rejected');
    $profile = $service->getProfile($owner, $owner, $global);
    $attrs = array_column($profile['attributes'], null, 'key');
    $assert(count($profile['attributes']) === 6, 'json_and_repeated_values_persist');
    $assert(count(array_filter($profile['attributes'], fn($a) => $a['key'] === 'project')) === 2, 'two_projects_remain_independent');
    $assert((new Query())->select('mobile')->from('profile')->where(['user_id' => $owner])->scalar($db) === '+86 13800138000', 'phone_reuses_native_mobile');
    $assert((new Query())->select('value_json')->from('{{%matcher_profile_attribute}}')->where(['state_id' => $state['id'], 'field_key' => 'contact_phone'])->scalar($db) === null, 'native_phone_has_no_duplicate_json');
    $assert((new Query())->select(new yii\db\Expression('JSON_TYPE(value_json)'))->from('{{%matcher_profile_attribute}}')->where(['state_id' => $state['id'], 'field_key' => 'project'])->scalar($db) === 'OBJECT', 'json_expression_stores_object');
    $assert(count($service->getProfile($other, $owner, $global, $spaceA)['attributes']) === 6, 'confirmed_values_default_authenticated');
    $projectIds = array_column(array_filter($profile['attributes'], fn($a) => $a['key'] === 'project'), 'attribute_id');
    $snapshot = $service->getRevision($owner, $owner, $global, 1);
    $legacy = $repo->nativeCandidates($owner);
    $assert(!array_key_exists('contact_email', $legacy), 'login_email_not_imported');
    $edit = $service->startDraft($owner, $owner, $global, 'manual', false);
    $edit = $service->updateDraft($owner, $owner, $global, $edit['id'], $edit['draft_version'], [
        ['attribute_id' => $projectIds[0], 'value' => ['title' => '合成项目一修改']],
        ['op' => 'delete', 'attribute_id' => $attrs['contact_phone']['attribute_id']],
    ]);
    $service->confirmDraft($owner, $owner, $global, $edit['id'], $edit['draft_version'], 1);
    $after = $service->getProfile($owner, $owner, $global);
    $assert(array_column(array_filter($after['attributes'], fn($a) => $a['key'] === 'project'), 'attribute_id') === $projectIds, 'editing_preserves_stable_project_ids');
    $assert((new Query())->select('mobile')->from('profile')->where(['user_id' => $owner])->scalar($db) === null, 'explicit_delete_clears_native_value');
    $assert($service->getRevision($owner, $owner, $global, 1) == $snapshot, 'history_remains_immutable');
    $assert(array_column($after['attributes'], 'key') === array_values(array_filter(array_column($profile['attributes'], 'key'), fn($key) => $key !== 'contact_phone')), 'omitted_values_remain');
    // Native current values are read from the original table, while history remains frozen.
    $db->createCommand()->update('profile', ['title' => '合成原生新值'], ['user_id' => $owner])->execute();
    $assert(array_column($service->getProfile($owner, $owner, $global)['attributes'], 'value', 'key')['headline'] === '合成原生新值', 'current_native_source_is_authoritative');
    foreach ([$spaceA => 'Space A目标', $spaceB => 'Space B目标'] as $sid => $text) {
        $scope = ProfileScope::event($sid);
        $assert($service->getProfile($owner, $owner, $scope)['attributes'] === [], 'new_space_starts_empty_' . $sid);
        $d = $service->startDraft($owner, $owner, $scope, 'manual', false);
        $d = $service->updateDraft($owner, $owner, $scope, $d['id'], $d['draft_version'], [['key' => 'event_goal', 'value' => ['free_text' => $text]]]);
        $service->confirmDraft($owner, $owner, $scope, $d['id'], $d['draft_version'], 0);
    }
    $assert($service->getProfile($owner, $owner, ProfileScope::event($spaceA))['attributes'][0]['value'] !== $service->getProfile($owner, $owner, ProfileScope::event($spaceB))['attributes'][0]['value'], 'two_space_contexts_are_independent');
    $reject(fn() => $service->getProfile($other, $owner, ProfileScope::event($spaceA), $spaceB), 'wrong_current_space_rejected');
    $db->createCommand()->update('space_membership', ['status' => 2], ['user_id' => $owner, 'space_id' => $spaceB])->execute();
    $reject(fn() => $service->startDraft($owner, $owner, ProfileScope::event($spaceB)), 'applicant_is_not_formal_member');
    $maintenance = true;
    $reject(fn() => $service->startDraft($owner, $owner, $global), 'maintenance_blocks_writes', 'PROFILE_MAINTENANCE');
    $maintenance = false;
    $assert(count($service->getProfile($owner, $owner, $global)['attributes']) === 5, 'maintenance_does_not_change_values');
    $tx->rollBack(); $tx = null;
    $assert($nativeBefore === (new Query())->from('profile')->orderBy('user_id')->all($db), 'transaction_rollback_restores_all_native_values');
    $assert((int)(new Query())->from('{{%matcher_profile_state}}')->count('*', $db) === 0, 'rollback_restores_plugin_rows');
    echo json_encode(['status' => 'passed', 'checks' => count($passed), 'passed' => $passed, 'preview_database_connected' => false], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
} catch (Throwable $e) {
    if ($tx?->isActive) { $tx->rollBack(); }
    fwrite(STDERR, json_encode(['status' => 'failed', 'at' => $current, 'passed' => count($passed), 'error_type' => get_class($e), 'reason' => str_starts_with($e->getMessage(), 'Assertion failed: ') ? $e->getMessage() : 'Runtime failure; raw details suppressed']) . PHP_EOL); exit(1);
}
