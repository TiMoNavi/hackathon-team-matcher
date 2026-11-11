<?php
declare(strict_types=1);

// S7.7 application composition: fabricated inputs, real use cases, memory ports.
// No framework bootstrap, database, credentials, network, or production model.
ob_start(); require __DIR__ . '/unit/s6_workflow.php'; ob_end_clean();

use humhub\modules\matcherOnboarding\application\OnboardingAiWorkflow;
use humhub\modules\matcherOnboarding\application\OnboardingService;
use humhub\modules\matcherProfile\application\ProfileAiJobService;
use humhub\modules\matcherProfile\application\QuestionService;
use humhub\modules\matcherProfile\domain\ProfileAiFailure;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ports\ProfileAiEngine;
use humhub\modules\matcherProfile\domain\rules\RuleQuestionProvider;
use humhub\modules\matcherProfile\domain\rules\RulesProfileComposer;

$s77Start = count($checks);
$s77Engines = [];
$s77Scenarios = [];

final class S77WorkflowEngine implements ProfileAiEngine
{
    public int $calls = 0;
    public array $operations = [];
    public ?Closure $during = null;
    public ?string $failure = null;

    public function status(): array { return ['available' => true, 'model' => 'synthetic-s77-workflow']; }
    public function generate(string $operation, array $input): array
    {
        ++$this->calls; $this->operations[] = $operation;
        if ($this->during !== null) { ($this->during)($operation, $input); }
        $metrics = ['model' => 'synthetic-s77-workflow', 'llm_calls' => 1, 'duration_ms' => 1, 'usage' => ['prompt_tokens' => null, 'completion_tokens' => null, 'total_tokens' => null, 'reported' => false]];
        if ($this->failure !== null) { throw new ProfileAiFailure($this->failure, $metrics); }
        if ($operation === 'extract') {
            $source = $input['sources'][0];
            $data = ['candidates' => [['id' => 's77-bio', 'key' => 'bio', 'value' => 'S77 fabricated materials summary.', 'evidence' => [['source_id' => $source['source_id'], 'source_version' => $source['version'], 'section_id' => $source['sections'][0]['id']]]]], 'review_items' => []];
        } elseif ($operation === 'questions') {
            $questions = (new RuleQuestionProvider())->questions($input['profiles'], $input['space_id']);
            foreach ($questions as &$question) { $question['free_text_option'] = ['code' => 'other', 'label' => '其他，我来填写', 'position' => 'last', 'max_length' => 1000]; }
            unset($question);
            $data = ['questions' => $questions, 'review_items' => []];
        } else {
            $data = (new RulesProfileComposer())->compose($input['profiles'], $input['questions'], $input['answers']);
            unset($data['generation_mode'], $data['llm_calls']);
            // Exercise the real workflow's privacy floor even if an engine suggests
            // a broader scope for prose supported by restricted confirmed fields.
            foreach ($data['global_fields'] as &$field) {
                if ($field['key'] !== 'headline') { continue; }
                $field['visibility'] = 'authenticated'; $field['evidence'] = [];
                foreach ($input['profiles']['global']['attributes'] as $attribute) {
                    if (in_array($attribute['key'], ['role', 'interest'], true)) { $field['evidence'][] = ['type' => 'profile', 'scope' => 'global', 'attribute_id' => $attribute['attribute_id']]; }
                }
            }
            unset($field); $data['review_items'] = [];
        }
        return ['data' => $data, 'metrics' => $metrics];
    }
}

function s77Context(): object
{
    global $s77Engines;
    $e = aiContext(); $e->engine = new S77WorkflowEngine(); $s77Engines[] = $e->engine;
    $e->engineEnabled = true; $e->engineResolutions = 0; $e->now = '2026-11-12 08:00:00'; $e->key = 0;
    s77Restore($e);
    return $e;
}
function s77Restore(object $e): void
{
    $e->questions = new QuestionService($e->qrepo, $e->workflow);
    $e->bridge = new OnboardingAiWorkflow($e->workflow, $e->srepo, $e->qrepo, $e->sources);
    $e->ai = new ProfileAiJobService($e->arepo, $e->bridge, function () use ($e) { ++$e->engineResolutions; return $e->engineEnabled ? $e->engine : null; }, fn() => $e->now);
    $e->flow = new OnboardingService($e->srepo, $e->workflow, $e->questions, fn() => $e->now, fn(int $owner, string $session): array => $e->ai->progressForSession($owner, $session), fn(int $owner, string $batch, int $index): array => $e->questions->getProgressCounts($owner, $batch, $index));
}
function s77Job(object $e, array $s, string $operation, array $extra = []): array
{
    return $e->ai->submit(1, $operation, ['session_id' => $s['id'], 'expected_version' => $s['version']] + $extra, 's77-' . $operation . '-' . ++$e->key);
}
function s77Attribute(array $profileOrDraft, string $key): array
{
    foreach ($profileOrDraft['attributes'] ?? $profileOrDraft['preview_attributes'] ?? [] as $attribute) { if ($attribute['key'] === $key) { return $attribute; } }
    throw new RuntimeException('Missing expected fixture attribute: ' . $key);
}
function s77Canonical(array $profileOrDraft): array
{
    $items = array_map(static fn(array $a): array => ['key' => $a['key'], 'value' => $a['value'], 'visibility' => $a['visibility']], $profileOrDraft['attributes'] ?? $profileOrDraft['preview_attributes']);
    usort($items, static fn(array $a, array $b): int => strcmp(json_encode($a), json_encode($b)));
    return $items;
}
function s77SeedFields(): array
{
    return [
        ['key' => 'role', 'value' => ['code' => 'backend', 'label' => '后端开发'], 'visibility' => 'private'],
        ['key' => 'interest', 'value' => ['code' => 'ai', 'label' => '人工智能'], 'visibility' => 'friends'],
        ['key' => 'communication_preference', 'value' => ['codes' => ['async']], 'visibility' => 'authenticated'],
        ['key' => 'collaboration_preference', 'value' => ['codes' => ['clear_roles']], 'visibility' => 'authenticated'],
        ['key' => 'personality', 'value' => ['traits' => ['耐心']], 'visibility' => 'friends'],
        ['key' => 'seeking', 'value' => '一起完成合成测试项目', 'visibility' => 'authenticated'],
    ];
}
function s77ReadOnly(object $e, string $sessionId, string $prefix, ?string $jobId = null): array
{
    // Revalidation may legitimately persist a stale task once. Settle that before
    // checking that repeated current/terminal GETs do not mutate the repositories.
    $first = $e->flow->get(1, $sessionId);
    if ($jobId !== null) { $e->ai->get(1, $jobId); }
    $before = state($e); $jobs = serialize($e->arepo->jobs); $sources = serialize($e->sources);
    $calls = $e->engine->calls; $resolutions = $e->engineResolutions;
    $again = $e->flow->get(1, $sessionId); $progress = $e->flow->getProgress(1, $sessionId);
    if ($jobId !== null) { $e->ai->get(1, $jobId); $e->ai->getProgress(1, $jobId); }
    check($prefix . '_stable_resource_and_progress', $first === $again && $progress === $again['progress']);
    check($prefix . '_no_persistence_changes', state($e) === $before && serialize($e->arepo->jobs) === $jobs && serialize($e->sources) === $sources);
    check($prefix . '_no_engine_resolution_or_model_call', $e->engine->calls === $calls && $e->engineResolutions === $resolutions);
    check($prefix . '_no_fake_percentage', $progress['percent'] === null);
    return $again;
}
function s77AnswerResume(object $e, array $s, string $prefix, ?int $space = null): array
{
    $batch = $s['question_batch']; $count = count($batch['questions']); $answered = 0; $skipped = 0;
    check($prefix . '_three_to_eight_questions', $count >= 3 && $count <= 8);
    foreach ($batch['questions'] as $i => $q) {
        $payload = ['answer_type' => 'options', 'selected_options' => [$q['options'][0]['code']]];
        if ($space === null && $q['target_key'] === 'interest') { $payload = ['answer_type' => 'free_text', 'free_text' => '合成的公共学习工具方向']; }
        elseif ($space === null && $q['target_key'] === 'communication_preference') { $payload = ['answer_type' => 'skipped']; }
        elseif ($space === 20 && $q['target_key'] === 'event_goal') { $payload['selected_options'] = ['validate']; }
        elseif ($space === 20 && $q['target_key'] === 'event_role') { $payload['selected_options'] = ['frontend']; }
        elseif ($space === 10 && $q['target_key'] === 'event_time_commitment') { $payload['selected_options'] = ['focused']; }
        if ($payload['answer_type'] === 'skipped') { ++$skipped; } else { ++$answered; }
        if ($batch['generation_mode'] === 'ai') { check($prefix . '_free_control_last_' . $i, $q['free_text_option']['position'] === 'last' && $q['free_text_option']['code'] === 'other'); }
        $batch = $e->questions->answer(1, $batch['id'], $q['id'], 0, $payload);
        $s = $e->flow->get(1, $s['id']); $s = act($e, $s, 'question_position', ['question_index' => min($i + 1, $count - 1)]);
        $beforeRestore = $s; s77Restore($e); $s = $e->flow->get(1, $s['id']);
        check($prefix . '_restores_answer_and_position_' . $i, $s === $beforeRestore && $s['question_batch']['answers'] === $batch['answers']);
        $p = $s['progress']['questions'];
        check($prefix . '_actual_counts_' . $i, $p['answered'] === $answered && $p['skipped'] === $skipped && $p['remaining'] === $count - $answered - $skipped && $p['current_index'] === min($i + 1, $count - 1));
    }
    return $s;
}
function s77Finish(object $e, array $s): array
{
    $s = act($e, $s, 'move', ['stage' => 'privacy']);
    return act($e, $s, 'complete', ['confirmation_intent' => 'confirm', 'draft_versions' => versions($s, 'output_drafts'), 'expected_batch_version' => $s['question_batch']['version']]);
}

// Same source content/confirmed fields, mixed answers, private prose, and a
// separate ordinary manual draft pass through both production orchestration paths.
$comparison = [];
foreach (['rules', 'ai'] as $mode) {
    $beforeChecks = count($checks); $e = s77Context();
    $manual = $e->profile->startDraft(1, 1, ProfileScope::global());
    $manual = $e->profile->updateDraft(1, 1, ProfileScope::global(), $manual['id'], 1, [['key' => 'bio', 'value' => 'S77 unrelated manual draft', 'visibility' => 'private']]);
    $manualRecord = $e->repo->drafts[$manual['id']];
    $s = $e->flow->start(1, null); $source = aiSource($e);
    if ($mode === 'ai') {
        $job = s77Job($e, $s, 'extract', ['sources' => [$source]]);
        check('ai_extract_queued_with_zero_calls', $job['progress']['state'] === 'queued' && $e->engine->calls === 0);
        $job = $e->ai->work($job['id']);
        check('ai_extract_ready_is_not_confirmed', $job['progress']['state'] === 'ready' && $e->workflow->profiles(1, null)['global']['revision'] === 0);
        denies('ai_extract_other_owner_denied', fn() => $e->ai->get(2, $job['id']), 404);
        denies('ai_extract_cannot_apply_to_unrelated_manual_draft', fn() => $e->ai->apply(1, $job['id'], ['draft_id' => $manual['id'], 'expected_draft_version' => $manual['draft_version'], 'candidate_ids' => ['s77-bio']], 's77-wrong-draft'), 422);
        $adopted = $e->ai->apply(1, $job['id'], ['draft_id' => $s['input_drafts']['global']['id'], 'expected_draft_version' => 1, 'candidate_ids' => ['s77-bio']], 's77-correct-draft');
        check('ai_adoption_does_not_publish', $adopted['applied'] === ['s77-bio'] && $e->profile->getProfile(2, 1, ProfileScope::global(), 10)['attributes'] === []);
        $s = $e->flow->get(1, $s['id']); $bio = s77Attribute($s['input_drafts']['global'], 'bio');
        $bioField = ['attribute_id' => $bio['attribute_id'], 'visibility' => 'private'];
    } else { $bioField = ['key' => 'bio', 'value' => 'S77 fabricated materials summary.', 'visibility' => 'private']; }
    $s = act($e, $s, 'save_materials', ['draft_versions' => versions($s, 'input_drafts'), 'global_fields' => array_merge(s77SeedFields(), [$bioField])]);
    $s = act($e, $s, 'review_confirm', ['confirmation_intent' => 'confirm', 'draft_versions' => versions($s, 'input_drafts')]);
    check($mode . '_ordinary_manual_draft_untouched_after_review', $e->repo->drafts[$manual['id']] === $manualRecord);
    check($mode . '_private_material_not_public', !in_array('bio', array_column($e->profile->getProfile(2, 1, ProfileScope::global(), 10)['attributes'], 'key'), true));
    if ($mode === 'ai') { $qj = s77Job($e, $s, 'questions'); $e->ai->work($qj['id']); $s = $e->flow->get(1, $s['id']); }
    else { $s = $e->flow->prepareQuestions(1, $s['id'], $s['version']); }
    $s = s77AnswerResume($e, $s, $mode); $confirmedBefore = $e->workflow->profiles(1, null)['global'];
    if ($mode === 'ai') { $cj = s77Job($e, $s, 'compose', ['expected_batch_version' => $s['question_batch']['version']]); $e->ai->work($cj['id']); $s = $e->flow->get(1, $s['id']); }
    else { $s = $e->flow->synthesize(1, $s['id'], $s['version'], $s['question_batch']['version']); }
    check($mode . '_composition_only_changes_unconfirmed_draft', $e->workflow->profiles(1, null)['global']['attributes'] === $confirmedBefore['attributes'] && $e->workflow->profiles(1, null)['global']['revision'] === $confirmedBefore['revision']);
    check($mode . '_private_input_propagates_to_derived_headline', s77Attribute($s['output_drafts']['global'], 'headline')['visibility'] === 'private');
    $comparison[$mode]['generated'] = s77Canonical($s['output_drafts']['global']);
    $headline = s77Attribute($s['output_drafts']['global'], 'headline');
    $s = act($e, $s, 'save_drafts', ['draft_versions' => versions($s, 'output_drafts'), 'global_fields' => [['attribute_id' => $headline['attribute_id'], 'value' => 'S77 human reviewed headline', 'visibility' => 'private']]]);
    $manualOutput = $s['output_drafts']; s77Restore($e); $s = $e->flow->get(1, $s['id']);
    if ($mode === 'ai') {
        $cj = s77Job($e, $s, 'compose', ['expected_batch_version' => $s['question_batch']['version']]); $cj = $e->ai->work($cj['id']); $s = $e->flow->get(1, $s['id']);
        check('ai_regeneration_reports_retained_manual_conflict', count(array_filter($cj['result']['review_items'], static fn(array $r): bool => $r['kind'] === 'conflict')) > 0);
    } else { $s = act($e, $s, 'move', ['stage' => 'questions']); $s = $e->flow->synthesize(1, $s['id'], $s['version'], $s['question_batch']['version']); }
    check($mode . '_resynthesis_keeps_manual_draft_and_visibility', $s['output_drafts'] === $manualOutput);
    $s = s77ReadOnly($e, $s['id'], $mode . '_draft_poll', $mode === 'ai' ? $cj['id'] : null);
    $s = s77Finish($e, $s); $comparison[$mode]['confirmed'] = s77Canonical($s['profiles']['global']);
    check($mode . '_completed_only_after_explicit_confirmation', $s['status'] === 'completed' && $s['profiles']['global']['revision'] === 2 && $s['progress']['state'] === 'completed');
    check($mode . '_manual_draft_preserved_through_completion', $e->repo->drafts[$manual['id']] === $manualRecord);
    check($mode . '_confirmed_private_headline_not_public', !in_array('headline', array_column($e->profile->getProfile(2, 1, ProfileScope::global(), 10)['attributes'], 'key'), true));
    $beforeJobs = count($e->arepo->jobs); $beforeCalls = $e->engine->calls; $beforeResolutions = $e->engineResolutions;
    $ordinary = $e->profile->startDraft(1, 1, ProfileScope::global(), 'native_edit', false);
    $ordinary = $e->profile->updateDraft(1, 1, ProfileScope::global(), $ordinary['id'], $ordinary['draft_version'], [['attribute_id' => s77Attribute($s['profiles']['global'], 'bio')['attribute_id'], 'value' => 'S77 ordinary post-completion edit', 'visibility' => 'private']]);
    $e->profile->confirmDraft(1, 1, ProfileScope::global(), $ordinary['id'], $ordinary['draft_version'], $ordinary['base_revision']);
    $s = s77ReadOnly($e, $s['id'], $mode . '_completed_ordinary_edit_poll');
    check($mode . '_ordinary_edit_creates_no_AI_task_or_call', count($e->arepo->jobs) === $beforeJobs && $e->engine->calls === $beforeCalls && $e->engineResolutions === $beforeResolutions);
    check($mode . '_completed_session_does_not_reopen_on_regular_edit', $s['status'] === 'completed' && $s['progress']['state'] === 'completed' && s77Attribute($s['profiles']['global'], 'bio')['value'] === 'S77 ordinary post-completion edit');
    check($mode . '_actual_generation_calls', $e->engine->calls === ($mode === 'ai' ? 4 : 0));
    $s77Scenarios[$mode . '_complete_and_resume'] = ['checks' => count($checks) - $beforeChecks, 'synthetic_engine_calls' => $e->engine->calls];
}
check('rules_ai_generated_values_and_privacy_match', $comparison['rules']['generated'] === $comparison['ai']['generated']);
check('rules_ai_confirmed_values_and_privacy_match', $comparison['rules']['confirmed'] === $comparison['ai']['confirmed']);
$s77Scenarios['same_fixture_cross_path_invariants'] = ['checks' => 2, 'synthetic_engine_calls' => 0];

// One owner finishes AI in Space 10, then rules in Space 20. Long-term
// preferences stay global while all three event preferences differ deliberately.
$beforeChecks = count($checks); $e = s77Context(); $spaceProfiles = [];
foreach ([10 => 'ai', 20 => 'rules'] as $spaceId => $mode) {
    $s = $e->flow->start(1, $spaceId);
    check('space_' . $spaceId . '_starts_without_inherited_event_answers', $s['profiles']['space']['attributes'] === [] && $s['input_drafts']['space']['preview_attributes'] === []);
    if ($spaceId === 10) { $s = act($e, $s, 'save_materials', ['draft_versions' => versions($s, 'input_drafts'), 'global_fields' => s77SeedFields()]); }
    else { check('second_space_keeps_global_preferences', s77Canonical($s['profiles']['global']) === $globalAfterFirst); }
    $s = act($e, $s, 'review_confirm', ['confirmation_intent' => 'confirm', 'draft_versions' => versions($s, 'input_drafts')]);
    if ($mode === 'ai') { $qj = s77Job($e, $s, 'questions'); $e->ai->work($qj['id']); $s = $e->flow->get(1, $s['id']); }
    else { $e->engineEnabled = false; $s = $e->flow->prepareQuestions(1, $s['id'], $s['version']); }
    $s = s77AnswerResume($e, $s, 'space_' . $spaceId, $spaceId);
    if ($mode === 'ai') { $cj = s77Job($e, $s, 'compose', ['expected_batch_version' => $s['question_batch']['version']]); $e->ai->work($cj['id']); $s = $e->flow->get(1, $s['id']); }
    else { $s = $e->flow->synthesize(1, $s['id'], $s['version'], $s['question_batch']['version']); }
    $s = s77Finish($e, $s); $spaceProfiles[$spaceId] = s77Canonical($s['profiles']['space']); $globalAfterFirst = s77Canonical($s['profiles']['global']);
    check('space_' . $spaceId . '_event_fields_never_enter_global_profile', !array_filter($s['profiles']['global']['attributes'], static fn(array $a): bool => str_starts_with($a['key'], 'event_')));
}
$ten = $e->workflow->profiles(1, 10); $twenty = $e->workflow->profiles(1, 20);
check('dual_space_goals_are_independent', s77Attribute($ten['space'], 'event_goal')['value']['codes'] === ['prototype'] && s77Attribute($twenty['space'], 'event_goal')['value']['codes'] === ['validate']);
check('dual_space_roles_are_independent', s77Attribute($ten['space'], 'event_role')['value']['code'] === 'backend' && s77Attribute($twenty['space'], 'event_role')['value']['code'] === 'frontend');
check('dual_space_time_commitments_are_independent', s77Attribute($ten['space'], 'event_time_commitment')['value']['hours_min'] === 6 && s77Attribute($twenty['space'], 'event_time_commitment')['value']['hours_min'] === 1);
check('second_space_did_not_change_first_space', s77Canonical($ten['space']) === $spaceProfiles[10]);
check('second_space_rules_adds_zero_model_calls', $e->engine->calls === 2);
$s77Scenarios['dual_space_ai_rules'] = ['checks' => count($checks) - $beforeChecks, 'synthetic_engine_calls' => $e->engine->calls];

// Permission narrowing invalidates saved AI questions/answers and a running
// composition. Recovery is explicit and uses the newest ordinary profile.
$beforeChecks = count($checks); $e = s77Context(); $s = $e->flow->start(1, 10);
$s = act($e, $s, 'save_materials', ['draft_versions' => versions($s, 'input_drafts'), 'global_fields' => [['key' => 'bio', 'value' => 'S77 initially visible material', 'visibility' => 'authenticated']]]);
$s = act($e, $s, 'review_confirm', ['confirmation_intent' => 'confirm', 'draft_versions' => versions($s, 'input_drafts')]);
$qj = s77Job($e, $s, 'questions'); $qj = $e->ai->work($qj['id']); $s = $e->flow->get(1, $s['id']); $oldBatch = $s['question_batch']['id'];
$s = s77AnswerResume($e, $s, 'privacy_late', 10); $batchRecord = $e->qrepo->batches[$oldBatch]; $answerRecords = $e->qrepo->answers($oldBatch);
$cj = s77Job($e, $s, 'compose', ['expected_batch_version' => $s['question_batch']['version']]);
$beforeDrafts = serialize($e->repo->drafts); $oldProfile = $s['profiles']['global'];
$e->engine->during = function () use ($e, $oldProfile): void { $e->profile->setVisibilities(1, 1, ProfileScope::global(), $oldProfile['revision'], [['attribute_id' => s77Attribute($oldProfile, 'bio')['attribute_id'], 'visibility' => 'private']]); };
$cj = $e->ai->work($cj['id']); $e->engine->during = null;
check('privacy_change_supersedes_running_compose', $cj['execution_status'] === 'succeeded' && $cj['applicability'] === 'superseded' && $cj['result'] === null && $cj['progress']['state'] === 'superseded');
check('privacy_change_late_result_does_not_create_drafts', serialize($e->repo->drafts) === $beforeDrafts);
check('privacy_change_retains_actual_late_call_metrics', $cj['metrics']['llm_calls'] === 1 && $cj['metrics']['accounting_complete']);
$current = $e->workflow->profiles(1, 10)['global'];
check('privacy_change_advances_permission_version', $current['permission_version'] > $oldProfile['permission_version'] && s77Attribute($current, 'bio')['visibility'] === 'private');
denies('privacy_changed_AI_batch_hidden', fn() => $e->questions->get(1, $oldBatch), 409);
denies('privacy_changed_AI_batch_cannot_answer', fn() => $e->questions->answer(1, $oldBatch, $batchRecord['questions'][0]['id'], 1, ['answer_type' => 'skipped']), 409);
$e->engineEnabled = false; $s = s77ReadOnly($e, $s['id'], 'privacy_outdated_poll', $cj['id']);
check('outdated_session_hides_batch_and_draft', $s['ai_result_outdated'] && $s['question_batch'] === null && $s['output_drafts']['global'] === null && $s['progress']['state'] === 'needs_attention');
check('previous_successful_questions_are_also_superseded', $e->ai->get(1, $qj['id'])['applicability'] === 'superseded');
$beforeCalls = $e->engine->calls; $s = act($e, $s, 'reconcile');
check('reconcile_preserves_old_answer_records', $e->qrepo->batches[$oldBatch] === $batchRecord && $e->qrepo->answers($oldBatch) === $answerRecords && $s['stage'] === 'review');
$s = act($e, $s, 'review_confirm', ['confirmation_intent' => 'confirm', 'draft_versions' => versions($s, 'input_drafts')]);
$s = $e->flow->prepareQuestions(1, $s['id'], $s['version']); $s = s77AnswerResume($e, $s, 'rules_recovery', 10);
$s = $e->flow->synthesize(1, $s['id'], $s['version'], $s['question_batch']['version']); $s = s77Finish($e, $s);
check('explicit_rules_recovers_after_permission_change_with_P6_off', $s['status'] === 'completed' && $s['generation_mode'] === 'rules' && $e->engine->calls === $beforeCalls && s77Attribute($s['profiles']['global'], 'bio')['visibility'] === 'private');
$s77Scenarios['privacy_late_result_and_explicit_rules'] = ['checks' => count($checks) - $beforeChecks, 'synthetic_engine_calls' => $e->engine->calls];

// A real failed task stays failed when P6 disappears; reads do not retry. The
// owner may explicitly prepare/finish a rules batch in the same session.
$beforeChecks = count($checks); $e = s77Context(); $s = reviewed($e, null);
$e->engine->failure = 'AI_SCHEMA_INVALID'; $job = s77Job($e, $s, 'questions'); $job = $e->ai->work($job['id']); $e->engine->failure = null; $e->engineEnabled = false;
check('failed_AI_questions_stays_failed_with_no_installed_batch', $job['execution_status'] === 'failed' && $job['applicability'] === 'current' && $job['error_code'] === 'AI_SCHEMA_INVALID' && $e->flow->get(1, $s['id'])['question_batch'] === null);
$s = s77ReadOnly($e, $s['id'], 'P6_disabled_failed_task_poll', $job['id']);
check('failed_task_has_explicit_recovery_action', in_array('retry', $job['progress']['next_actions'], true));
$beforeCalls = $e->engine->calls; $beforeResolutions = $e->engineResolutions;
$s = $e->flow->prepareQuestions(1, $s['id'], $s['version']); $s = s77AnswerResume($e, $s, 'failed_to_rules');
$s = $e->flow->synthesize(1, $s['id'], $s['version'], $s['question_batch']['version']); $s = s77Finish($e, $s);
check('failed_AI_requires_explicit_rules_and_does_not_retry', $s['status'] === 'completed' && $s['generation_mode'] === 'rules' && $e->engine->calls === $beforeCalls && $e->engineResolutions === $beforeResolutions && count($e->arepo->jobs) === 1);
$s77Scenarios['failed_AI_P6_off_rules_completion'] = ['checks' => count($checks) - $beforeChecks, 'synthetic_engine_calls' => $e->engine->calls];

// Editing a saved AI output while a recomposition is in flight makes the late
// result stale. The private edit remains the authoritative editable preview.
$beforeChecks = count($checks); $e = s77Context(); $s = reviewed($e, 10);
$qj = s77Job($e, $s, 'questions'); $e->ai->work($qj['id']); $s = s77AnswerResume($e, $e->flow->get(1, $s['id']), 'manual_late', 10);
$cj = s77Job($e, $s, 'compose', ['expected_batch_version' => $s['question_batch']['version']]); $e->ai->work($cj['id']); $s = $e->flow->get(1, $s['id']);
$cj = s77Job($e, $s, 'compose', ['expected_batch_version' => $s['question_batch']['version']]);
$headline = s77Attribute($s['output_drafts']['global'], 'headline');
$e->engine->during = function () use ($e, $s, $headline): void { act($e, $s, 'save_drafts', ['draft_versions' => versions($s, 'output_drafts'), 'global_fields' => [['attribute_id' => $headline['attribute_id'], 'value' => 'S77 concurrent human edit', 'visibility' => 'private']]]); };
$cj = $e->ai->work($cj['id']); $e->engine->during = null; $s = $e->flow->get(1, $s['id']);
check('concurrent_manual_edit_supersedes_recomposition', $cj['applicability'] === 'superseded' && $cj['result'] === null);
check('concurrent_manual_edit_and_privacy_survive', s77Attribute($s['output_drafts']['global'], 'headline')['value'] === 'S77 concurrent human edit' && s77Attribute($s['output_drafts']['global'], 'headline')['visibility'] === 'private');
$s = s77Finish($e, $s);
check('current_human_draft_can_finish_after_late_result_rejected', $s['status'] === 'completed' && s77Attribute($s['profiles']['global'], 'headline')['value'] === 'S77 concurrent human edit');
$s77Scenarios['concurrent_manual_draft'] = ['checks' => count($checks) - $beforeChecks, 'synthetic_engine_calls' => $e->engine->calls];

// Source invalidation and cancellation both intersect the actual workflow.
$beforeChecks = count($checks);
foreach (['source_deleted', 'cancelled', 'space_revoked'] as $case) {
    $e = s77Context(); $s = $e->flow->start(1, 10); $source = aiSource($e); $job = s77Job($e, $s, 'extract', ['sources' => [$source]]);
    $before = $e->repo->drafts;
    $e->engine->during = function () use ($e, $case, $source, $job): void {
        if ($case === 'source_deleted') { $record = $e->sources->findSource($source['source_id']); $record['status'] = 'deleted'; ++$record['version']; $e->sources->saveSource($record); }
        elseif ($case === 'cancelled') { $e->ai->cancel(1, $job['id']); }
        else { $e->access->memberships[10] = [2]; }
    };
    $job = $e->ai->work($job['id']);
    check($case . '_late_extraction_is_unusable', $job['applicability'] === 'revoked' && $job['result'] === null);
    check($case . '_no_draft_install_and_private_task_payload_erased', $e->repo->drafts === $before && $e->arepo->jobs[$job['id']]['input'] === [] && $e->arepo->jobs[$job['id']]['result'] === []);
    check($case . '_actual_call_is_accounted_once', $job['metrics']['llm_calls'] === 1 && $e->engine->calls === 1);
    if ($case === 'cancelled') { check('cancelled_running_task_never_becomes_success', $job['execution_status'] === 'cancelled'); }
    if ($case === 'space_revoked') { denies('revoked_space_cannot_resume_session', fn() => $e->flow->get(1, $s['id']), 403); }
}
$s77Scenarios['extraction_source_cancel_space_races'] = ['checks' => count($checks) - $beforeChecks, 'synthetic_engine_calls' => 3];

// Observe queued/running/ready projections around an actual task work() call.
// Polling from inside generate exposes the saved running state without spawning
// another engine call or guessing progress from fabricated token counts.
$beforeChecks = count($checks); $e = s77Context(); $s = reviewed($e, 10);
$job = s77Job($e, $s, 'questions'); $queued = $e->flow->getProgress(1, $s['id']);
check('queued_session_has_pollable_task', $queued['state'] === 'processing' && $job['progress']['state'] === 'queued' && $job['progress']['poll_after_ms'] === 1000);
$e->engine->during = function () use ($e, $s, $job): void {
    $calls = $e->engine->calls; $resolutions = $e->engineResolutions; $stateBefore = state($e); $jobsBefore = serialize($e->arepo->jobs);
    $p = $e->ai->getProgress(1, $job['id']); $flow = $e->flow->getProgress(1, $s['id']);
    check('running_task_projects_operation_phase', $p['execution_status'] === 'running' && $p['progress']['state'] === 'running' && $p['progress']['phase'] === 'preparing_questions');
    check('running_session_projects_real_task', $flow['state'] === 'processing' && count($flow['tasks']) === 1 && $flow['tasks'][0]['job_id'] === $job['id']);
    check('running_progress_never_guesses_percentage', $p['progress']['percent'] === null && $flow['percent'] === null && $p['progress']['poll_after_ms'] === 1000);
    check('running_poll_neither_reissues_model_nor_writes', $calls === $e->engine->calls && $resolutions === $e->engineResolutions && state($e) === $stateBefore && serialize($e->arepo->jobs) === $jobsBefore);
};
$job = $e->ai->work($job['id']); $e->engine->during = null;
check('ready_task_stops_polling_and_awaits_owner', $job['progress']['state'] === 'ready' && $job['progress']['poll_after_ms'] === 0 && $job['progress']['next_actions'] === ['answer_questions']);
check('ready_result_is_reference_only', isset($job['result']['question_batch_id']) && !isset($job['result']['questions'], $job['input'], $job['context']));
$s = s77ReadOnly($e, $s['id'], 'ready_questions_poll', $job['id']);
$s77Scenarios['queued_running_ready_observation'] = ['checks' => count($checks) - $beforeChecks, 'synthetic_engine_calls' => $e->engine->calls];

// A lease recovery performed during a slow call records unknown accounting,
// requires an explicit retry, and rejects the original worker's late output.
$beforeChecks = count($checks); $e = s77Context(); $s = $e->flow->start(1, null);
$job = s77Job($e, $s, 'extract', ['sources' => [aiSource($e)]]);
$e->engine->during = function () use ($e, $job): void {
    $e->now = '2026-11-12 08:02:01'; $expired = $e->ai->get(1, $job['id']);
    check('interrupted_task_requires_explicit_recovery', $expired['execution_status'] === 'failed' && $expired['error_code'] === 'AI_WORKER_INTERRUPTED' && $expired['metrics']['llm_calls'] === null && !$expired['metrics']['accounting_complete']);
    check('interrupted_task_has_no_automatic_retry', count($e->arepo->jobs) === 1 && $e->engine->calls === 1);
    $e->retry = $e->ai->retry(1, $job['id'], 's77-explicit-interruption-retry');
};
$late = $e->ai->work($job['id']); $e->engine->during = null;
check('expired_worker_cannot_install_after_explicit_retry', $late['execution_status'] === 'failed' && $late['applicability'] === 'superseded' && $late['result'] === null && $late['metrics']['llm_calls'] === 1 && $late['metrics']['accounting_complete']);
check('retry_is_new_queued_attempt', $e->retry['id'] !== $job['id'] && $e->retry['attempt'] === 2 && $e->retry['execution_status'] === 'queued' && $e->engine->calls === 1);
$done = $e->ai->work($e->retry['id']);
check('explicit_retry_alone_installs_current_result', $done['execution_status'] === 'succeeded' && $done['applicability'] === 'current' && $e->engine->calls === 2 && $e->workflow->profiles(1, null)['global']['attributes'] === []);
$s77Scenarios['interrupted_worker_explicit_retry'] = ['checks' => count($checks) - $beforeChecks, 'synthetic_engine_calls' => $e->engine->calls];

$newChecks = array_slice($checks, $s77Start);
echo json_encode([
    'status' => 'passed', 'suite' => 's77_workflow', 'date' => '2026-11-12',
    's77_checks' => count($newChecks), 'inherited_s4_s5_s6_checks' => $s77Start,
    'synthetic_engine_calls' => array_sum(array_map(static fn(S77WorkflowEngine $engine): int => $engine->calls, $s77Engines)),
    'real_model_calls' => 0, 'network_calls' => 0, 'database_calls' => 0,
    'production_changes' => [], 'module_versions' => ['matcher-user-profile' => '0.10.0', 'matcher-onboarding' => '0.4.0'],
    'tested_layers' => ['OnboardingService', 'OnboardingAiWorkflow', 'ProfileAiJobService', 'ProfileService', 'QuestionService', 'RulesProfileComposer', 'memory repositories'],
    'boundaries' => ['Synthetic engine bypasses P6 output validation; P6 validation belongs to the separate S7.7 harness.', 'Exact text equality only compares the deterministic synthetic/rules fixture, not real AI prose.', 'Synthetic engine call count covers the new S7.7 scenarios; inherited S6 engine calls are excluded.', 'No SQL/HTTP/native HumHub module toggle exercised here.', 'P6-off is the real application engine resolver returning null.', 'Private/friends filtering here uses the baseline memory policy; P3 friend relationships need independent HTTP acceptance.', 'Late races use deterministic callbacks during generate, not concurrent processes.'],
    'scenarios' => $s77Scenarios, 'checks' => $newChecks,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL;
