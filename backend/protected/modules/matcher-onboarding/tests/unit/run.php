<?php
declare(strict_types=1);
$modules = dirname(__DIR__, 3);
spl_autoload_register(static function (string $class) use ($modules): void {
    foreach (['matcherProfile' => 'matcher-user-profile', 'matcherOnboarding' => 'matcher-onboarding'] as $namespace => $folder) {
        $prefix = implode(chr(92), ['humhub', 'modules', $namespace]) . chr(92);
        if (str_starts_with($class, $prefix)) { $file = $modules . '/' . $folder . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php'; if (is_file($file)) { require $file; } }
    }
});
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileRepository;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileAccessPolicy;
use humhub\modules\matcherProfile\adapters\memory\InMemoryQuestionRepository;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileWorkflow;
use humhub\modules\matcherProfile\application\ProfileService;
use humhub\modules\matcherProfile\application\QuestionService;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\rules\RuleQuestionProvider;
use humhub\modules\matcherProfile\domain\rules\RulesProfileComposer;
use humhub\modules\matcherOnboarding\adapters\memory\InMemoryOnboardingRepository;
use humhub\modules\matcherOnboarding\application\OnboardingService;
$checks = [];
function check(string $name, bool $valid): void { global $checks; if (!$valid) { throw new RuntimeException($name); } $checks[] = $name; }
function denies(string $name, callable $fn, int $status): void { try { $fn(); } catch (ProfileException $error) { check($name, $error->httpStatus === $status); return; } throw new RuntimeException($name . ': did not reject'); }
function context(): object {
    $e = new stdClass(); $e->repo = new InMemoryProfileRepository(); $e->access = new InMemoryProfileAccessPolicy();
    $e->access->users = [1, 2, 3]; $e->access->memberships = [10 => [1, 2], 20 => [1, 3]];
    $e->profile = new ProfileService($e->repo, $e->access); $e->qrepo = new InMemoryQuestionRepository(); $e->srepo = new InMemoryOnboardingRepository();
    $e->workflow = new InMemoryProfileWorkflow($e->repo, $e->profile, $e->access); $e->workflow->participants = [$e->qrepo, $e->srepo];
    $e->questions = new QuestionService($e->qrepo, $e->workflow); $e->flow = new OnboardingService($e->srepo, $e->workflow, $e->questions); return $e;
}
function versions(array $s, string $kind): array { $out = []; foreach ($s[$kind] as $scope => $draft) { if ($draft !== null) { $out[$scope] = ['draft_version' => $draft['draft_version'], 'base_revision' => $draft['base_revision']]; } } return $out; }
function act(object $e, array $s, string $action, array $extra = []): array { return $e->flow->update(1, $s['id'], $s['version'], ['action' => $action] + $extra); }
function reviewed(object $e, ?int $space = null): array { $s = $e->flow->start(1, $space); $s = act($e, $s, 'move', ['stage' => 'review']); return act($e, $s, 'review_confirm', ['confirmation_intent' => 'confirm', 'draft_versions' => versions($s, 'input_drafts')]); }
function answerAll(object $e, array $s, bool $skip = false): array {
    $s = $e->flow->prepareQuestions(1, $s['id'], $s['version']); $batch = $s['question_batch'];
    foreach ($batch['questions'] as $question) { $batch = $e->questions->answer(1, $batch['id'], $question['id'], 0, $skip ? ['answer_type' => 'skipped'] : ['answer_type' => 'options', 'selected_options' => [$question['options'][0]['code']]]); }
    return $e->flow->get(1, $s['id']);
}
function state(object $e): string { return serialize([$e->repo->states, $e->repo->attributes, $e->repo->revisions, $e->repo->drafts, $e->repo->native, $e->qrepo->batches, $e->qrepo->answerRows, $e->srepo->sessions]); }

$e = context();
$manual = $e->profile->startDraft(1, 1, ProfileScope::global());
$manual = $e->profile->updateDraft(1, 1, ProfileScope::global(), $manual['id'], 1, [['key' => 'bio', 'value' => 'Manual draft survives']]);
$s = $e->flow->start(1, 10);
check('session_starts_materials_version_one', $s['stage'] === 'materials' && $s['version'] === 1 && $s['status'] === 'active');
check('start_resumes_exact_active_context', $e->flow->start(1, 10)['id'] === $s['id']);
check('different_space_has_separate_session', $e->flow->start(1, 20)['id'] !== $s['id']);
check('global_context_is_independent', $e->flow->start(1, null)['space_id'] === null);
check('session_stores_references_not_profile_or_answers', !isset($e->srepo->sessions[$s['id']]['profiles'], $e->srepo->sessions[$s['id']]['question_batch']) && !str_contains(json_encode($e->srepo->sessions), 'Manual draft survives'));
check('input_draft_does_not_take_over_manual_draft', $s['input_drafts']['global']['id'] !== $manual['id']);
check('rules_mode_records_zero_llm_calls', $s['generation_mode'] === 'rules' && $s['llm_calls'] === 0);
denies('anonymous_start_denied', fn() => $e->flow->start(0, null), 401);
denies('unjoined_space_start_denied', fn() => $e->flow->start(2, 20), 403);
denies('session_is_owner_only', fn() => $e->flow->get(2, $s['id']), 404);
denies('cannot_jump_ahead', fn() => act($e, $s, 'move', ['stage' => 'privacy']), 422);
denies('unknown_session_action_rejected', fn() => act($e, $s, 'unknown'), 422);
$before = state($e);
denies('wrong_scope_field_rejected', fn() => act($e, $s, 'save_materials', ['draft_versions' => versions($s, 'input_drafts'), 'global_fields' => [['key' => 'headline', 'value' => 'Must roll back']], 'space_fields' => [['key' => 'communication_preference', 'value' => ['codes' => ['async']]]]]), 422);
check('second_scope_failure_rolls_back_first_draft', state($e) === $before);
denies('null_operations_rejected_as_validation', fn() => act($e, $s, 'save_materials', ['draft_versions' => versions($s, 'input_drafts'), 'global_fields' => null]), 422);
$s = act($e, $s, 'save_materials', ['draft_versions' => versions($s, 'input_drafts'), 'global_fields' => [['key' => 'headline', 'value' => 'Synthetic engineer'], ['key' => 'bio', 'value' => 'Synthetic existing material', 'visibility' => 'friends']], 'space_fields' => [['key' => 'event_goal', 'value' => ['codes' => ['prototype']]]]]);
check('materials_stay_unconfirmed_until_review', $s['profiles']['global']['attributes'] === [] && $s['profiles']['space']['attributes'] === []);
check('saved_materials_survive_reload', $e->flow->get(1, $s['id'])['input_drafts'] === $s['input_drafts']);
denies('stale_session_version_rejected', fn() => $e->flow->update(1, $s['id'], 1, ['action' => 'move', 'stage' => 'review']), 409);
$s = act($e, $s, 'move', ['stage' => 'review']);
denies('review_requires_explicit_confirmation', fn() => act($e, $s, 'review_confirm', ['draft_versions' => versions($s, 'input_drafts')]), 422);
$s = act($e, $s, 'review_confirm', ['confirmation_intent' => 'confirm', 'draft_versions' => versions($s, 'input_drafts')]);
check('review_confirms_global_and_space_atomically', $s['profiles']['global']['revision'] === 1 && $s['profiles']['space']['revision'] === 1 && $s['stage'] === 'questions');
check('review_keeps_selected_privacy', array_column($s['profiles']['global']['attributes'], 'visibility', 'key')['bio'] === 'friends');
check('manual_draft_unchanged_by_review', $e->repo->drafts[$manual['id']]['fields'] === $manual['fields'] && $e->repo->drafts[$manual['id']]['status'] === 'editing');
$expected = $s['version']; $s = $e->flow->prepareQuestions(1, $s['id'], $expected); $batch = $s['question_batch'];
check('space_batch_has_three_to_eight_saved_questions', count($batch['questions']) >= 3 && count($batch['questions']) <= 8);
check('batch_replay_does_not_duplicate_questions', $e->flow->prepareQuestions(1, $s['id'], $expected)['question_batch']['id'] === $batch['id']);
check('question_options_stable_after_reload', $e->questions->get(1, $batch['id'])['questions'] === $batch['questions']);
check('questions_have_stable_ids_and_explanations', count(array_unique(array_column($batch['questions'], 'id'))) === count($batch['questions']) && !in_array('', array_column($batch['questions'], 'reason'), true));
denies('batch_is_owner_only', fn() => $e->questions->get(2, $batch['id']), 404);
denies('missing_answers_block_synthesis', fn() => $e->flow->synthesize(1, $s['id'], $s['version'], $batch['version']), 422);
$q = $batch['questions'][0];
denies('unknown_question_id_rejected', fn() => $e->questions->answer(1, $batch['id'], 'unknown', 0, ['answer_type' => 'skipped']), 404);
denies('unknown_option_rejected', fn() => $e->questions->answer(1, $batch['id'], $q['id'], 0, ['answer_type' => 'options', 'selected_options' => ['not-an-option']]), 422);
denies('duplicate_option_rejected', fn() => $e->questions->answer(1, $batch['id'], $q['id'], 0, ['answer_type' => 'options', 'selected_options' => [$q['options'][0]['code'], $q['options'][0]['code']]]), 422);
denies('empty_free_answer_rejected', fn() => $e->questions->answer(1, $batch['id'], $q['id'], 0, ['answer_type' => 'free_text', 'free_text' => ' ']), 422);
denies('skipped_answer_has_no_hidden_content', fn() => $e->questions->answer(1, $batch['id'], $q['id'], 0, ['answer_type' => 'skipped', 'free_text' => 'hidden']), 422);
$priorSessionVersion = $s['version'];
foreach ($batch['questions'] as $question) { $batch = $e->questions->answer(1, $batch['id'], $question['id'], 0, ['answer_type' => 'options', 'selected_options' => [$question['options'][0]['code']]]); }
check('answer_saving_increments_batch_not_session', $batch['version'] === count($batch['questions']) + 1 && $e->flow->get(1, $s['id'])['version'] === $priorSessionVersion);
check('each_answer_owns_its_version', array_unique(array_column($batch['answers'], 'version')) === [1]);
denies('stale_single_answer_version_rejected', fn() => $e->questions->answer(1, $batch['id'], $q['id'], 0, ['answer_type' => 'skipped']), 409);
$noop = $e->questions->answer(1, $batch['id'], $q['id'], 1, ['answer_type' => 'options', 'selected_options' => [$q['options'][0]['code']]]);
check('unchanged_answer_is_a_true_noop', $noop['version'] === $batch['version']);
$s = act($e, $s, 'question_position', ['question_index' => 2]);
check('question_position_survives_reload', $e->flow->get(1, $s['id'])['resource_refs']['question_index'] === 2);
$expected = $s['version']; $s = $e->flow->synthesize(1, $s['id'], $expected, $batch['version']);
check('synthesis_returns_editable_drafts', $s['stage'] === 'draft' && $s['output_drafts']['global']['status'] === 'editing' && $s['output_drafts']['space']['status'] === 'editing');
check('synthesis_does_not_publish_answers', count($s['profiles']['global']['attributes']) === 2 && count($s['profiles']['space']['attributes']) === 1);
check('synthesis_replay_keeps_same_draft_ids', $e->flow->synthesize(1, $s['id'], $expected, $batch['version'])['resource_refs']['output_drafts'] === $s['resource_refs']['output_drafts']);
check('global_and_space_questions_map_to_matching_drafts', !array_filter($s['output_drafts']['global']['fields'], static fn(array $f): bool => str_starts_with($f['key'], 'event_')) && !array_filter($s['output_drafts']['space']['fields'], static fn(array $f): bool => !str_starts_with($f['key'], 'event_')));
$role = array_values(array_filter($s['output_drafts']['global']['fields'], static fn(array $f): bool => $f['key'] === 'role'))[0];
$s = act($e, $s, 'save_drafts', ['draft_versions' => versions($s, 'output_drafts'), 'global_fields' => [['attribute_id' => $role['attribute_id'], 'visibility' => 'private']]]);
check('generated_field_privacy_is_editable', array_column($s['output_drafts']['global']['preview_attributes'], 'visibility', 'key')['role'] === 'private');
$s = act($e, $s, 'move', ['stage' => 'privacy']);
$payload = ['action' => 'complete', 'confirmation_intent' => 'confirm', 'draft_versions' => versions($s, 'output_drafts'), 'expected_batch_version' => $batch['version']];
$before = state($e); $e->workflow->failConfirmSpace = 10;
try { $e->flow->update(1, $s['id'], $s['version'], $payload); throw new RuntimeException('Expected transaction failure'); } catch (RuntimeException $error) { check('second_scope_confirmation_failure_reached', $error->getMessage() === 'Synthetic second-scope confirmation failure.'); }
check('second_scope_failure_rolls_back_profile_and_progress', state($e) === $before); $e->workflow->failConfirmSpace = null;
$expected = $s['version']; $s = $e->flow->update(1, $s['id'], $expected, $payload);
check('completed_session_has_receipt_and_timestamp', $s['status'] === 'completed' && $s['stage'] === 'completed' && is_string($s['completed_at']));
check('completion_confirms_both_scopes_once', $s['profiles']['global']['revision'] === 2 && $s['profiles']['space']['revision'] === 2);
check('completion_keeps_field_privacy', array_column($s['profiles']['global']['attributes'], 'visibility', 'key')['role'] === 'private');
check('complete_retry_returns_same_confirmation', $e->flow->update(1, $s['id'], $expected, $payload)['version'] === $s['version']);
check('complete_does_not_require_manual_draft_discard', $e->repo->drafts[$manual['id']]['status'] === 'editing');
check('new_session_after_completion_has_fresh_progress', $e->flow->start(1, 10)['id'] !== $s['id']);
check('other_space_does_not_inherit_current_goal', $e->workflow->profiles(1, 20)['space']['attributes'] === []);
check('global_communication_survives_space_change', in_array('communication_preference', array_column($e->workflow->profiles(1, 20)['global']['attributes'], 'key'), true));

$e = context(); $s = answerAll($e, reviewed($e, 10)); $batch = $s['question_batch']; $s = $e->flow->synthesize(1, $s['id'], $s['version'], $batch['version']); $oldOutputs = $s['resource_refs']['output_drafts'];
$q = $batch['questions'][0]; $batch = $e->questions->answer(1, $batch['id'], $q['id'], 1, ['answer_type' => 'free_text', 'free_text' => '本次想做新的协作实验']);
check('changing_answer_marks_existing_synthesis_outdated', $e->flow->get(1, $s['id'])['needs_resynthesis']);
denies('outdated_synthesis_cannot_advance_to_privacy', fn() => act($e, $s, 'move', ['stage' => 'privacy']), 409);
$s = $e->flow->synthesize(1, $s['id'], $s['version'], $batch['version']);
check('explicit_regeneration_creates_new_drafts', $s['resource_refs']['output_drafts'] !== $oldOutputs);
check('previous_synthesis_drafts_remain_available', isset($e->repo->drafts[$oldOutputs['global']], $e->repo->drafts[$oldOutputs['space']]));
check('free_answer_remains_self_reported', str_contains(json_encode($s['output_drafts']['space']['fields'], JSON_UNESCAPED_UNICODE), '本次想做新的协作实验'));
$beforeInputs = $s['resource_refs']['input_drafts']; $s = act($e, $s, 'move', ['stage' => 'review']);
$s = act($e, $s, 'save_materials', ['draft_versions' => versions($s, 'input_drafts'), 'global_fields' => [['key' => 'bio', 'value' => 'Return and add material']]]);
$s = act($e, $s, 'review_confirm', ['confirmation_intent' => 'confirm', 'draft_versions' => versions($s, 'input_drafts')]);
check('return_review_can_edit_and_confirm_more_materials', in_array('bio', array_column($s['profiles']['global']['attributes'], 'key'), true));
check('changed_review_invalidates_prior_question_reference', $s['question_batch'] === null && $s['output_drafts']['global'] === null);
check('old_question_answers_preserved', count($e->qrepo->answers($batch['id'])) === count($batch['questions']));
$s = $e->flow->prepareQuestions(1, $s['id'], $s['version']);
$firstInput = $s['resource_refs']['input_drafts']['global']; $s = act($e, $s, 'move', ['stage' => 'review']);
check('confirmed_input_draft_reopens_as_separate_draft', $s['input_drafts']['global']['status'] === 'editing' && $s['resource_refs']['input_drafts']['global'] !== $firstInput);

$e = context(); $s = answerAll($e, reviewed($e), true); $s = $e->flow->synthesize(1, $s['id'], $s['version'], $s['question_batch']['version']);
check('all_skipped_generates_no_invented_fields', $s['output_drafts']['global']['fields'] === [] && $s['output_drafts']['space'] === null);
$s = act($e, $s, 'move', ['stage' => 'privacy']);
$s = act($e, $s, 'complete', ['confirmation_intent' => 'confirm', 'draft_versions' => versions($s, 'output_drafts'), 'expected_batch_version' => $s['question_batch']['version']]);
check('optional_empty_profile_can_finish', $s['status'] === 'completed' && $s['profiles']['global']['revision'] === 0 && $s['profiles']['global']['attributes'] === []);

$e = context(); $s = answerAll($e, reviewed($e)); $batchId = $s['question_batch']['id'];
$external = $e->profile->startDraft(1, 1, ProfileScope::global());
$external = $e->profile->updateDraft(1, 1, ProfileScope::global(), $external['id'], 1, [['key' => 'headline', 'value' => 'New ordinary profile']]);
$e->profile->confirmDraft(1, 1, ProfileScope::global(), $external['id'], $external['draft_version'], $external['base_revision']);
check('ordinary_edit_is_visible_to_onboarding', $e->flow->get(1, $s['id'])['profile_changed']);
denies('old_batch_cannot_override_new_profile', fn() => $e->flow->synthesize(1, $s['id'], $s['version'], $s['question_batch']['version']), 409);
$s = act($e, $s, 'reconcile');
check('reconcile_resumes_review_of_latest_profile', $s['stage'] === 'review' && !$s['profile_changed'] && $s['profiles']['global']['attributes'][0]['value'] === 'New ordinary profile');
check('reconcile_preserves_old_answers_and_drafts', count($e->qrepo->answers($batchId)) > 0 && count($s['resource_refs']['history']) === 1);
check('reconcile_requires_new_review_before_questions', $s['question_batch'] === null && !$s['resource_refs']['review_confirmed']);
$e->access->maintenance = true;
check('maintenance_keeps_read_access', $e->flow->get(1, $s['id'])['id'] === $s['id']);
denies('maintenance_blocks_onboarding_mutations', fn() => act($e, $s, 'move', ['stage' => 'materials']), 503);
$e->access->maintenance = false;
$stored = &$e->srepo->sessions[$s['id']]; $stored['resource_refs']['profile_versions'] = ['space' => null, 'global' => $stored['resource_refs']['profile_versions']['global']]; unset($stored);
check('JSON_object_order_does_not_mark_profile_changed', !$e->flow->get(1, $s['id'])['profile_changed']);
$s = $e->flow->get(1, $s['id']); $s = act($e, $s, 'review_confirm', ['confirmation_intent' => 'confirm', 'draft_versions' => versions($s, 'input_drafts')]);
check('JSON_object_order_does_not_block_review', $s['stage'] === 'questions');
$s = $e->flow->prepareQuestions(1, $s['id'], $s['version']); $b = $s['question_batch'];
$e->qrepo->batches[$b['id']]['profile_versions'] = ['space' => null, 'global' => $b['profile_versions']['global']];
foreach ($b['questions'] as $q) { $b = $e->questions->answer(1, $b['id'], $q['id'], 0, ['answer_type' => 'skipped']); }
check('JSON_object_order_does_not_block_synthesis', $e->flow->synthesize(1, $s['id'], $s['version'], $b['version'])['stage'] === 'draft');

$resume = context(); $rs = answerAll($resume, reviewed($resume, 10)); $initialSynthesisVersion = $rs['version'];
$rs = $resume->flow->synthesize(1, $rs['id'], $initialSynthesisVersion, $rs['question_batch']['version']);
$rs = act($resume, $rs, 'save_drafts', ['draft_versions' => versions($rs, 'output_drafts'), 'global_fields' => [['key' => 'bio', 'value' => 'Keep my edited draft']]]);
$editedDrafts = $rs['output_drafts']; $savedBatchVersion = $rs['question_batch']['version'];
$rs = act($resume, $rs, 'move', ['stage' => 'questions']);
$replayedOld = $resume->flow->synthesize(1, $rs['id'], $initialSynthesisVersion, $savedBatchVersion);
check('old_synthesis_replay_does_not_undo_return_to_questions', $replayedOld['stage'] === 'questions' && $replayedOld['version'] === $rs['version']);
$resumeRequestVersion = $rs['version']; $rs = $resume->flow->synthesize(1, $rs['id'], $resumeRequestVersion, $savedBatchVersion);
check('explicit_unchanged_resynthesis_resumes_draft_stage', $rs['stage'] === 'draft' && $rs['version'] === $resumeRequestVersion + 1);
check('resuming_synthesis_preserves_draft_ids_versions_and_edits', $rs['output_drafts'] === $editedDrafts);
check('resume_synthesis_retry_is_idempotent', $resume->flow->synthesize(1, $rs['id'], $resumeRequestVersion, $savedBatchVersion)['version'] === $rs['version']);
$rs = act($resume, $rs, 'move', ['stage' => 'privacy']);
$replayedOld = $resume->flow->synthesize(1, $rs['id'], $initialSynthesisVersion, $savedBatchVersion);
check('old_synthesis_replay_does_not_rewind_privacy_stage', $replayedOld['stage'] === 'privacy' && $replayedOld['version'] === $rs['version']);

$edge = context(); $edgeSession = reviewed($edge); $edgeSession = $edge->flow->prepareQuestions(1, $edgeSession['id'], $edgeSession['version']);
$expectationQuestion = array_values(array_filter($edgeSession['question_batch']['questions'], static fn(array $question): bool => $question['target_key'] === 'seeking'))[0];
denies('combined_expectation_answer_respects_field_limit_before_save', fn() => $edge->questions->answer(1, $edgeSession['question_batch']['id'], $expectationQuestion['id'], 0, ['answer_type' => 'options', 'selected_options' => [$expectationQuestion['options'][0]['code']], 'free_text' => str_repeat('字', 1000)]), 422);

$profiles = ['global' => ['revision' => 0, 'attributes' => []], 'space' => null]; $provider = new RuleQuestionProvider();
$qs = $provider->questions($profiles, null); check('global_questions_exclude_Space_targets', !in_array('space', array_column($qs, 'scope'), true));
$profiles['global']['attributes'] = array_map(static fn(array $q): array => ['key' => $q['target_key']], $qs);
check('well_filled_profile_gets_three_review_questions', count($provider->questions($profiles, null)) === 3);
$profiles = ['global' => ['revision' => 1, 'attributes' => [['attribute_id' => QuestionService::uuid(), 'key' => 'role', 'value' => ['label' => '后端开发', 'code' => 'backend', 'note' => 'Existing note'], 'visibility' => 'private'], ['attribute_id' => QuestionService::uuid(), 'key' => 'interest', 'value' => ['code' => 'ai', 'label' => '人工智能'], 'visibility' => 'friends']]], 'space' => null];
$qs = array_values(array_filter($provider->questions(['global' => ['attributes' => []], 'space' => null], null), static fn(array $q): bool => in_array($q['target_key'], ['role', 'interest'], true)));
$answers = array_map(static fn(array $q): array => ['question_id' => $q['id'], 'answer_type' => 'options', 'selected_options' => [$q['options'][0]['code']], 'free_text' => ''], $qs);
$c = (new RulesProfileComposer())->compose($profiles, $qs, $answers);
check('existing_many_values_and_notes_are_preserved', count($c['global_fields']) === 1 && $c['global_fields'][0]['key'] === 'headline');
check('derived_headline_inherits_most_restrictive_source', $c['global_fields'][0]['visibility'] === 'private');
$profiles['global']['attributes'][0]['visibility'] = 'friends'; $c = (new RulesProfileComposer())->compose($profiles, $qs, $answers);
check('derived_headline_preserves_friends_scope', $c['global_fields'][0]['visibility'] === 'friends');

$e = context(); $s = reviewed($e, 10); $before = state($e); $e->srepo->failSave = true;
try { $e->flow->prepareQuestions(1, $s['id'], $s['version']); throw new RuntimeException('Expected failure'); } catch (RuntimeException $error) { check('session_failure_reached', $error->getMessage() === 'Synthetic session failure.'); }
check('session_write_failure_rolls_back_batch_creation', state($e) === $before); $e->srepo->failSave = false;
$s = $e->flow->prepareQuestions(1, $s['id'], $s['version']); $batch = $s['question_batch']; $before = state($e); $e->qrepo->failOn = 'saveBatch';
try { $e->questions->answer(1, $batch['id'], $batch['questions'][0]['id'], 0, ['answer_type' => 'skipped']); throw new RuntimeException('Expected failure'); } catch (RuntimeException $error) { check('batch_failure_reached', $error->getMessage() === 'Synthetic question failure.'); }
check('batch_failure_rolls_back_answer_row', state($e) === $before); $e->qrepo->failOn = null;
$e->access->memberships[10] = [2];
denies('membership_revocation_blocks_existing_session', fn() => $e->flow->get(1, $s['id']), 403);
denies('membership_revocation_blocks_existing_answers', fn() => $e->questions->get(1, $batch['id']), 403);

echo json_encode(['status' => 'passed', 'passed' => count($checks), 'checks' => $checks, 'database_calls' => 0, 'llm_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), PHP_EOL;
