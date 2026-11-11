<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\application;

/** Fixed, text-free progress projections; no reader, engine or framework dependencies. */
final class ProfileProgress
{
    public static function job(array $job, int $maxAttempts): array
    {
        $status = $job['execution_status'];
        $state = $job['applicability'] !== 'current' ? $job['applicability'] : match ($status) {
            'succeeded' => 'ready', default => $status,
        };
        $phase = match ($job['operation']) {
            'extract' => 'extracting', 'questions' => 'preparing_questions', 'compose' => 'composing_profile',
        };
        $message = match ($state) {
            'queued' => '任务已排队，等待处理。',
            'running' => match ($phase) {
                'extracting' => '正在提取资料中的候选信息。',
                'preparing_questions' => '正在准备补充问题。',
                'composing_profile' => '正在生成待核对的画像草稿。',
            },
            'ready' => '处理结果已就绪，等待本人核对。',
            'failed' => '处理未完成，请查看可用的恢复操作。',
            'cancelled' => '任务已取消。',
            'superseded' => '资料或流程已变化，请重新核对。',
            'revoked' => '任务已停止或失效，结果不可使用。',
        };
        $actions = match ($state) {
            'queued', 'running' => ['cancel'],
            'ready' => [match ($job['operation']) {
                'extract' => 'review_candidates', 'questions' => 'answer_questions', 'compose' => 'review_draft',
            }],
            'failed' => $job['attempt'] < $maxAttempts ? ['retry', 'use_rules'] : ['use_rules'],
            'superseded', 'cancelled' => ['reconcile'],
            default => [],
        };
        return self::view($state, $phase, 'ai.'.$job['operation'].'.'.$state, $message, $job['updated_at'],
            $job['applicability'] === 'current' && in_array($status, ['queued', 'running'], true) ? 1000 : 0, $actions);
    }

    public static function source(array $source, ?array $job): array
    {
        $state = $source['status'] === 'deleted' ? 'revoked' : ($job['applicability'] ?? 'current');
        if ($state === 'current') {
            $state = match ($source['status']) { 'running' => 'reading_source', default => $source['status'] };
        }
        $message = match ($state) {
            'reading_source' => '正在读取本人导入的资料。',
            'ready' => '资料已读取，等待本人核对。',
            'failed' => '资料读取失败，可主动重新读取。',
            'superseded' => '资料已变化，请重新核对当前来源。',
            'revoked' => '来源已删除或授权已撤销。',
        };
        $actions = match ($state) {
            'ready' => ['review_source'], 'failed' => ['refresh_source'], 'superseded' => ['reload_source'], default => [],
        };
        return self::view($state, 'reading_source', 'source.'.$state, $message, $source['updated_at'],
            $state === 'reading_source' ? 1000 : 0, $actions);
    }

    private static function view(string $state, string $phase, string $label, string $message, string $updatedAt, int $poll, array $actions): array
    {
        return ['schema_version' => 1, 'state' => $state, 'phase' => $phase, 'label_code' => $label,
            'message' => $message, 'updated_at' => $updatedAt, 'poll_after_ms' => $poll, 'percent' => null, 'next_actions' => $actions];
    }
}
