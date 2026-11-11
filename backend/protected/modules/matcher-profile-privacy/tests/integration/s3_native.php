<?php
declare(strict_types=1);
// Real SQL + native presentation verification on one disposable S3 clone.
define('MATCHER_S3_HTTP_WEB', true);
$_SERVER['SCRIPT_NAME'] = '/index.php'; $_SERVER['SCRIPT_FILENAME'] = dirname(__DIR__, 5) . '/index.php';
$_SERVER['HTTP_HOST'] = '127.0.0.1:8093'; $_SERVER['REQUEST_URI'] = '/';
$app = require __DIR__ . '/s3_http_bootstrap.php';
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherPrivacy\adapters\native\NativeProfileRelations;
use humhub\modules\matcherPrivacy\adapters\native\NativePrivacyHooks;
use humhub\modules\matcherPrivacy\adapters\native\NativeProfilePresenter;
use humhub\modules\matcherPrivacy\adapters\native\ScopedPeopleQuery;
use humhub\modules\matcherPrivacy\adapters\persistence\LegacyProfileImporter;
use humhub\modules\user\models\User;
use humhub\modules\user\models\Profile;
use yii\db\Query;
$checks = [];
$ok = static function (string $label, bool $condition) use (&$checks): void { if (!$condition) { throw new RuntimeException($label); } $checks[] = $label; };
$denied = static function (string $label, callable $callback, int $status = 403) use ($ok): void {
    try { $callback(); } catch (ProfileException $error) { $ok($label, $error->httpStatus === $status); return; }
    throw new RuntimeException($label . ': expected denial');
};
try {
    NativePrivacyHooks::install();
    $db = $app->db; $module = $app->getModule('matcher-user-profile');
    $profiles = $module->getProfileService(); $privacy = $app->getModule('matcher-profile-privacy')->getPrivacyService();
    $relations = new NativeProfileRelations($db); $global = ProfileScope::global();
    $users = []; $suffix = bin2hex(random_bytes(3));
    foreach (['owner', 'viewer', 'stranger', 'legacy', 'editing', 'missing'] as $role) {
        $user = new User(); $user->username = 's3_native_' . $role . '_' . $suffix; $user->email = $user->username . '@example.invalid'; $user->status = 1;
        if (!$user->save(false)) { throw new RuntimeException('fixture user'); }
        if ($role !== 'missing') { $profile = new Profile(); $profile->user_id = $user->id; $profile->save(false); }
        $users[$role] = $user;
    }
    $owner = (int)$users['owner']->id; $viewer = (int)$users['viewer']->id; $stranger = (int)$users['stranger']->id;
    $spaceIds = array_map('intval', (new Query())->select('id')->from('{{%space}}')->orderBy('id')->limit(2)->column($db)); $space = $spaceIds[0];
    foreach ([$owner, $viewer] as $id) { $db->createCommand()->upsert('{{%space_membership}}', ['space_id' => $space, 'user_id' => $id, 'status' => 3])->execute(); }
    $app->user->setIdentity($users['owner']); $app->request->setQueryParams(['space_id' => (string)$space]);
    $denied('anonymous_user_rejected', fn() => $relations->assertActive(0), 401);
    $ok('formal_space_member', $relations->isSpaceMember($owner, $space));
    $ok('nonmember_denied', !$relations->isSpaceMember($stranger, $space));
    $db->createCommand()->upsert('{{%space_membership}}', ['space_id' => $space, 'user_id' => $stranger, 'status' => 1])->execute();
    $ok('applicant_not_member', !$relations->isSpaceMember($stranger, $space));
    $db->createCommand()->delete('{{%space_membership}}', ['space_id' => $space, 'user_id' => $stranger])->execute();
    $db->createCommand()->insert('{{%user_friendship}}', ['user_id' => $owner, 'friend_user_id' => $viewer])->execute();
    $ok('one_direction_request_not_friendship', !$relations->areFriends($viewer, $owner));
    $db->createCommand()->insert('{{%user_friendship}}', ['user_id' => $viewer, 'friend_user_id' => $owner])->execute();
    $ok('reciprocal_friendship_valid', $relations->areFriends($viewer, $owner));
    $oldEnable = $app->getModule('friendship')->settings->get('enable'); $app->getModule('friendship')->settings->set('enable', '0');
    $ok('disabled_friendship_inactive', !$relations->areFriends($viewer, $owner)); $app->getModule('friendship')->settings->set('enable', $oldEnable);
    $db->createCommand()->insert('{{%contentcontainer_blocked_users}}', ['contentcontainer_id' => $users['owner']->contentcontainer_id, 'user_id' => $viewer])->execute();
    $ok('owner_block_overrides_friendship', $relations->isBlocked($viewer, $owner) && !$relations->areFriends($viewer, $owner));
    $db->createCommand()->delete('{{%contentcontainer_blocked_users}}', ['contentcontainer_id' => $users['owner']->contentcontainer_id, 'user_id' => $viewer])->execute();
    $db->createCommand()->insert('{{%contentcontainer_blocked_users}}', ['contentcontainer_id' => $users['viewer']->contentcontainer_id, 'user_id' => $owner])->execute();
    $ok('viewer_block_is_symmetric', $relations->isBlocked($viewer, $owner));
    $db->createCommand()->delete('{{%contentcontainer_blocked_users}}', ['contentcontainer_id' => $users['viewer']->contentcontainer_id, 'user_id' => $owner])->execute();
    $spaceContainer = (int)(new Query())->select('contentcontainer_id')->from('{{%space}}')->where(['id' => $space])->scalar($db);
    $db->createCommand()->insert('{{%contentcontainer_blocked_users}}', ['contentcontainer_id' => $spaceContainer, 'user_id' => $viewer])->execute();
    $ok('space_block_denies_retained_membership', !$relations->isSpaceMember($viewer, $space));
    $db->createCommand()->delete('{{%contentcontainer_blocked_users}}', ['contentcontainer_id' => $spaceContainer, 'user_id' => $viewer])->execute();
    $db->createCommand()->update('{{%profile}}', ['firstname' => 'SYNTHETIC_PRIVATE_FIRST', 'lastname' => 'SYNTHETIC_PRIVATE_LAST'], ['user_id' => $owner])->execute();
    $neutral = $users['owner']->displayName;
    $ok('legacy_display_name_is_neutral', !str_contains($neutral, 'SYNTHETIC_PRIVATE') && $neutral === User::findOne($owner)->displayName);
    $module->getIdentityService()->update($owner, 0, ['nickname' => 'S3Confirmed' . $suffix]);
    $ok('confirmed_identity_switches_all_instances', $users['owner']->displayName === 'S3Confirmed' . $suffix);
    $draft = $profiles->startDraft($owner, $owner, $global, 'manual', false);
    $draft = $profiles->updateDraft($owner, $owner, $global, $draft['id'], $draft['draft_version'], [
        ['key' => 'real_name', 'value' => 'SYNTHETIC_PRIVATE_REAL', 'visibility' => 'private'],
        ['key' => 'headline', 'value' => 'SYNTHETIC_FRIEND_HEADLINE', 'visibility' => 'friends'],
        ['key' => 'bio', 'value' => 'SYNTHETIC_VISIBLE_BIO', 'visibility' => 'authenticated'],
        ['key' => 'contact_wechat', 'value' => 'synthetic_contact', 'visibility' => 'authenticated'],
    ]);
    $confirmed = $profiles->confirmDraft($owner, $owner, $global, $draft['id'], $draft['draft_version'], $draft['base_revision']);
    $context = ['entry_type' => 'space', 'space_id' => $space, 'purpose' => 'detail'];
    $detail = $privacy->read($viewer, $owner, $global, $context); $keys = array_column($detail['attributes'], 'key');
    $ok('friend_reads_confirmed_friend_field', in_array('headline', $keys, true));
    $ok('private_field_and_definition_hidden', !in_array('real_name', $keys, true) && !in_array('real_name', array_column($detail['field_definitions'], 'key'), true));
    $ok('ordinary_detail_excludes_contacts', !in_array('contact_wechat', $keys, true));
    $contacts = $privacy->contacts($viewer, $owner, $context);
    $ok('separate_contact_view_default_authenticated', array_column($contacts['attributes'], 'key') === ['contact_wechat']);
    $summary = $privacy->read($viewer, $owner, $global, array_replace($context, ['purpose' => 'summary']));
    $ok('summary_never_includes_friend_fields', !in_array('headline', array_column($summary['attributes'], 'key'), true));
    $app->user->setIdentity($users['viewer']);
    $ok('display_subtitle_excludes_friend_headline', NativeProfilePresenter::subTitle($users['owner']) === '');
    $about = NativeProfilePresenter::about($owner);
    $ok('native_about_shows_allowed_detail', str_contains($about, 'SYNTHETIC_FRIEND_HEADLINE') && str_contains($about, 'SYNTHETIC_VISIBLE_BIO'));
    $ok('native_about_hides_private_name', !str_contains($about, 'SYNTHETIC_PRIVATE_REAL'));
    $ok('native_about_separate_contact_section', str_contains($about, 'profile-contacts') && str_contains($about, 'synthetic_contact'));
    // Render the real Messenger view through the substituted widget, including its legacy full-name branch.
    $message = new class extends \humhub\modules\mail\models\Message {
        public User $syntheticParticipant;
        public \humhub\modules\mail\models\MessageEntry $syntheticEntry;
        public function getUsersCount(): int { return 2; }
        public function getLastActiveParticipant(bool $includeMe = false): User { return $this->syntheticParticipant; }
        public function getLastEntry(): ?\humhub\modules\mail\models\MessageEntry { return $this->syntheticEntry; }
    };
    $entry = new \humhub\modules\mail\models\MessageEntry();
    $entry->content = 'Synthetic message'; $entry->type = \humhub\modules\mail\models\AbstractMessageEntry::TYPE_MESSAGE;
    $entry->populateRelation('user', User::findOne($owner));
    $message->id = 987654; $message->created_at = gmdate('Y-m-d H:i:s'); $message->updated_at = $message->created_at;
    $message->syntheticParticipant = User::findOne($owner); $message->syntheticEntry = $entry;
    $userMessage = new \humhub\modules\mail\models\UserMessage();
    $userMessage->user_id = $viewer; $userMessage->pinned = 0; $userMessage->populateRelation('message', $message);
    $oldDisplayFormat = $app->settings->get('displayNameFormat');
    $app->settings->set('displayNameFormat', '{profile.firstname} {profile.lastname}');
    $preview = \humhub\modules\matcherPrivacy\adapters\native\NativeInboxMessagePreview::widget(['userMessage' => $userMessage]);
    $app->settings->set('displayNameFormat', $oldDisplayFormat);
    $ok('mail_inbox_preview_renders_parent_template', str_contains($preview, 'mail-last-entry'));
    $ok('mail_inbox_preview_uses_confirmed_nickname', str_contains($preview, 'S3Confirmed' . $suffix) && !str_contains($preview, 'SYNTHETIC_PRIVATE'));
    $ok('mail_projection_preserves_native_user_instance', $message->syntheticParticipant->profile->firstname === 'SYNTHETIC_PRIVATE_REAL');
    $app->request->setQueryParams([]);
    $ok('directory_without_current_space_empty', (new ScopedPeopleQuery())->all() === []);
    $app->request->setQueryParams(['space_id' => (string)$space, 'keyword' => 'SYNTHETIC_PRIVATE_REAL']);
    $ok('directory_cannot_search_hidden_real_name', (new ScopedPeopleQuery())->all() === []);
    $app->request->setQueryParams(['space_id' => (string)$space, 'keyword' => 'SYNTHETIC_FRIEND_HEADLINE']);
    $ok('directory_cannot_search_friend_only_headline', (new ScopedPeopleQuery())->all() === []);
    $app->request->setQueryParams(['space_id' => (string)$space, 'keyword' => 'S3Confirmed' . $suffix]);
    $found = (new ScopedPeopleQuery())->all();
    $ok('directory_searches_confirmed_nickname_in_space', count($found) === 1 && (int)$found[0]->id === $owner);
    $app->user->setIdentity($users['stranger']);
    $denied('directory_requires_actor_space_membership', fn() => new ScopedPeopleQuery());
    $app->user->setIdentity($users['viewer']); $app->request->setQueryParams(['space_id' => (string)$space]);
    $rest = \humhub\modules\rest\definitions\UserDefinitions::getUser($users['owner']);
    $ok('rest_compatibility_adapter_loaded', \humhub\modules\rest\definitions\UserDefinitions::privacyProjectionEnabled());
    $ok('rest_other_account_excludes_email', !isset($rest['account']['email'], $rest['account']['username']));
    $ok('rest_other_profile_excludes_native_raw_columns', !isset($rest['profile']['firstname']) && !str_contains(json_encode($rest), 'SYNTHETIC_PRIVATE_REAL'));
    $ok('rest_other_uses_confirmed_display_name', $rest['display_name'] === 'S3Confirmed' . $suffix);
    $app->user->setIdentity($users['owner']);
    $ownRest = \humhub\modules\rest\definitions\UserDefinitions::getUser($users['owner']);
    $ok('rest_owner_account_still_available', $ownRest['account']['email'] === $users['owner']->email);
    $oldController = $app->controller;
    $admin = User::find()->active()->orderBy('id')->one(); $app->user->setIdentity($admin);
    $app->controller = new \humhub\modules\rest\controllers\user\UserController('user', $app->getModule('rest'));
    $adminRest = \humhub\modules\rest\definitions\UserDefinitions::getUser(User::findOne($owner));
    $ok('rest_account_administration_retains_manageusers_capability', isset($adminRest['account']['email']) && isset($adminRest['profile']['firstname']));
    $app->controller = new \yii\web\Controller('ordinary', $app);
    $ordinaryAdminRest = \humhub\modules\rest\definitions\UserDefinitions::getUser(User::findOne($owner));
    $ok('rest_admin_on_ordinary_route_has_no_credential_bypass', !isset($ordinaryAdminRest['account']['email']));
    $app->controller = $oldController; $app->user->setIdentity($users['viewer']);
    $db->createCommand()->update('{{%profile}}', ['birthday' => '1995-' . gmdate('m-d')], ['user_id' => [$owner, $viewer]])->execute();
    $birthdays = \humhub\modules\calendar\integration\BirthdayCalendarQuery::find()->query(true)->all();
    $birthdayIds = array_map(static fn($user): int => (int)$user->id, $birthdays);
    $ok('calendar_legacy_birthday_is_owner_only', $birthdayIds === [$viewer]);
    $ok('calendar_birthday_direct_guid_cannot_read_another_user', !\humhub\modules\calendar\integration\BirthdayCalendarQuery::find()->filterByGuid($users['owner']->guid)->query(true)->exists());
    \humhub\modules\calendar\Module::registerAutoloader();
    $principalBackend = new \humhub\modules\calendar\helpers\dav\PrincipalBackend();
    $ok('caldav_principal_search_only_current_account', $principalBackend->searchPrincipals('principals', []) === ['principals/' . $users['viewer']->username]);
    $ok('caldav_other_principal_cannot_expose_login_email', $principalBackend->getPrincipalByPath('principals/' . $users['owner']->username) === null);
    $ownPrincipal = $principalBackend->getPrincipalByPath('principals/' . $users['viewer']->username);
    $ok('caldav_own_account_sync_identity_preserved', $ownPrincipal['{http://sabredav.org/ns}email-address'] === $users['viewer']->email);
    $calendar = $app->getModule('calendar');
    $oldIncludeEmail = $calendar->settings->get('includeParticipantEmail');
    $calendar->settings->set('includeParticipantEmail', true);
    $calendarEntry = new \humhub\modules\calendar\models\CalendarEntry($users['owner']);
    $calendarEntry->id = 987654; $calendarEntry->title = 'Synthetic Schedule'; $calendarEntry->uid = 's3-synthetic-' . $suffix;
    $calendarEntry->start_datetime = '2026-11-11 10:00:00'; $calendarEntry->end_datetime = '2026-11-11 11:00:00';
    $calendarEntry->time_zone = 'UTC'; $calendarEntry->all_day = 0;
    $calendarEntry->content->created_by = $owner;
    $calendarEntry->content->populateRelation('createdBy', $users['owner']);
    $calendarEntry->content->created_at = '2026-11-11 09:00:00'; $calendarEntry->content->updated_at = '2026-11-11 09:00:00';
    $ics = \humhub\modules\calendar\interfaces\VCalendar::withEvents([$calendarEntry])->serialize();
    $calendar->settings->set('includeParticipantEmail', $oldIncludeEmail);
    $ok('calendar_ics_keeps_schedule_and_confirmed_organizer', str_contains($ics, 'SUMMARY:Synthetic Schedule') && stripos($ics, 'S3Confirmed' . $suffix) !== false);
    $ok('calendar_ics_ignores_login_email_export_flag', !str_contains($ics, '@example.invalid') && str_contains($ics, 'mailto:-'));
    $app->user->setIdentity($users['owner']);
    $ok('legacy_profile_fields_no_public_search_flags', !(new Query())->from('{{%profile_field}}')->where(['or', ['visible' => 1], ['searchable' => 1], ['directory_filter' => 1]])->exists($db));
    $field = \humhub\modules\user\models\ProfileField::findOne(['internal_name' => 'city']); $field->visible = 1; $field->searchable = 1; $field->directory_filter = 1; $field->save(false);
    $field->refresh(); $ok('native_field_settings_cannot_reopen_private_outputs', !$field->visible && !$field->searchable && !$field->directory_filter);
    $importer = new LegacyProfileImporter($db, $profiles, $module->getProfileRepository());
    $legacy = (int)$users['legacy']->id;
    $db->createCommand()->update('{{%profile}}', ['firstname' => 'SYNTHETIC_LEGACY_NAME', 'city' => 'SYNTHETIC_LEGACY_CITY'], ['user_id' => $legacy])->execute();
    $import = $importer->seed($legacy);
    $ok('legacy_values_create_review_draft', $import['created'] && $import['candidate_count'] === 2);
    $legacyState = $module->getProfileRepository()->findState($legacy, $global);
    $ok('legacy_import_does_not_confirm_or_advance_revision', $legacyState['revision'] === 0 && $module->getProfileRepository()->currentAttributes($legacyState['id']) === []);
    $legacyDraft = $module->getProfileRepository()->findEditingDraft($legacyState['id'], 'migration');
    $ok('legacy_draft_entries_default_private', count($legacyDraft['fields']) === 2 && array_unique(array_column($legacyDraft['fields'], 'visibility')) === ['private']);
    $ok('legacy_import_is_idempotent', !$importer->seed($legacy)['created']);
    $editing = (int)$users['editing']->id;
    $db->createCommand()->update('{{%profile}}', ['city' => 'SYNTHETIC_PENDING_CITY'], ['user_id' => $editing])->execute();
    $existingDraft = $profiles->startDraft($editing, $editing, $global);
    $deferred = $importer->seed($editing);
    $ok('legacy_review_defers_for_existing_manual_draft', $deferred['deferred'] && !$deferred['created']);
    $ok('manual_draft_preserved_during_legacy_review', $profiles->getProfile($editing, $editing, $global)['editing_draft']['id'] === $existingDraft['id']);
    $missing = (int)$users['missing']->id;
    $denied('missing_native_profile_identity_fails', fn() => $module->getIdentityService()->update($missing, 0, ['nickname' => 'MissingProfile']), 409);
    $missingState = $module->getProfileRepository()->findState($missing, $global);
    $ok('missing_native_profile_does_not_advance_identity', $missingState === null || (int)$missingState['identity_version'] === 0);
    $missingDraft = $profiles->startDraft($missing, $missing, $global);
    $missingDraft = $profiles->updateDraft($missing, $missing, $global, $missingDraft['id'], $missingDraft['draft_version'], [['key' => 'city', 'value' => 'Example']]);
    $denied('missing_native_profile_confirmation_rolls_back', fn() => $profiles->confirmDraft($missing, $missing, $global, $missingDraft['id'], $missingDraft['draft_version'], 0), 409);
    $ok('missing_native_profile_preserves_draft_and_revision', $profiles->getDraft($missing, $missing, $global, $missingDraft['id'])['status'] === 'editing' && $profiles->getProfile($missing, $missing, $global)['revision'] === 0);

    // A committed change through a second connection must win over an outer RR snapshot.
    $other = new \yii\db\Connection(['dsn' => $db->dsn, 'username' => $db->username, 'password' => $db->password, 'charset' => $db->charset]);
    $other->open();
    $repo2 = new \humhub\modules\matcherProfile\adapters\persistence\SqlProfileRepository($other, static fn(int $id) => null);
    $service2 = new \humhub\modules\matcherProfile\application\ProfileService($repo2, new \humhub\modules\matcherProfile\adapters\persistence\NativeProfileAccessPolicy($other, static fn() => false));
    $bio = array_values(array_filter($confirmed['profile']['attributes'], static fn(array $item) => $item['key'] === 'bio'))[0];
    $tx = $db->beginTransaction(\yii\db\Transaction::REPEATABLE_READ);
    (new Query())->from('{{%matcher_profile_attribute}}')->where(['attribute_id' => $bio['attribute_id']])->one($db);
    $service2->setVisibilities($owner, $owner, $global, $confirmed['profile']['revision'], [['attribute_id' => $bio['attribute_id'], 'visibility' => 'private']]);
    $fresh = $privacy->read($viewer, $owner, $global, $context);
    $ok('rr_snapshot_cannot_restore_revoked_visibility', !in_array('bio', array_column($fresh['attributes'], 'key'), true));
    $tx->rollBack();
    $tx = $db->beginTransaction(\yii\db\Transaction::REPEATABLE_READ);
    (new Query())->from('{{%space_membership}}')->where(['space_id' => $space, 'user_id' => $viewer])->one($db);
    $other->createCommand()->delete('{{%space_membership}}', ['space_id' => $space, 'user_id' => $viewer])->execute();
    $denied('rr_snapshot_cannot_restore_revoked_space_membership', fn() => $privacy->read($viewer, $owner, $global, $context));
    $tx->rollBack();
    $other->createCommand()->insert('{{%space_membership}}', ['space_id' => $space, 'user_id' => $viewer, 'status' => 3])->execute();
    $other->close();
} catch (Throwable $error) {
    if ($app->db->getTransaction()?->isActive) { $app->db->getTransaction()->rollBack(); }
    fwrite(STDERR, json_encode(['failed' => true, 'completed' => count($checks), 'type' => get_class($error), 'message' => $error instanceof yii\db\Exception ? ($error->errorInfo[2] ?? 'SQL failure') : $error->getMessage(), 'file' => basename($error->getFile()), 'line' => $error->getLine()], JSON_THROW_ON_ERROR) . PHP_EOL); exit(1);
}
echo json_encode(['passed' => count($checks), 'checks' => $checks], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . PHP_EOL;
