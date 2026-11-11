<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboarding\domain;

/** Pure, read-only presentation of persisted business checkpoints, never profile values. */
final class SessionProgress
{
    private const STAGES = ['materials', 'review', 'questions', 'draft', 'privacy'];
    private const TASK_FIELDS = ['id', 'job_id', 'operation', 'execution_status', 'applicability', 'error_code', 'attempt', 'retry_of', 'created_at', 'updated_at', 'started_at', 'finished_at'];
    private const PROGRESS_FIELDS = ['schema_version', 'state', 'phase', 'label_code', 'message', 'updated_at', 'poll_after_ms', 'percent', 'next_actions'];

    public static function project(array $session, array $taskSummary, ?array $completedCounts = null): array
    {
        $refs = $session['resource_refs'];
        $completed = $session['status'] === 'completed' && $session['stage'] === 'completed';
        $stage = $session['stage'];
        $batch = $session['question_batch'];
        $questions = $completed && isset($refs['completed_questions'])
            ? $refs['completed_questions'] : ($completed && $completedCounts !== null ? $completedCounts['questions'] : self::questionCounts($batch, (int)($refs['question_index'] ?? 0)));
        $tasks = self::compactTasks($taskSummary['tasks']);
        $profileChanged = !$completed && ($session['profile_changed'] ?? false);
        $outdated = !$completed && ($session['ai_result_outdated'] ?? false);
        $resynthesis = !$completed && ($session['needs_resynthesis'] ?? false);
        $reviewed = (bool)($refs['review_confirmed'] ?? false) && !$profileChanged && !$outdated;
        $outputReady = $reviewed && !$resynthesis && $session['output_drafts']['global'] !== null;
        $answered = $questions['total'] > 0 && $questions['remaining'] === 0;
        $steps = [];
        foreach (self::STAGES as $index => $step) {
            $accessible = $index <= self::rank($session['max_stage'])
                || ($stage === 'materials' && $step === 'review')
                || ($stage === 'draft' && $step === 'privacy');
            if ($step === 'questions' && (!$reviewed || $outdated)) { $accessible = false; }
            if (in_array($step, ['draft', 'privacy'], true) && !$outputReady) { $accessible = false; }
            // Navigation alone never completes a draft or its final visibility confirmation.
            $done = match ($step) {
                'materials', 'review' => $reviewed,
                'questions' => $reviewed && $answered,
                default => false,
            };
            $steps[] = ['stage' => $step, 'index' => $index + 1, 'current' => !$completed && $stage === $step, 'accessible' => $completed || $accessible, 'completed' => $completed || $done];
        }

        [$state, $label, $message, $actions] = match ($stage) {
            'review' => ['waiting_input', 'review_materials', '请核对资料并确认展示范围。', ['review_confirm']],
            'questions' => $batch === null
                ? ['waiting_input', 'questions_pending', '资料已确认，可以准备补充问题。', ['prepare_questions']]
                : ($answered ? ['ready', 'answers_ready', '补充问题已处理，可以整理画像草稿。', ['synthesize']] : ['waiting_input', 'answer_questions', '请继续回答补充问题，也可以逐题跳过。', ['answer_questions']]),
            'draft' => ['ready', 'draft_ready', '画像草稿已生成，等待本人核对。', ['save_drafts', 'review_privacy']],
            'privacy' => ['ready', 'privacy_pending', '请核对逐条展示范围并确认完成。', ['save_drafts', 'complete']],
            'completed' => ['completed', 'completed', '资料与展示范围已由本人确认。', []],
            default => ['waiting_input', 'materials_pending', '请导入或填写资料，再进行核对。', ['save_materials', 'review_materials']],
        };
        $phase = $stage;
        $reasons = [];
        $active = null;
        foreach ($tasks as $task) {
            if ($task['applicability'] === 'current' && in_array($task['execution_status'], ['queued', 'running'], true)) { $active = $task; break; }
        }
        if (!$completed) {
            if ($profileChanged) { $reasons[] = 'profile_changed'; }
            if ($outdated) { $reasons[] = 'ai_result_outdated'; }
            if ($resynthesis) { $reasons[] = 'needs_resynthesis'; }
            if ($profileChanged || $outdated) {
                $state = 'needs_attention'; $label = $profileChanged ? 'profile_changed' : 'ai_result_outdated';
                $message = '资料或展示范围已变化，请重新核对。'; $actions = ['reconcile'];
            } elseif ($active !== null) {
                $state = 'processing'; $phase = $active['progress']['phase'];
                $label = $active['progress']['label_code']; $message = $active['progress']['message'];
                $actions = $active['progress']['next_actions'];
            } elseif ($resynthesis) {
                $state = 'needs_attention'; $label = 'needs_resynthesis';
                $message = '答案已变化，请重新整理画像草稿。'; $actions = ['synthesize'];
            } else {
                // Only a task for work still needed in this stage may affect the overall state.
                // Failed or superseded historical attempts stay visible in tasks, never mask a ready draft.
                $operation = in_array($stage, ['materials', 'review'], true) ? 'extract'
                    : ($stage === 'questions' ? ($batch === null ? 'questions' : ($answered && !$outputReady ? 'compose' : null)) : null);
                $relevant = self::relevantTask($tasks, $operation);
                if ($relevant !== null) {
                    $taskState = $relevant['progress']['state'];
                    if (in_array($taskState, ['failed', 'cancelled', 'superseded', 'revoked'], true)) {
                        $state = 'needs_attention'; $label = 'task_' . $taskState; $reasons[] = $label;
                        $message = match ($taskState) {
                            'failed' => '处理任务未完成，请选择恢复动作。',
                            'cancelled' => '处理任务已取消，可继续填写或重新提交。',
                            default => '先前处理结果已失效，请按当前资料继续。',
                        };
                        $actions = array_values(array_unique(array_merge($actions, $relevant['progress']['next_actions'])));
                    } elseif ($operation === 'extract' && $taskState === 'ready') {
                        $state = 'ready'; $label = 'extraction_ready'; $message = '资料提取已完成，等待本人核对候选。';
                        $actions = ['review_extraction', 'review_materials'];
                    }
                }
            }
        }
        $updatedAt = $session['updated_at'];
        $checkpoints = ['batch_version' => $batch['version'] ?? ($refs['completed_batch_version'] ?? ($completedCounts['batch_version'] ?? null)), 'profiles' => [], 'drafts' => []];
        foreach (['global', 'space'] as $scope) {
            $profile = $session['profiles'][$scope];
            $checkpoints['profiles'][$scope] = $profile === null ? null : ['revision' => $profile['revision'], 'permission_version' => $profile['permission_version'] ?? null];
            foreach (['input_drafts', 'output_drafts'] as $kind) {
                $draft = $session[$kind][$scope];
                $checkpoints['drafts'][$kind][$scope] = $draft === null ? null : array_intersect_key($draft, array_flip(['id', 'draft_version', 'base_revision', 'status']));
                $updatedAt = self::latest($updatedAt, $draft['updated_at'] ?? null);
            }
            $updatedAt = self::latest($updatedAt, $profile['updated_at'] ?? null);
        }
        $updatedAt = self::latest($updatedAt, $batch['updated_at'] ?? null);
        foreach ($tasks as $task) { $updatedAt = self::latest($updatedAt, $task['updated_at'] ?? null); }
        $progress = [
            'schema_version' => 1, 'state' => $state, 'phase' => $phase, 'label_code' => $label, 'message' => $message,
            'updated_at' => $updatedAt, 'poll_after_ms' => !$completed && $active !== null ? 1000 : 0, 'percent' => null, 'next_actions' => $actions,
            'session_id' => $session['id'], 'session_version' => $session['version'], 'scope_key' => $session['scope_key'], 'space_id' => $session['space_id'],
            'stage' => $stage, 'stage_index' => $completed ? 5 : self::rank($stage) + 1, 'stage_count' => 5,
            'steps' => $steps, 'questions' => $questions, 'tasks' => $tasks, 'tasks_has_more' => (bool)$taskSummary['has_more'], 'reasons' => $reasons,
        ];
        // Stable checkpoint versions, not answer/profile text, detect even same-count edits.
        $progress['revision_token'] = hash('sha256', json_encode(self::canonical([$progress, $checkpoints]), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
        return $progress;
    }

    public static function questionCounts(?array $batch, int $index): array
    {
        $total = count($batch['questions'] ?? []); $answered = 0; $skipped = 0;
        $byQuestion = array_column($batch['answers'] ?? [], null, 'question_id');
        foreach ($batch['questions'] ?? [] as $question) {
            $type = $byQuestion[$question['id']]['answer_type'] ?? null;
            if ($type === 'skipped') { ++$skipped; }
            elseif (in_array($type, ['options', 'free_text'], true)) { ++$answered; }
        }
        return ['total' => $total, 'answered' => $answered, 'skipped' => $skipped, 'remaining' => $total - $answered - $skipped, 'current_index' => $total === 0 ? null : min(max(0, $index), $total - 1)];
    }
    private static function compactTasks(array $tasks): array
    {
        return array_map(static function (array $task): array {
            $compact = array_intersect_key($task, array_flip(self::TASK_FIELDS));
            $compact['progress'] = array_intersect_key($task['progress'], array_flip(self::PROGRESS_FIELDS));
            return $compact;
        }, array_slice($tasks, 0, 20));
    }
    private static function relevantTask(array $tasks, ?string $operation): ?array
    {
        if ($operation === null) { return null; }
        foreach ($tasks as $task) { if ($task['operation'] === $operation && $task['applicability'] === 'current') { return $task; } }
        foreach ($tasks as $task) { if ($task['operation'] === $operation) { return $task; } }
        return null;
    }
    private static function rank(string $stage): int
    { $index = array_search($stage, self::STAGES, true); return $index === false ? -1 : $index; }
    private static function latest(string $left, mixed $right): string
    { return is_string($right) && $right > $left ? $right : $left; }
    private static function canonical(array $value): array
    {
        if (!array_is_list($value)) { ksort($value); }
        foreach ($value as &$item) { if (is_array($item)) { $item = self::canonical($item); } }
        unset($item); return $value;
    }
}
