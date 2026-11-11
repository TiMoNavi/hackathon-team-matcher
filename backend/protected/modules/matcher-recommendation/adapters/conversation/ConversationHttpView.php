<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\conversation;

/** Explicit public projection: permit IDs, hashes, provenance refs, and storage claims never cross HTTP. */
final class ConversationHttpView
{
    public static function present(array $view): array
    {
        $out = array_intersect_key($view, array_flip(['conversation_id', 'version', 'event_id', 'requirements_version', 'pending_confirmation',
            'interaction_status', 'execution_status', 'applicability', 'model_calls_used', 'current_run_id', 'message']));
        $current = ($view['applicability'] ?? null) === 'current';
        $out['confirmed_conditions'] = $current ? array_map(static fn(array $row): array => array_intersect_key($row, array_flip(['feature', 'operator', 'value', 'strength'])), $view['confirmed_conditions'] ?? []) : [];
        $out['items'] = $current ? self::items($view['items'] ?? []) : [];
        $out['events'] = self::events($view['events'] ?? []); $out['turns'] = [];
        foreach ($view['turns'] ?? [] as $turn) {
            $row = array_intersect_key($turn, array_flip(['turn_id', 'user_message', 'command', 'run_id', 'batch_id', 'message', 'calls_used', 'status']));
            $row['items'] = $current ? self::items($turn['items'] ?? []) : []; $row['events'] = self::events($turn['events'] ?? []);
            $row['error'] = isset($turn['error']) ? self::failure($turn['error']) : null; $out['turns'][] = $row;
        }
        $batch = $current ? ($view['current_batch'] ?? null) : null;
        $out['current_batch'] = $batch === null ? null : array_intersect_key($batch, array_flip(['batch_id', 'display_version', 'ordered_ids'])) + ['items' => self::items($batch['items'])];
        $out['error'] = isset($view['error']) ? self::failure($view['error']) : null;
        return $out;
    }
    public static function failure(string $reason): array
    {
        [$code, $message, $retryable] = match ($reason) {
            'budget_exhausted' => ['AI_BUDGET_EXCEEDED', 'The AI budget is exhausted.', false],
            'context_invalidated', 'cancelled' => ['VERSION_CONFLICT', 'The conversation is no longer applicable.', false],
            'history_unavailable', 'provider_unconfigured' => ['AI_UNAVAILABLE', 'A required recommendation capability is unavailable.', false],
            'run_conflict' => ['VERSION_CONFLICT', 'Reload the current conversation version.', false],
            'invalid_request', 'clarification_limit', 'request_budget_exceeded' => ['INVALID_REQUEST', 'The conversation request exceeds its supported contract.', false],
            default => ['AI_SERVICE_ERROR', 'The AI turn could not be completed.', false],
        };
        return ['code' => $code, 'message' => $message, 'retryable' => $retryable, 'details' => ['reason' => $reason]];
    }
    private static function items(array $items): array
    { return array_map(static fn(array $row): array => array_intersect_key($row, array_flip(['id', 'reason', 'gaps', 'rule_score', 'ai_rank'])), $items); }
    private static function events(array $events): array
    { return array_map(static fn(array $row): array => array_intersect_key($row, array_flip(['type', 'tool', 'stage', 'message', 'candidate_count', 'model_candidate_count'])), $events); }
}
