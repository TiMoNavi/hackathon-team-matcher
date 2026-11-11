<?php
declare(strict_types=1);
// Existing in-memory fixtures exercise only fabricated people/materials and synthetic engines.
ob_start(); require __DIR__ . '/s6_workflow.php'; ob_end_clean();

use humhub\modules\matcherOnboarding\application\OnboardingService;
use humhub\modules\matcherOnboarding\domain\SessionProgress;
use humhub\modules\matcherProfile\application\ProfileAiJobService;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;

$begin = count($checks);
function step(array $progress, string $stage): array { return array_column($progress['steps'], null, 'stage')[$stage]; }
function syntheticProfile(object $e, string $value): array
{
    $draft = $e->profile->startDraft(1, 1, ProfileScope::global());
    $field = ['key' => 'bio', 'value' => $value];
    foreach ($draft['preview_attributes'] as $existing) { if ($existing['key'] === 'bio') { $field['attribute_id'] = $existing['attribute_id']; } }
    $draft = $e->profile->updateDraft(1, 1, ProfileScope::global(), $draft['id'], $draft['draft_version'], [$field]);
    return $e->profile->confirmDraft(1, 1, ProfileScope::global(), $draft['id'], $draft['draft_version'], $draft['base_revision']);
}
function flowAiContext(): object
{
    $e = aiContext(); $e->now = '2026-11-12 04:00:00'; $e->engineResolutions = 0; $e->engineEnabled = true;
    $e->ai = new ProfileAiJobService($e->arepo, $e->bridge, function () use ($e) { ++$e->engineResolutions; return $e->engineEnabled ? $e->engine : null; }, fn() => $e->now);
    $e->summaryReads = 0;
    $e->flow = new OnboardingService($e->srepo, $e->workflow, $e->questions, null, fn(int $owner, string $session): array => $e->ai->progressForSession($owner, $session), function (int $owner, string $batch, int $index) use ($e): array { ++$e->summaryReads; return $e->questions->getProgressCounts($owner, $batch, $index); });
    return $e;
}
function progressReadOnly(object $e, string $id, string $name): array
{
    $before = state($e); $jobs = isset($e->arepo) ? serialize($e->arepo->jobs) : null;
    $calls = $e->engine->calls ?? 0; $resolutions = $e->engineResolutions ?? 0;
    $p = $e->flow->getProgress(1, $id); $again = $e->flow->getProgress(1, $id);
    check($name . '_stable', $p === $again);
    check($name . '_no_writes', state($e) === $before && (!isset($e->arepo) || serialize($e->arepo->jobs) === $jobs));
    check($name . '_no_model_or_engine_resolution', ($e->engine->calls ?? 0) === $calls && ($e->engineResolutions ?? 0) === $resolutions);
    return $p;
}

$e = context(); $s = $e->flow->start(1, 10); $p = $s['progress'];
check('initial_has_five_real_stages', $p['schema_version'] === 1 && $p['stage_index'] === 1 && $p['stage_count'] === 5 && count($p['steps']) === 5);
check('initial_waits_without_fake_percentage', $p['state'] === 'waiting_input' && $p['percent'] === null && $p['poll_after_ms'] === 0);
check('initial_current_and_accessible_are_distinct', step($p, 'materials')['current'] && step($p, 'review')['accessible'] && !step($p, 'review')['current'] && !step($p, 'privacy')['accessible']);
check('initial_no_completed_steps', array_column($p['steps'], 'completed') === [false, false, false, false, false]);
check('no_resolver_is_valid_non_AI_flow', $p['tasks'] === [] && !$p['tasks_has_more']);
check('no_batch_has_no_invented_index', $p['questions'] === ['total' => 0, 'answered' => 0, 'skipped' => 0, 'remaining' => 0, 'current_index' => null]);
check('created_and_compact_GET_share_projection', $e->flow->getProgress(1, $s['id']) === $p);
progressReadOnly($e, $s['id'], 'initial_poll');

$s = act($e, $s, 'save_materials', ['draft_versions' => versions($s, 'input_drafts'), 'global_fields' => [['key' => 'bio', 'value' => 'Synthetic S76 material marker', 'visibility' => 'private']]]);
check('save_materials_changes_version_token', $s['progress']['session_version'] === $s['version'] && $s['progress']['revision_token'] !== $p['revision_token']);
check('max_stage_never_implies_confirmation', $s['max_stage'] === 'review' && !step($s['progress'], 'review')['completed']);
$s = act($e, $s, 'move', ['stage' => 'review']);
check('entering_review_does_not_complete_materials', $s['progress']['stage_index'] === 2 && !step($s['progress'], 'materials')['completed']);
$s = act($e, $s, 'review_confirm', ['confirmation_intent' => 'confirm', 'draft_versions' => versions($s, 'input_drafts')]);
check('confirmed_materials_complete_first_two_steps', array_column($s['progress']['steps'], 'completed') === [true, true, false, false, false]);
check('questions_need_explicit_preparation', $s['progress']['stage_index'] === 3 && $s['progress']['next_actions'] === ['prepare_questions']);
$s = $e->flow->prepareQuestions(1, $s['id'], $s['version']); $batch = $s['question_batch']; $sessionVersion = $s['version']; $token = $s['progress']['revision_token'];
$first = $batch['questions'][0]; $second = $batch['questions'][1];
$batch = $e->questions->answer(1, $batch['id'], $first['id'], 0, ['answer_type' => 'free_text', 'free_text' => 'Synthetic S76 answer marker']);
$p = $e->flow->getProgress(1, $s['id']);
check('answer_only_updates_revision_not_session_version', $p['session_version'] === $sessionVersion && $p['revision_token'] !== $token);
check('answered_excludes_skipped', $p['questions']['answered'] === 1 && $p['questions']['skipped'] === 0 && $p['questions']['remaining'] === count($batch['questions']) - 1);
$token = $p['revision_token']; $counts = $p['questions'];
$batch = $e->questions->answer(1, $batch['id'], $first['id'], 1, ['answer_type' => 'free_text', 'free_text' => 'Synthetic S76 changed answer marker']);
$p = $e->flow->getProgress(1, $s['id']);
check('same_count_answer_edit_changes_token', $p['questions'] === $counts && $p['session_version'] === $sessionVersion && $p['revision_token'] !== $token);
$batch = $e->questions->answer(1, $batch['id'], $second['id'], 0, ['answer_type' => 'skipped']);
$p = $e->flow->getProgress(1, $s['id']);
check('skipped_is_separate_count', $p['questions']['answered'] === 1 && $p['questions']['skipped'] === 1 && $p['questions']['remaining'] === count($batch['questions']) - 2);
foreach (array_slice($batch['questions'], 2) as $q) { $batch = $e->questions->answer(1, $batch['id'], $q['id'], 0, ['answer_type' => 'options', 'selected_options' => [$q['options'][0]['code']]]); }
$s = act($e, $s, 'question_position', ['question_index' => 2]);
check('question_position_survives_saved_session', $s['progress']['questions']['current_index'] === 2);
check('fully_processed_answers_are_ready_not_completed', $s['progress']['state'] === 'ready' && $s['progress']['questions']['remaining'] === 0 && step($s['progress'], 'questions')['completed'] && !step($s['progress'], 'privacy')['completed']);
$e->flow = new OnboardingService($e->srepo, $e->workflow, $e->questions);
check('new_service_restores_progress_exactly', $e->flow->getProgress(1, $s['id']) === $s['progress']);
progressReadOnly($e, $s['id'], 'answered_poll');

$s = $e->flow->synthesize(1, $s['id'], $s['version'], $batch['version']);
check('generated_draft_waits_for_review', $s['progress']['state'] === 'ready' && $s['progress']['stage_index'] === 4 && !$s['progress']['steps'][3]['completed']);
check('draft_allows_privacy_without_finishing', step($s['progress'], 'privacy')['accessible'] && !step($s['progress'], 'privacy')['completed']);
$headline = array_values(array_filter($s['output_drafts']['global']['preview_attributes'], static fn(array $item): bool => $item['key'] === 'headline'))[0];
$s = act($e, $s, 'save_drafts', ['draft_versions' => versions($s, 'output_drafts'), 'global_fields' => [['attribute_id' => $headline['attribute_id'], 'key' => 'headline', 'value' => 'Synthetic S76 manual draft marker', 'visibility' => 'private']]]);
$manual = $s['output_drafts']; $token = $s['progress']['revision_token'];
check('compact_response_excludes_private_materials_answers_and_drafts', !str_contains(json_encode($s['progress']), 'S76') && !isset($s['progress']['profiles'], $s['progress']['resource_refs'], $s['progress']['output_drafts'], $s['progress']['question_batch']));
$s = act($e, $s, 'move', ['stage' => 'questions']);
check('return_keeps_current_separate_from_reached_stage', step($s['progress'], 'questions')['current'] && step($s['progress'], 'draft')['accessible'] && !step($s['progress'], 'draft')['completed']);
$s = $e->flow->synthesize(1, $s['id'], $s['version'], $batch['version']);
check('unchanged_resynthesis_restores_edited_draft', $s['output_drafts'] === $manual && $s['progress']['stage'] === 'draft');
$batch = $e->questions->answer(1, $batch['id'], $first['id'], 2, ['answer_type' => 'free_text', 'free_text' => 'Synthetic S76 answer after synthesis']);
$p = $e->flow->getProgress(1, $s['id']);
check('changed_answers_require_resynthesis', $p['state'] === 'needs_attention' && $p['reasons'] === ['needs_resynthesis'] && $p['next_actions'] === ['synthesize']);
check('outdated_draft_and_privacy_are_inaccessible', !step($p, 'draft')['accessible'] && !step($p, 'privacy')['accessible']);
$s = $e->flow->synthesize(1, $s['id'], $s['version'], $batch['version']);
check('resynthesis_clears_blocking_reason', $s['progress']['reasons'] === [] && $s['progress']['stage'] === 'draft');
$s = act($e, $s, 'move', ['stage' => 'privacy']);
check('privacy_is_fifth_stage_still_unfinished', $s['progress']['stage_index'] === 5 && $s['progress']['state'] === 'ready' && !step($s['progress'], 'privacy')['completed']);
$beforeComplete = $s['progress']['questions'];
$s = act($e, $s, 'complete', ['confirmation_intent' => 'confirm', 'draft_versions' => versions($s, 'output_drafts'), 'expected_batch_version' => $batch['version']]);
check('only_explicit_complete_finishes_all_steps', $s['progress']['state'] === 'completed' && $s['progress']['stage_index'] === 5 && array_column($s['progress']['steps'], 'completed') === [true, true, true, true, true]);
check('completed_counts_match_actual_answers', $s['progress']['questions'] === $beforeComplete && $s['progress']['questions']['skipped'] === 1);
check('completed_has_no_poll_or_automatic_actions', $s['progress']['poll_after_ms'] === 0 && $s['progress']['next_actions'] === []);
syntheticProfile($e, 'Synthetic later ordinary profile edit');
$p = $e->flow->getProgress(1, $s['id']);
check('ordinary_profile_edit_does_not_reopen_completed_flow', $p['state'] === 'completed' && $p['reasons'] === [] && $p['questions'] === $beforeComplete);
progressReadOnly($e, $s['id'], 'completed_poll');

$e = context(); $s = answerAll($e, reviewed($e), true);
$s = $e->flow->synthesize(1, $s['id'], $s['version'], $s['question_batch']['version']);
check('all_skipped_counts_truthfully', $s['progress']['questions']['answered'] === 0 && $s['progress']['questions']['skipped'] === $s['progress']['questions']['total']);
$s = act($e, $s, 'move', ['stage' => 'privacy']);
$s = act($e, $s, 'complete', ['confirmation_intent' => 'confirm', 'draft_versions' => versions($s, 'output_drafts'), 'expected_batch_version' => $s['question_batch']['version']]);
check('all_skipped_can_complete_without_facts', $s['progress']['state'] === 'completed' && $s['profiles']['global']['attributes'] === []);

$e = context(); $s = answerAll($e, reviewed($e, 10)); $oldBatch = $s['question_batch']['id'];
syntheticProfile($e, 'Synthetic ordinary change while answering');
$p = $e->flow->getProgress(1, $s['id']);
check('ordinary_profile_changes_block_current_flow', $p['state'] === 'needs_attention' && $p['reasons'] === ['profile_changed'] && $p['next_actions'] === ['reconcile']);
check('changed_profile_does_not_complete_questions', !step($p, 'questions')['completed'] && !step($p, 'draft')['accessible']);
$s = act($e, $s, 'reconcile');
check('explicit_reconcile_clears_blocker_and_resets_count', $s['progress']['reasons'] === [] && $s['progress']['questions']['total'] === 0 && $s['progress']['stage_index'] === 2);
check('reconcile_retains_old_saved_answers', count($e->qrepo->answers($oldBatch)) > 0);
denies('compact_session_is_owner_only', fn() => $e->flow->getProgress(2, $s['id']), 404);
$e->access->memberships[10] = [2];
denies('compact_session_rechecks_Space_membership', fn() => $e->flow->getProgress(1, $s['id']), 403);
$e->access->memberships[10] = [1, 2]; $e->access->users = [2];
denies('compact_session_rechecks_account', fn() => $e->flow->getProgress(1, $s['id']), 403);

$e = context(); $s = $e->flow->start(1, null);
$broken = new OnboardingService($e->srepo, $e->workflow, $e->questions, null, static function (): array { throw new ProfileException('AI_PROGRESS_UNAVAILABLE', 'Synthetic unavailable progress', 503); });
try { $broken->getProgress(1, $s['id']); throw new RuntimeException('Expected resolver error'); }
catch (ProfileException $error) { check('resolver_error_is_never_fake_empty_tasks', $error->errorCode === 'AI_PROGRESS_UNAVAILABLE'); }
check('resolver_failure_does_not_modify_session', $e->srepo->sessions[$s['id']]['version'] === 1);

$e = flowAiContext(); $s = $e->flow->start(1, 10); $source = aiSource($e);
$other = $e->flow->start(1, 20);
$foreignJob = $e->ai->submit(1, 'extract', ['session_id' => $other['id'], 'expected_version' => $other['version'], 'sources' => [$source]], 's76-foreign-session');
check('same_owner_other_session_tasks_excluded', $e->flow->getProgress(1, $s['id'])['tasks'] === []);
$job = $e->ai->submit(1, 'extract', ['session_id' => $s['id'], 'expected_version' => $s['version'], 'sources' => [$source]], 's76-flow-extract');
$p = progressReadOnly($e, $s['id'], 'queued_poll');
check('queued_task_sets_processing_and_poll_hint', $p['state'] === 'processing' && $p['poll_after_ms'] === 1000 && $p['tasks'][0]['progress']['state'] === 'queued');
check('only_current_session_task_listed', array_column($p['tasks'], 'id') === [$job['job_id']]);
$token = $p['revision_token'];
$e->arepo->jobs[$job['job_id']]['execution_status'] = 'running'; $e->arepo->jobs[$job['job_id']]['started_at'] = $e->now;
$p = progressReadOnly($e, $s['id'], 'running_poll');
check('running_status_changes_revision_token', $p['revision_token'] !== $token && $p['phase'] === 'extracting' && $p['tasks'][0]['execution_status'] === 'running');
$e->now = '2026-11-12 04:02:01'; $p = $e->flow->getProgress(1, $s['id']);
check('expired_lease_shows_failure_without_resubmit', $p['state'] === 'needs_attention' && $p['poll_after_ms'] === 0 && $p['reasons'] === ['task_failed'] && $e->engine->calls === 0);
check('retry_is_explicit_next_action', in_array('retry', $p['next_actions'], true));
$retry = $e->ai->retry(1, $job['job_id'], 's76-flow-explicit-retry'); $p = $e->flow->getProgress(1, $s['id']);
check('retry_beats_superseded_history', $p['state'] === 'processing' && $p['tasks'][0]['id'] === $retry['job_id'] && $p['tasks'][0]['attempt'] === 2);
$e->ai->work($retry['job_id']); $p = $e->flow->getProgress(1, $s['id']);
check('successful_retry_is_ready_not_complete', $p['state'] === 'ready' && $p['label_code'] === 'extraction_ready' && $p['poll_after_ms'] === 0);
check('compact_tasks_exclude_results_context_and_metrics', !str_contains(json_encode($p), 'Synthetic backend') && !isset($p['tasks'][0]['result'], $p['tasks'][0]['context'], $p['tasks'][0]['input'], $p['tasks'][0]['metrics']));
$e->engineEnabled = false; progressReadOnly($e, $s['id'], 'P6_disabled_saved_progress');
$s = $e->flow->get(1, $s['id']); $s = act($e, $s, 'review_confirm', ['confirmation_intent' => 'confirm', 'draft_versions' => versions($s, 'input_drafts')]);
$s = answerAll($e, $s, true); $s = $e->flow->synthesize(1, $s['id'], $s['version'], $s['question_batch']['version']);
check('disabled_AI_rules_flow_can_generate_draft', $s['progress']['state'] === 'ready' && $s['generation_mode'] === 'rules' && $s['llm_calls'] === 0);
check('failed_and_superseded_history_does_not_mask_draft', $s['progress']['reasons'] === [] && $s['progress']['label_code'] === 'draft_ready' && count($s['progress']['tasks']) === 2);
$s = act($e, $s, 'move', ['stage' => 'privacy']); $s = act($e, $s, 'complete', ['confirmation_intent' => 'confirm', 'draft_versions' => versions($s, 'output_drafts'), 'expected_batch_version' => $s['question_batch']['version']]);
check('failed_history_never_masks_explicit_completion', $s['progress']['state'] === 'completed' && $s['progress']['reasons'] === []);

$e = flowAiContext(); $s = reviewed($e, 10);
$job = $e->ai->submit(1, 'questions', ['session_id' => $s['id'], 'expected_version' => $s['version']], 's76-ai-questions');
$e->engine->during = function () use ($e, $s): void { $p = $e->flow->getProgress(1, $s['id']); check('live_questions_worker_exposes_processing', $p['state'] === 'processing' && $p['phase'] === 'preparing_questions'); };
$e->ai->work($job['job_id']); $e->engine->during = null; $s = $e->flow->get(1, $s['id']);
check('ready_AI_questions_wait_for_user_answers', $s['progress']['state'] === 'waiting_input' && $s['progress']['questions']['remaining'] > 0);
$batch = $s['question_batch']; foreach ($batch['questions'] as $q) { $batch = $e->questions->answer(1, $batch['id'], $q['id'], 0, ['answer_type' => 'options', 'selected_options' => [$q['options'][0]['code']]]); }
$s = $e->flow->get(1, $s['id']); $compose = $e->ai->submit(1, 'compose', ['session_id' => $s['id'], 'expected_version' => $s['version'], 'expected_batch_version' => $batch['version']], 's76-ai-compose');
$e->engine->during = function () use ($e, $s): void { $p = $e->flow->getProgress(1, $s['id']); check('live_compose_worker_exposes_processing', $p['state'] === 'processing' && $p['phase'] === 'composing_profile'); };
$e->ai->work($compose['job_id']); $e->engine->during = null; $s = $e->flow->get(1, $s['id']);
check('AI_compose_is_ready_until_human_confirm', $s['progress']['state'] === 'ready' && $s['progress']['stage'] === 'draft');
$question = $batch['questions'][0];
$batch = $e->questions->answer(1, $batch['id'], $question['id'], 1, ['answer_type' => 'free_text', 'free_text' => 'Synthetic new answer requests AI resynthesis']);
$s = $e->flow->get(1, $s['id']);
$compose = $e->ai->submit(1, 'compose', ['session_id' => $s['id'], 'expected_version' => $s['version'], 'expected_batch_version' => $batch['version']], 's76-ai-recompose');
$p = $e->flow->getProgress(1, $s['id']);
check('active_resynthesis_reports_processing_with_blocked_old_draft', $p['state'] === 'processing' && $p['phase'] === 'composing_profile' && $p['reasons'] === ['needs_resynthesis'] && !step($p, 'privacy')['accessible']);
$e->ai->work($compose['job_id']); $s = $e->flow->get(1, $s['id']);
$counts = $s['progress']['questions']; $s = act($e, $s, 'move', ['stage' => 'privacy']);
$s = act($e, $s, 'complete', ['confirmation_intent' => 'confirm', 'draft_versions' => versions($s, 'output_drafts'), 'expected_batch_version' => $batch['version']]);
check('AI_completion_keeps_true_answer_counts_after_profile_revision', $s['question_batch'] === null && $s['progress']['questions'] === $counts && $s['progress']['state'] === 'completed');
syntheticProfile($e, 'Synthetic ordinary edit after AI completion');
check('AI_completed_counts_survive_later_ordinary_edit', $e->flow->getProgress(1, $s['id'])['questions'] === $counts);
progressReadOnly($e, $s['id'], 'AI_completed_poll');
check('new_sessions_do_not_need_legacy_count_reader', $e->summaryReads === 0);
unset($e->srepo->sessions[$s['id']]['resource_refs']['completed_questions'], $e->srepo->sessions[$s['id']]['resource_refs']['completed_batch_version']);
$legacy = $e->flow->get(1, $s['id']);
check('legacy_AI_completed_counts_are_recovered_truthfully', $legacy['question_batch'] === null && $legacy['progress']['questions'] === $counts && $e->summaryReads === 1);
check('legacy_count_projection_does_not_show_old_AI_content', !isset($legacy['progress']['question_batch'], $legacy['progress']['answers']) && !str_contains(json_encode($legacy['progress']), 'Synthetic new answer'));
progressReadOnly($e, $s['id'], 'legacy_AI_completed_poll');
check('legacy_counts_never_write_upgrade_on_GET', !isset($e->srepo->sessions[$s['id']]['resource_refs']['completed_questions']));
$e->access->memberships[10] = [2];
denies('legacy_completed_count_reader_still_checks_Space', fn() => $e->flow->getProgress(1, $s['id']), 403);

$e = flowAiContext(); syntheticProfile($e, 'Synthetic confirmed input for privacy'); $s = reviewed($e, 10);
$job = $e->ai->submit(1, 'questions', ['session_id' => $s['id'], 'expected_version' => $s['version']], 's76-privacy-questions'); $e->ai->work($job['job_id']); $s = $e->flow->get(1, $s['id']);
$profile = $s['profiles']['global']; $token = $s['progress']['revision_token'];
$e->profile->setVisibilities(1, 1, ProfileScope::global(), $profile['revision'], [['attribute_id' => $profile['attributes'][0]['attribute_id'], 'visibility' => 'private']]);
$p = $e->flow->getProgress(1, $s['id']);
check('privacy_change_blocks_old_AI_results', $p['state'] === 'needs_attention' && in_array('ai_result_outdated', $p['reasons'], true) && $p['next_actions'] === ['reconcile']);
check('privacy_change_updates_revision_and_hides_old_question_content', $p['revision_token'] !== $token && $p['questions']['total'] === 0 && !step($p, 'questions')['accessible']);

$e = flowAiContext(); $s = reviewed($e); $job = $e->ai->submit(1, 'questions', ['session_id' => $s['id'], 'expected_version' => $s['version']], 's76-cancel-question');
$e->ai->cancel(1, $job['job_id']); $p = $e->flow->getProgress(1, $s['id']);
check('cancelled_task_stops_polling', $p['poll_after_ms'] === 0 && $p['tasks'][0]['execution_status'] === 'cancelled' && $p['tasks'][0]['applicability'] === 'revoked');
check('cancelled_task_has_explicit_recovery_without_retry', $p['state'] === 'needs_attention' && in_array('prepare_questions', $p['next_actions'], true) && !in_array('retry', $p['next_actions'], true));
$s = $e->flow->prepareQuestions(1, $s['id'], $s['version']);
check('cancelled_AI_does_not_block_explicit_rules', $s['progress']['state'] === 'waiting_input' && $s['progress']['reasons'] === [] && $s['progress']['questions']['total'] > 0);

$e = flowAiContext(); $s = reviewed($e); $job = $e->ai->submit(1, 'questions', ['session_id' => $s['id'], 'expected_version' => $s['version']], 's76-limit-question');
$e->arepo->jobs[$job['job_id']]['execution_status'] = 'failed'; $e->arepo->jobs[$job['job_id']]['attempt'] = 3; $e->arepo->jobs[$job['job_id']]['error_code'] = 'AI_WORKER_INTERRUPTED';
$p = $e->flow->getProgress(1, $s['id']);
check('retry_limit_preserved_in_session_actions', $p['state'] === 'needs_attention' && !in_array('retry', $p['next_actions'], true));

echo json_encode(['status' => 'passed', 's76_flow_checks' => count($checks) - $begin, 'checks' => array_slice($checks, $begin), 'database_calls' => 0, 'network_calls' => 0, 'real_llm_calls' => 0, 'fixtures' => 'fabricated materials with in-memory repositories and synthetic engines'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), PHP_EOL;
