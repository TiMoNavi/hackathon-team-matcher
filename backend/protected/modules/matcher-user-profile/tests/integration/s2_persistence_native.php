<?php
declare(strict_types=1);
require __DIR__ . '/s2_persistence_bootstrap.php';
use humhub\modules\matcherProfile\adapters\persistence\ProfileSchemaUpgradeV2;
use humhub\modules\matcherProfile\adapters\native\NativeEditBridge;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\user\models\User;
use humhub\modules\user\models\Profile;
use yii\db\Query;

$checks = []; $current = 'setup'; $tx = null;
$assert = static function(bool $ok, string $name) use (&$checks, &$current): void { $current = $name; if (!$ok) { throw new RuntimeException('Assertion failed: ' . $name); } $checks[] = $name; };
$reject = static function(callable $call, string $name, ?string $code = null) use ($assert): void { try { $call(); } catch(ProfileException $e) { $assert($code === null || $e->errorCode === $code, $name); return; } $assert(false, $name); };
try {
    (new ProfileSchemaUpgradeV2($db))->install();
    $consoleRequest = $app->request;
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $app->set('request', new yii\web\Request(['cookieValidationKey' => 'synthetic-test-key', 'scriptFile' => $backend . '/index.php', 'scriptUrl' => '/index.php']));
    $module = $app->getModule('matcher-user-profile'); $repo = $module->getProfileRepository(); $service = $module->getProfileService();
    $users = (new Query())->select('id')->from('user')->where(['status' => 1])->orderBy('id')->column($db);
    $owner = (int)$users[1]; $admin = (int)$users[0]; $scope = ProfileScope::global();
    $nativeBefore = (new Query())->from('profile')->orderBy('user_id')->all($db);
    $userBefore = (new Query())->select(['id', 'time_zone'])->from('user')->orderBy('id')->all($db);
    $tx = $db->beginTransaction();
    $app->user->setIdentity(User::findOne($owner));
    $assert($repo->findState($owner, $scope) === null, 'native_fixture_has_no_confirmed_metadata');
    // An old private raw contact is explicitly cleared through the original profile model.
    $db->createCommand()->update('profile', ['mobile' => '+86 13800138001', 'title' => '合成旧标题'], ['user_id' => $owner])->execute();
    $app->request->setBodyParams(['matcher_profile_revision' => 0, 'matcher_identity_version' => 0]);
    $profile = Profile::findOne(['user_id' => $owner]); $profile->mobile = '';
    (new NativeEditBridge($owner))->run(fn() => $profile->save(false));
    $assert((new Query())->select('mobile')->from('profile')->where(['user_id' => $owner])->scalar($db) === null, 'native_form_clears_unconfirmed_legacy_value');
    $assert((int)$repo->findState($owner, $scope)['revision'] === 1, 'legacy_clear_has_versioned_audit_revision');
    $assert($service->getProfile($owner, $owner, $scope)['attributes'] === [], 'legacy_clear_does_not_publish_other_raw_fields');
    // A pending draft from another editing entry must not be implicitly confirmed.
    $pending = $service->startDraft($owner, $owner, $scope, 'native_edit', false);
    $pending = $service->updateDraft($owner, $owner, $scope, $pending['id'], $pending['draft_version'], [['key' => 'contact_wechat', 'value' => 'unconfirmed_synthetic_contact']]);
    $app->request->setBodyParams(['matcher_profile_revision' => 1, 'matcher_identity_version' => 0]);
    $profile = Profile::findOne(['user_id' => $owner]); $profile->title = '合成表单已确认标题';
    (new NativeEditBridge($owner))->run(fn() => $profile->save(false));
    $attrs = $service->getProfile($owner, $owner, $scope)['attributes'];
    $assert(count($attrs) === 1 && $attrs[0]['key'] === 'headline', 'native_save_does_not_confirm_old_pending_contact');
    $assert($repo->findDraft($pending['id'])['status'] === 'editing', 'old_native_draft_is_preserved');
    $reject(fn() => $service->confirmDraft($owner, $owner, $scope, $pending['id'], $pending['draft_version'], 1), 'old_native_draft_conflicts_after_new_save');
    $assert((int)$repo->findState($owner, $scope)['revision'] === 2, 'native_form_and_api_share_revision');
    $profile = Profile::findOne(['user_id' => $owner]); $profile->title = '应被拒绝旧表单';
    $reject(fn() => (new NativeEditBridge($owner))->run(fn() => $profile->save(false)), 'stale_native_form_rejected');
    $assert((new Query())->select('title')->from('profile')->where(['user_id' => $owner])->scalar($db) === '合成表单已确认标题', 'stale_native_form_preserves_current_native_value');
    // Editing native timezone uses the ordinary profile revision, not identity_version.
    $app->request->setBodyParams(['matcher_profile_revision' => 2, 'matcher_identity_version' => 0, 'AccountSettings' => ['timeZone' => 'Asia/Tokyo']]);
    $user = User::findOne($owner); $user->time_zone = 'Asia/Tokyo';
    (new NativeEditBridge($owner))->run(fn() => $user->save(false));
    $attrs = array_column($service->getProfile($owner, $owner, $scope)['attributes'], 'value', 'key');
    $assert(($attrs['timezone'] ?? null) === 'Asia/Tokyo', 'native_timezone_is_saved_via_profile_service');
    $assert((int)$repo->findState($owner, $scope)['revision'] === 3 && (int)$repo->findState($owner, $scope)['identity_version'] === 0, 'timezone_uses_profile_not_identity_version');
    // Plain native REST/model writes outside the versioned editor are rejected.
    $profile = Profile::findOne(['user_id' => $owner]); $profile->title = '旁路修改';
    $reject(fn() => $profile->save(false), 'unversioned_native_profile_write_rejected', 'PROFILE_VERSIONED_EDIT_REQUIRED');
    // Administrator editing creates a proposal and preserves confirmed native values.
    $app->user->setIdentity(User::findOne($admin));
    $app->request->setBodyParams(['matcher_profile_revision' => 3, 'matcher_identity_version' => 0]);
    $profile = Profile::findOne(['user_id' => $owner]); $profile->title = '合成管理员建议标题';
    (new NativeEditBridge($owner, true))->run(fn() => $profile->save(false));
    $assert((new Query())->select('title')->from('profile')->where(['user_id' => $owner])->scalar($db) === '合成表单已确认标题', 'admin_native_edit_preserves_confirmed_value');
    $proposal = $repo->findEditingDraft($repo->findState($owner, $scope)['id'], 'admin_proposal');
    $assert($proposal !== null && (int)$proposal['initiator_id'] === $admin && $proposal['fields'][0]['value'] === '合成管理员建议标题', 'admin_native_edit_records_pending_proposal_and_actor');
    $assert((int)$repo->findState($owner, $scope)['revision'] === 3, 'admin_proposal_does_not_confirm_revision');
    $app->user->setIdentity(User::findOne($owner));
    $service->confirmDraft($owner, $owner, $scope, $proposal['id'], $proposal['draft_version'], 3);
    $assert((new Query())->select('title')->from('profile')->where(['user_id' => $owner])->scalar($db) === '合成管理员建议标题', 'owner_can_confirm_native_admin_proposal');
    // Independent nickname identity marker survives ordinary replacement.
    $identity = $module->getIdentityService()->update($owner, 0, ['nickname' => '合成确认昵称']);
    $app->request->setBodyParams(['matcher_profile_revision' => 4, 'matcher_identity_version' => 1]);
    $profile = Profile::findOne(['user_id' => $owner]); $profile->title = '合成昵称保留测试';
    (new NativeEditBridge($owner))->run(fn() => $profile->save(false));
    $assert($module->getIdentityService()->getIdentity($owner)['nickname'] === '合成确认昵称', 'ordinary_replace_preserves_identity_marker');
    $assert((int)$repo->findState($owner, $scope)['identity_version'] === 1, 'ordinary_replace_does_not_advance_identity_version');
    $app->request->setBodyParams(['matcher_profile_revision' => 5, 'matcher_identity_version' => 1, 'AccountSettings' => ['timeZone' => '']]);
    $user = User::findOne($owner); $user->time_zone = '';
    (new NativeEditBridge($owner))->run(fn() => $user->save(false));
    $assert((new Query())->select('time_zone')->from('user')->where(['id' => $owner])->scalar($db) === null, 'native_settings_can_clear_optional_timezone');
    $assert((int)$repo->findState($owner, $scope)['revision'] === 6 && !in_array('timezone', array_column($service->getProfile($owner, $owner, $scope)['attributes'], 'key'), true), 'timezone_clear_removes_attribute_and_records_revision');
    $app->set('request', $consoleRequest);
    $db->createCommand()->update('user', ['time_zone' => null], ['id' => $owner])->execute();
    $beforeBackgroundRevision = (int)$repo->findState($owner, $scope)['revision'];
    $background = User::findOne($owner);
    $background->save(false);
    $assert((new Query())->select('time_zone')->from('user')->where(['id' => $owner])->scalar($db) === null, 'console_account_save_keeps_implicit_timezone_unset');
    $assert((int)$repo->findState($owner, $scope)['revision'] === $beforeBackgroundRevision, 'background_save_does_not_create_profile_revision');
    $tx->rollBack(); $tx = null;
    $assert($nativeBefore === (new Query())->from('profile')->orderBy('user_id')->all($db), 'native_bridge_test_rolls_back_profile_values');
    $assert($userBefore === (new Query())->select(['id', 'time_zone'])->from('user')->orderBy('id')->all($db), 'native_bridge_test_rolls_back_timezone');
    echo json_encode(['status' => 'passed', 'checks' => count($checks), 'passed' => $checks, 'preview_database_connected' => false], JSON_PRETTY_PRINT) . PHP_EOL;
} catch (Throwable $e) {
    if ($tx?->isActive) { $tx->rollBack(); }
    fwrite(STDERR, json_encode(['status' => 'failed', 'at' => $current, 'passed' => count($checks), 'error_type' => get_class($e), 'reason' => str_starts_with($e->getMessage(), 'Assertion failed: ') ? $e->getMessage() : 'Runtime failure; raw details suppressed']) . PHP_EOL); exit(1);
}
