<?php
declare(strict_types=1);
/** Real MySQL acceptance. The bootstrap refuses every non-S4 database. */
// Native module lifecycle runs in the same web Application used by administration.
// No HTTP listener or network request is created by these synthetic request values.
define('MATCHER_S4_HTTP_WEB', true);
$_SERVER['SCRIPT_NAME'] = '/index.php'; $_SERVER['SCRIPT_FILENAME'] = dirname(__DIR__, 5) . '/index.php';
$_SERVER['HTTP_HOST'] = '127.0.0.1:8098'; $_SERVER['REQUEST_URI'] = '/';
ob_start(); require __DIR__ . '/s4_fixture.php'; $fixture = json_decode(ob_get_clean(), true, 32, JSON_THROW_ON_ERROR);

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\adapters\persistence\QuestionSchemaInstaller;
use humhub\modules\matcherOnboarding\adapters\persistence\OnboardingSchemaInstaller;
use yii\db\Query;

$checks = [];
$ok = static function (string $name, bool $condition) use (&$checks): void { if (!$condition) { throw new RuntimeException($name); } $checks[] = $name; };
$denied = static function (string $name, callable $perform, int $status) use ($ok): void {
    try { $perform(); } catch (ProfileException $error) { $ok($name, $error->httpStatus === $status); return; }
    throw new RuntimeException($name . ': expected rejection');
};
$versions = static function (array $session, string $kind): array {
    $result = []; foreach ($session[$kind] as $scope => $draft) { if ($draft !== null) { $result[$scope] = ['draft_version' => $draft['draft_version'], 'base_revision' => $draft['base_revision']]; } } return $result;
};
try {
    $db = $app->db; $owner = $fixture['users']['owner']; $viewer = $fixture['users']['viewer']; $outsider = $fixture['users']['stranger']; [$spaceA, $spaceB] = $fixture['spaces'];
    $profile = $app->getModule('matcher-user-profile'); $flow = $app->getModule('matcher-onboarding')->getOnboardingService(); $questions = $profile->getQuestionService(); $profiles = $profile->getProfileService();
    (new QuestionSchemaInstaller($db))->install(); (new OnboardingSchemaInstaller($db))->install();
    $ok('repeat_schema_installation_succeeds', true);
    $ok('three_workflow_tables_exist', $db->schema->getTableSchema('{{%matcher_profile_question_batch}}', true) !== null && $db->schema->getTableSchema('{{%matcher_profile_question_answer}}', true) !== null && $db->schema->getTableSchema('{{%matcher_onboarding_session}}', true) !== null);
    $manual = $profiles->startDraft($owner, $owner, ProfileScope::global());
    $manual = $profiles->updateDraft($owner, $owner, ProfileScope::global(), $manual['id'], $manual['draft_version'], [['key' => 'city', 'value' => 'Synthetic pending city']]);
    $session = $flow->start($owner, $spaceA); $sessionId = $session['id'];
    $ok('session_starts_materials_with_two_scoped_drafts', $session['stage'] === 'materials' && $session['input_drafts']['global'] !== null && $session['input_drafts']['space'] !== null);
    $ok('session_create_resume_is_stable', $flow->start($owner, $spaceA)['id'] === $sessionId);
    $ok('manual_draft_is_not_adopted_or_replaced', $session['input_drafts']['global']['id'] !== $manual['id'] && $profiles->getDraft($owner, $owner, ProfileScope::global(), $manual['id'])['fields'] == $manual['fields']);
    $ok('session_refs_do_not_copy_profile_or_answers', !isset($session['resource_refs']['attributes']) && !isset($session['resource_refs']['answers']));
    $denied('session_is_owner_only', fn() => $flow->get($viewer, $sessionId), 404);
    $denied('outsider_cannot_start_space_flow', fn() => $flow->start($outsider, $spaceA), 403);
    $denied('forged_space_returns_permission_error', fn() => $flow->start($owner, 2147483647), 403);
    $session = $flow->update($owner, $sessionId, $session['version'], ['action' => 'save_materials', 'draft_versions' => $versions($session, 'input_drafts'), 'global_fields' => [['key' => 'bio', 'value' => 'Synthetic self introduction', 'visibility' => 'private']], 'space_fields' => []]);
    $ok('saving_materials_does_not_publish', $session['profiles']['global']['attributes'] === []);
    $storedRefs = (new Query())->select('resource_refs_json')->from('{{%matcher_onboarding_session}}')->where(['id' => $sessionId])->scalar($db);
    $ok('session_database_contains_references_not_self_description', !str_contains((string)$storedRefs, 'Synthetic self introduction'));
    $session = $flow->update($owner, $sessionId, $session['version'], ['action' => 'move', 'stage' => 'review']);
    $session = $flow->update($owner, $sessionId, $session['version'], ['action' => 'review_confirm', 'confirmation_intent' => 'confirm', 'draft_versions' => $versions($session, 'input_drafts')]);
    $ok('review_confirms_explicit_values_and_preserves_visibility', $session['profiles']['global']['attributes'][0]['visibility'] === 'private' && $session['stage'] === 'questions');
    $session = $flow->prepareQuestions($owner, $sessionId, $session['version']); $batch = $session['question_batch'];
    $ok('saved_batch_has_three_to_eight_questions', count($batch['questions']) >= 3 && count($batch['questions']) <= 8);
    $ok('question_json_is_native_array', $db->createCommand('SELECT JSON_TYPE(questions_json) FROM {{%matcher_profile_question_batch}} WHERE id=:id', [':id' => $batch['id']])->queryScalar() === 'ARRAY');
    $ok('saved_question_ids_and_options_survive_reload', $questions->get($owner, $batch['id'])['questions'] == $batch['questions']);
    $denied('batch_is_owner_only', fn() => $questions->get($viewer, $batch['id']), 404);
    foreach ($batch['questions'] as $question) { $batch = $questions->answer($owner, $batch['id'], $question['id'], 0, ['answer_type' => 'options', 'selected_options' => [$question['options'][0]['code']]]); }
    $ok('answers_are_one_row_per_question', (int)(new Query())->from('{{%matcher_profile_question_answer}}')->where(['batch_id' => $batch['id']])->count('*', $db) === count($batch['questions']));
    $ok('answer_options_use_json_arrays', $db->createCommand('SELECT COUNT(*) FROM {{%matcher_profile_question_answer}} WHERE batch_id=:id AND JSON_TYPE(selected_options_json)=:type', [':id' => $batch['id'], ':type' => 'ARRAY'])->queryScalar() == count($batch['questions']));
    $first = $batch['questions'][0];
    $denied('stale_answer_is_rejected', fn() => $questions->answer($owner, $batch['id'], $first['id'], 0, ['answer_type' => 'skipped']), 409);
    $denied('forged_option_is_rejected', fn() => $questions->answer($owner, $batch['id'], $first['id'], 1, ['answer_type' => 'options', 'selected_options' => ['forged_option']]), 422);
    $fresh = $flow->get($owner, $sessionId);
    $session = $flow->synthesize($owner, $sessionId, $fresh['version'], $batch['version']);
    $ok('synthesis_keeps_current_profile_unpublished', count($session['profiles']['global']['attributes']) === 1 && $session['profiles']['space']['attributes'] === []);
    $ok('synthesis_generates_separate_global_and_space_drafts', count($session['output_drafts']['global']['fields']) > 0 && count($session['output_drafts']['space']['fields']) > 0);
    $ok('synthesis_is_rules_with_zero_model_calls', $session['generation_mode'] === 'rules' && $session['llm_calls'] === 0 && $session['question_batch']['llm_calls'] === 0);
    $same = $flow->synthesize($owner, $sessionId, $fresh['version'], $batch['version']);
    $ok('same_synthesis_reuses_output_drafts', $same['resource_refs']['output_drafts'] == $session['resource_refs']['output_drafts']);
    $session = $flow->update($owner, $sessionId, $session['version'], ['action' => 'move', 'stage' => 'privacy']);
    $beforeRevision = $session['profiles']['global']['revision']; $beforeSpaceRevision = $session['profiles']['space']['revision'];
    // Fail after both real scoped writes, inside the same outer transaction.
    // This needs no database trigger or extra privileges on the application account.
    $failingWorkflow = new class($profile->getProfileWorkflow(), $db) implements \humhub\modules\matcherProfile\domain\ports\ProfileWorkflow {
        public function __construct(private \humhub\modules\matcherProfile\domain\ports\ProfileWorkflow $inner, private \yii\db\Connection $db) {}
        public function transaction(int $ownerId, ?int $spaceId, callable $callback, bool $writable = true): mixed { return $this->inner->transaction($ownerId, $spaceId, $callback, $writable); }
        public function profiles(int $ownerId, ?int $spaceId): array { return $this->inner->profiles($ownerId, $spaceId); }
        public function createDraft(int $ownerId, ?int $spaceId): array { return $this->inner->createDraft($ownerId, $spaceId); }
        public function getDraft(int $ownerId, ?int $spaceId, string $id): array { return $this->inner->getDraft($ownerId, $spaceId, $id); }
        public function updateDraft(int $ownerId, ?int $spaceId, string $id, int $expectedVersion, array $fields): array { return $this->inner->updateDraft($ownerId, $spaceId, $id, $expectedVersion, $fields); }
        public function confirmDraft(int $ownerId, ?int $spaceId, string $id, int $expectedVersion, int $expectedRevision, ?array $attributeIds = null): array {
            $result = $this->inner->confirmDraft($ownerId, $spaceId, $id, $expectedVersion, $expectedRevision, $attributeIds);
            if ($spaceId !== null) { $this->db->createCommand('SELECT id FROM {{%s4_injected_failure_missing_table}}')->queryScalar(); }
            return $result;
        }
    };
    $failingFlow = new \humhub\modules\matcherOnboarding\application\OnboardingService($app->getModule('matcher-onboarding')->getOnboardingRepository(), $failingWorkflow, $questions);
    $complete = ['action' => 'complete', 'confirmation_intent' => 'confirm', 'draft_versions' => $versions($session, 'output_drafts'), 'expected_batch_version' => $batch['version']];
    try { $failingFlow->update($owner, $sessionId, $session['version'], $complete); throw new RuntimeException('injected fault was not reached'); }
    catch (\yii\db\Exception $error) { $ok('database_failure_after_both_scoped_writes_reached', true); }
    $afterFailure = $flow->get($owner, $sessionId);
    $ok('global_and_space_confirmation_roll_back_together', $afterFailure['profiles']['global']['revision'] === $beforeRevision && $afterFailure['profiles']['space']['revision'] === $beforeSpaceRevision);
    $ok('failed_completion_retains_session_and_drafts', $afterFailure['version'] === $session['version'] && $afterFailure['status'] === 'active' && $afterFailure['output_drafts']['global']['status'] === 'editing');
    $completed = $flow->update($owner, $sessionId, $session['version'], $complete);
    $ok('completion_persists_both_profiles_and_receipt', $completed['status'] === 'completed' && $completed['completed_at'] !== null && $completed['profiles']['global']['revision'] === $beforeRevision + 1 && $completed['profiles']['space']['revision'] === $beforeSpaceRevision + 1);
    $ok('completed_submission_replay_is_idempotent', $flow->update($owner, $sessionId, $session['version'], $complete)['version'] === $completed['version']);
    $ok('native_profile_binding_is_updated', (new Query())->select('title')->from('{{%profile}}')->where(['user_id' => $owner])->scalar($db) !== null);
    $ok('manual_draft_remains_private_and_intact', $profiles->getDraft($owner, $owner, ProfileScope::global(), $manual['id'])['fields'] == $manual['fields']);
    $newSpace = $flow->start($owner, $spaceB);
    $ok('new_space_starts_empty_but_reuses_global_habits', $newSpace['profiles']['space']['attributes'] === [] && in_array('communication_preference', array_column($newSpace['profiles']['global']['attributes'], 'key'), true));
    $newSpace = $flow->update($owner, $newSpace['id'], $newSpace['version'], ['action' => 'review_confirm', 'confirmation_intent' => 'confirm', 'draft_versions' => $versions($newSpace, 'input_drafts')]);
    $newSpace = $flow->prepareQuestions($owner, $newSpace['id'], $newSpace['version']);
    $db->createCommand()->delete('{{%space_membership}}', ['user_id' => $owner, 'space_id' => $spaceB])->execute();
    $denied('membership_removal_revokes_session_reads', fn() => $flow->get($owner, $newSpace['id']), 403);
    $denied('membership_removal_revokes_batch_reads', fn() => $questions->get($owner, $newSpace['question_batch']['id']), 403);
    $db->createCommand()->upsert('{{%space_membership}}', ['space_id' => $spaceB, 'user_id' => $owner, 'status' => 3])->execute();
    $global = $flow->start($viewer, null); $global = $flow->update($viewer, $global['id'], $global['version'], ['action' => 'review_confirm', 'confirmation_intent' => 'confirm', 'draft_versions' => $versions($global, 'input_drafts')]);
    $global = $flow->prepareQuestions($viewer, $global['id'], $global['version']); $globalBatch = $global['question_batch'];
    $ok('global_flow_never_asks_space_questions', count(array_filter($globalBatch['questions'], static fn(array $question): bool => $question['scope'] === 'space')) === 0);
    foreach ($globalBatch['questions'] as $question) { $globalBatch = $questions->answer($viewer, $globalBatch['id'], $question['id'], 0, ['answer_type' => 'skipped']); }
    $global = $flow->synthesize($viewer, $global['id'], $global['version'], $globalBatch['version']);
    $global = $flow->update($viewer, $global['id'], $global['version'], ['action' => 'move', 'stage' => 'privacy']);
    $global = $flow->update($viewer, $global['id'], $global['version'], ['action' => 'complete', 'confirmation_intent' => 'confirm', 'draft_versions' => $versions($global, 'output_drafts'), 'expected_batch_version' => $globalBatch['version']]);
    $ok('all_optional_questions_can_be_skipped_without_fabrication', $global['status'] === 'completed' && $global['profiles']['global']['attributes'] === []);
    $onboarding = $app->getModule('matcher-onboarding');
    $activeBeforeDisable = $flow->get($owner, $newSpace['id']);
    $workflowFingerprint = static function () use ($db): array {
        $result = [];
        foreach (['matcher_onboarding_session','matcher_profile_question_batch','matcher_profile_question_answer'] as $table) {
            $rows = (new Query())->from('{{%' . $table . '}}')->orderBy(['id' => SORT_ASC])->all($db);
            $result[$table] = ['count' => count($rows), 'sha256' => hash('sha256', json_encode($rows, JSON_THROW_ON_ERROR))];
        }
        return $result;
    };
    $workflowBefore = $workflowFingerprint();
    $migrationBefore = (new Query())->select('version')->from('{{%migration}}')->where(['version' => 'm261111_000001_onboarding_sessions'])->column($db);
    $onboarding->disable();
    $ok('optional_onboarding_disable_deregisters_only_the_flow', $app->getModule('matcher-onboarding') === null && !(new Query())->from('{{%module_enabled}}')->where(['module_id' => 'matcher-onboarding'])->exists($db));
    $ok('disable_preserves_sessions_questions_and_answers', $workflowFingerprint() === $workflowBefore);
    $ok('disable_preserves_migration_history', (new Query())->select('version')->from('{{%migration}}')->where(['version' => 'm261111_000001_onboarding_sessions'])->column($db) === $migrationBefore);
    $ok('ordinary_profile_and_privacy_modules_remain_enabled', $app->getModule('matcher-user-profile')->isEnabled && $app->getModule('matcher-profile-privacy')->isEnabled);
    $ordinaryDraft = $profiles->startDraft($owner, $owner, ProfileScope::global(), 'manual', false);
    $ordinaryDraft = $profiles->updateDraft($owner, $owner, ProfileScope::global(), $ordinaryDraft['id'], $ordinaryDraft['draft_version'], [['key' => 'city', 'value' => 'S4 synthetic independent edit']]);
    $profiles->confirmDraft($owner, $owner, ProfileScope::global(), $ordinaryDraft['id'], $ordinaryDraft['draft_version'], $ordinaryDraft['base_revision']);
    $ordinary = $profiles->getProfile($owner, $owner, ProfileScope::global());
    $ok('ordinary_edit_and_read_work_while_onboarding_is_disabled', in_array('S4 synthetic independent edit', array_column($ordinary['attributes'], 'value'), true));
    $visible = $app->getModule('matcher-profile-privacy')->getPrivacyService()->read($viewer, $owner, ProfileScope::global(), ['entry_type' => 'space', 'space_id' => $spaceA, 'purpose' => 'detail']);
    $ok('privacy_projection_remains_active_while_onboarding_is_disabled', !in_array('bio', array_column($visible['attributes'], 'key'), true) && in_array('role', array_column($visible['attributes'], 'key'), true));
    ob_start(); try { $enabled = $onboarding->enable(); } finally { ob_end_clean(); }
    $restored = $app->getModule('matcher-onboarding')->getOnboardingService()->get($owner, $newSpace['id']);
    $ok('reenable_restores_same_session_and_saved_answers', $enabled !== false && $restored['id'] === $activeBeforeDisable['id'] && $restored['version'] === $activeBeforeDisable['version'] && $restored['resource_refs'] == $activeBeforeDisable['resource_refs'] && $restored['question_batch']['id'] === $activeBeforeDisable['question_batch']['id']);
    $ok('reenable_retains_workflow_rows_and_reports_later_profile_edit', $workflowFingerprint() === $workflowBefore && $restored['profile_changed']);
    echo json_encode(['status' => 'passed', 'passed' => count($checks), 'checks' => $checks, 'llm_calls' => 0], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), PHP_EOL;
} catch (\Throwable $error) {
    if (isset($onboarding) && !$app->getModule('matcher-onboarding')) { $onboarding->getModuleService()->enable(); }
    fwrite(STDERR, json_encode(['status' => 'failed', 'type' => get_class($error), 'reason' => $error instanceof RuntimeException && !$error instanceof \yii\db\Exception ? $error->getMessage() : 'SQL integration failed', 'completed_checks' => $checks], JSON_THROW_ON_ERROR) . PHP_EOL); exit(1);
}
