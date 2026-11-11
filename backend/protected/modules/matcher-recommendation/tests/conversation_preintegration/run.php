<?php
declare(strict_types=1);
require_once __DIR__ . '/Fixtures.php';
use humhub\modules\matcherRecommendation\tests\conversation_preintegration\Harness;
use humhub\modules\matcherRecommendation\tests\conversation_preintegration\Provider;
use humhub\modules\matcherRecommendation\contracts\QueryIntent;
use humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException;
use humhub\modules\matcherRecommendation\tests\rules\Fixtures as Rules;

set_error_handler(static function (int $severity, string $message, string $file, int $line): never {
    throw new ErrorException($message, 0, $severity, $file, $line);
});
$implementationPath = dirname(__DIR__, 2) . '/application/conversation/ConversationService.php';
$implementationBefore = hash_file('sha256', $implementationPath);

function expectAudit(bool $condition, string $message): void { if (!$condition) { throw new RuntimeException($message); } }
function cleanAudit(array $view, string $marker): bool {
    foreach ($view as $value) {
        if (is_string($value) && str_contains($value, $marker)) { return false; }
        if (is_array($value) && !cleanAudit($value, $marker)) { return false; }
    }
    return true;
}
$cases = [];
$cases['unselected_candidate_body_revocation'] = static function (): void {
    $h = new Harness(); $h->provider->mode = 'unselected'; $v = $h->start();
    expectAudit($v['error'] === null && $h->provider->mentionedText !== null, 'Setup must produce a valid recommendation and another candidate fact.');
    $marker = $h->provider->mentionedText; unset($h->ports->profiles->rows[$h->provider->mentionedId]);
    $v = $h->service()->get(1, $v['conversation_id']);
    expectAudit(cleanAudit($v, $marker), 'Revoked unselected candidate fact remains in visible conversation.');
};
$cases['pending_hard_requirement_survives_followup'] = static function (): void {
    $h = new Harness(); $v = $h->start(message: '必须周六14点到18点联调，还需要后端贡献。');
    expectAudit($v['interaction_status'] === 'awaiting_input' && $h->retriever->calls === [], 'Initial hard requirement must wait for trusted confirmation.');
    $v = $h->service()->submit(1, $v['conversation_id'], $v['version'], '对，就是刚才的要求，请找人。', 'confirm-by-text', 'chat');
    expectAudit($h->retriever->calls === [] && $v['items'] === [], 'Unconfirmed earlier hard requirement became an unconstrained search.');
};
$cases['confirmed_soft_requirement_survives_model_omission'] = static function (): void {
    $h = new Harness(); $v = $h->start(Harness::confirmed());
    expectAudit($v['error'] === null && count($h->retriever->calls) === 1, 'Valid confirmed conditions must execute.');
    expectAudit(Harness::contains($h->retriever->calls[0]['intent']->conditions, 'topics', ['教育工具'], 'soft'), 'Model omission removed a user-confirmed soft requirement.');
};
$cases['empty_items_body_revocation'] = static function (): void {
    $h = new Harness(); $h->provider->mode = 'empty'; $v = $h->start();
    expectAudit($v['error'] === null && $v['items'] === [] && $h->provider->mentionedText !== null, 'Setup must complete an empty selection with a candidate-bearing explanation.');
    $marker = $h->provider->mentionedText; $before = count($h->provider->calls);
    unset($h->ports->profiles->rows[$h->provider->mentionedId]);
    $v = $h->service()->get(1, $v['conversation_id']);
    expectAudit(cleanAudit($v, $marker), 'An empty item list bypassed source revocation for its explanation.');
    expectAudit(count($h->provider->calls) === $before, 'GET must redact without another model call.');
};
foreach (['unselected', 'empty'] as $mode) {
    $cases['direct_submit_revalidates_' . $mode . '_body_history'] = static function () use ($mode): void {
        $h = new Harness(); $h->provider->mode = $mode; $v = $h->start();
        $marker = $h->provider->mentionedText; $before = count($h->provider->calls);
        unset($h->ports->profiles->rows[$h->provider->mentionedId]);
        try { $v = $h->service()->submit(1, $v['conversation_id'], $v['version'], '继续讨论刚才的理由，不换人。', 'direct-discussion', 'chat'); }
        catch (AiRecommendationException $error) { expectAudit(in_array($error->reason, ['context_invalidated', 'run_conflict'], true), 'Unexpected direct-submit failure.'); }
        $v = $h->service()->get(1, $v['conversation_id']);
        expectAudit(cleanAudit($v, $marker), 'Direct submit still exposes the revoked candidate in a turn.');
        foreach (array_slice($h->provider->calls, $before) as $call) {
            expectAudit(cleanAudit($call['input'], $marker), 'Revoked text was sent to a subsequent planner or discussion model.');
        }
    };
}
$cases['refresh_transitive_source_revocation'] = static function (): void {
    $h = new Harness(); $h->provider->mode = 'selected_body'; $v = $h->start();
    $oldId = $h->provider->mentionedId; $marker = $h->provider->mentionedText;
    $h->provider->mode = 'selected';
    $v = $h->service()->submit(1, $v['conversation_id'], $v['version'], '再找一批，参考刚才这条依据：' . $marker, 'source-refresh', 'refresh');
    expectAudit($v['error'] === null && $v['items'] !== [] && count($h->retriever->calls) === 2, 'Source-derived refresh should work while the original facts remain authorized.');
    unset($h->ports->profiles->rows[$oldId]);
    $before = count($h->provider->calls); $v = $h->service()->get(1, $v['conversation_id']);
    expectAudit(cleanAudit($v, $marker), 'Refreshing copied an old candidate fact into an untracked requirements or user turn.');
    expectAudit($v['items'] === [], 'A result derived from revoked candidate input remained publishable.');
    expectAudit(count($h->provider->calls) === $before, 'Source invalidation must not rerun the model.');
};
$cases['independent_new_conversation_has_no_revoked_source'] = static function (): void {
    $h = new Harness(); $h->provider->mode = 'unselected'; $old = $h->start();
    $marker = $h->provider->mentionedText; unset($h->ports->profiles->rows[$h->provider->mentionedId]);
    $h->provider->mode = 'selected'; $before = count($h->provider->calls);
    $fresh = $h->start();
    expectAudit($fresh['error'] === null && $fresh['applicability'] === 'current' && $fresh['items'] !== [], 'An independent new conversation with authorized sources must still succeed.');
    $old = $h->service()->get(1, $old['conversation_id']);
    $fresh = $h->service()->get(1, $fresh['conversation_id']);
    expectAudit(cleanAudit($old, $marker) && $fresh['error'] === null && $fresh['items'] !== [], 'Revoking an older conversation must not revoke an independent valid conversation.');
    foreach (array_slice($h->provider->calls, $before) as $call) { expectAudit(cleanAudit($call['input'], $marker), 'Independent conversation inherited old candidate prose.'); }
};
$cases['pending_hard_requirement_blocks_refresh'] = static function (): void {
    $h = new Harness(); $v = $h->start(message: '必须周六14点到18点联调，还需要后端贡献。');
    try { $v = $h->service()->submit(1, $v['conversation_id'], $v['version'], '换一批看看。', 'pending-refresh', 'refresh'); }
    catch (AiRecommendationException $error) { expectAudit(in_array($error->reason, ['run_conflict', 'invalid_request'], true), 'Pending refresh returned an unexpected error.'); }
    expectAudit($h->retriever->calls === [], 'Refresh bypassed an unconfirmed hard requirement.');
};
$cases['pending_hard_requirement_blocks_refresh_after_failure'] = static function (): void {
    $h = new Harness(); $v = $h->start(message: '必须周六14点到18点联调，还需要后端贡献。');
    $h->provider->failPlan = true;
    $v = $h->service()->submit(1, $v['conversation_id'], $v['version'], '继续按刚才的时间要求。', 'pending-failure', 'chat');
    $h->provider->failPlan = false;
    try { $v = $h->service()->submit(1, $v['conversation_id'], $v['version'], '重新来一批。', 'after-failure-refresh', 'refresh'); }
    catch (AiRecommendationException $error) { expectAudit(in_array($error->reason, ['run_conflict', 'invalid_request'], true), 'Pending failure refresh returned an unexpected error.'); }
    expectAudit($h->retriever->calls === [], 'A failed plan cleared pending hard confirmation and refresh then searched.');
};
$cases['trusted_hard_confirmation_runs_real_filter'] = static function (): void {
    $h = new Harness(); $v = $h->start(message: '必须周六14点到18点联调，还需要后端贡献。');
    $v = $h->service()->submit(1, $v['conversation_id'], $v['version'], '确认这两个要求。', 'trusted-confirm', 'chat', Harness::hardTime());
    expectAudit($v['error'] === null && $v['items'] !== [] && count($h->retriever->calls) === 1, 'Trusted confirmation should release the pending request.');
    $conditions = $h->retriever->calls[0]['intent']->conditions;
    expectAudit(Harness::contains($conditions, 'needs', ['后端开发'], 'hard'), 'Confirmed contribution hard condition was lost.');
    expectAudit(Harness::contains($conditions, 'availability', [['starts_at' => '2026-11-14T14:00:00+08:00', 'ends_at' => '2026-11-14T18:00:00+08:00']], 'hard'), 'Confirmed availability hard condition was lost.');
    foreach ($v['items'] as $item) { expectAudit(isset($h->ports->profiles->rows[$item['id']]->features['availability']), 'Hard time filtering admitted a person with unknown availability.'); }
};
$cases['confirmed_soft_survives_service_reload_and_refresh'] = static function (): void {
    $h = new Harness(); $v = $h->start(Harness::confirmed());
    $v = $h->service()->submit(1, $v['conversation_id'], $v['version'], '保留偏好，再找几位。', 'soft-refresh', 'refresh');
    expectAudit($v['error'] === null && count($h->retriever->calls) === 2, 'Refresh with valid confirmed conditions should succeed.');
    foreach ($h->retriever->calls as $call) { expectAudit(Harness::contains($call['intent']->conditions, 'topics', ['教育工具'], 'soft'), 'Confirmed soft requirement disappeared across a new service instance or refresh.'); }
};
$cases['explicit_complete_snapshot_replaces_soft_preference'] = static function (): void {
    $h = new Harness(); $v = $h->start(Harness::confirmed());
    $v = $h->service()->submit(1, $v['conversation_id'], $v['version'], '偏好改为开发者工具，后端要求不变。', 'replace-soft', 'refresh', Harness::confirmed('开发者工具'));
    expectAudit($v['error'] === null && count($h->retriever->calls) === 2, 'Explicit preference update should succeed.');
    $conditions = $h->retriever->calls[1]['intent']->conditions;
    expectAudit(Harness::contains($conditions, 'topics', ['开发者工具'], 'soft'), 'New confirmed soft preference was not applied.');
    expectAudit(!array_filter($conditions, static fn(array $c): bool => $c['feature'] === 'topics' && $c['value'] === ['教育工具']), 'Explicitly replaced preference remained active.');
};
$cases['withdrawn_confirmed_soft_not_restored_by_model'] = static function (): void {
    $h = new Harness(); $v = $h->start(Harness::confirmed());
    $draft = Provider::draft(); $draft['conditions'][] = ['feature' => 'topics', 'operator' => 'similarity', 'value' => ['教育工具'], 'strength' => 'soft', 'origin' => 'interpreted_draft'];
    $h->provider->plans[] = $draft;
    $v = $h->service()->submit(1, $v['conversation_id'], $v['version'], '教育主题不再是偏好，只保留后端要求。', 'withdraw-soft', 'refresh', new QueryIntent('person', [Rules::condition('needs', 'supply_demand', ['后端开发'], 'hard')]));
    expectAudit($v['error'] === null && count($h->retriever->calls) === 2, 'Explicit removal should preserve the remaining valid search.');
    expectAudit(!array_filter($h->retriever->calls[1]['intent']->conditions, static fn(array $c): bool => $c['feature'] === 'topics' && $c['value'] === ['教育工具']), 'Model silently restored a preference the user explicitly removed.');
};
foreach (['unselected', 'empty'] as $legacyCase) {
    $cases['legacy_' . $legacyCase . '_body_is_not_assumed_authorized'] = static function () use ($legacyCase): void {
        [$h, $v, $fixture] = Harness::legacy($legacyCase);
        unset($h->ports->profiles->rows[$fixture['mentioned_id']]);
        $v = $h->service()->get(1, $v['conversation_id']);
        expectAudit(cleanAudit($v, $fixture['marker']), 'A pre-fix snapshot without complete prose sources revived unsafe text.');
        expectAudit($h->provider->calls === [] && $h->retriever->calls === [], 'Legacy safety must not quietly rerun paid work.');
    };
}
$cases['legacy_pending_hard_requirement_cannot_resume_as_soft'] = static function (): void {
    [$h, $v] = Harness::legacy('pending');
    try { $v = $h->service()->submit(1, $v['conversation_id'], $v['version'], '对，就是刚才的要求，请找人。', 'legacy-hard', 'chat'); }
    catch (AiRecommendationException $error) { expectAudit(in_array($error->reason, ['run_conflict', 'context_invalidated'], true), 'Legacy hard confirmation returned an unexpected failure.'); }
    expectAudit($h->retriever->calls === [], 'Restoring an old snapshot silently removed its unresolved hard requirement.');
};
$cases['normal_discussion_and_idempotent_replay_keep_batch'] = static function (): void {
    $h = new Harness(); $v = $h->start(); $ids = array_column($v['items'], 'id'); $batch = $v['current_batch']['batch_id']; $version = $v['version'];
    $v = $h->service()->submit(1, $v['conversation_id'], $version, '解释这位的贡献依据，不搜索新人。', 'normal-chat', 'chat');
    expectAudit($v['error'] === null && array_column($v['items'], 'id') === $ids && $v['current_batch']['batch_id'] === $batch, 'An authorized normal discussion must preserve the current list.');
    $calls = count($h->provider->calls);
    $v = $h->service()->submit(1, $v['conversation_id'], $version, '解释这位的贡献依据，不搜索新人。', 'normal-chat', 'chat');
    expectAudit($v['error'] === null && count($h->provider->calls) === $calls && count($h->retriever->calls) === 1, 'Idempotent replay repeated a paid call or search.');
};
$cases['twenty_turn_source_graph_rechecks_are_linear_and_fresh'] = static function (): void {
    $h = new Harness(40); $phaseReads = 0;
    $h->ports->profiles->onRead = static function () use (&$phaseReads): void {
        if (++$phaseReads > 200) { throw new RuntimeException('Per-turn authorization reads exceeded the generous linear guard.'); }
    };
    $v = $h->start(); expectAudit($v['error'] === null, 'First bounded conversation turn must succeed.');
    for ($i = 1; $i < 20; $i++) {
        $phaseReads = 0;
        $v = $h->service()->submit(1, $v['conversation_id'], $v['version'], '继续找没看过的人。', 'many-refresh-' . $i, 'refresh');
        expectAudit($v['error'] === null && $v['items'] !== [], 'Valid refresh failed before the supported twenty-turn limit, or source checks exploded.');
    }
    $phaseReads = 0; $before = count($h->provider->calls); $v = $h->service()->get(1, $v['conversation_id']);
    expectAudit($v['error'] === null && $phaseReads > 0 && $phaseReads <= 20, 'One GET must verify each source batch at most once, even in a dense twenty-batch dependency graph.');
    $revoked = $v['items'][0]['id']; unset($h->ports->profiles->rows[$revoked]); $phaseReads = 0;
    $v = $h->service()->get(1, $v['conversation_id']);
    expectAudit($phaseReads > 0 && $v['items'] === [] && $v['applicability'] === 'revoked', 'Per-pass memoization became a cross-request authorization cache.');
    expectAudit(count($h->provider->calls) === $before, 'Reading or invalidating the graph added a model call.');
};
$cases['refresh_clarification_cannot_reuse_revoked_draft_condition'] = static function (): void {
    $h = new Harness(); $h->provider->mode = 'selected_body'; $v = $h->start();
    $oldId = $h->provider->mentionedId; $marker = $h->provider->mentionedText; $h->provider->mode = 'selected';
    $draft = Provider::draft();
    $draft['conditions'][] = ['feature' => 'experience', 'operator' => 'similarity', 'value' => [$marker], 'strength' => 'soft', 'origin' => 'interpreted_draft'];
    $h->provider->plans[] = $draft;
    $v = $h->service()->submit(1, $v['conversation_id'], $v['version'], '按这条经历线索再找人：' . $marker, 'condition-source', 'refresh');
    expectAudit($v['error'] === null && count($h->retriever->calls) === 2, 'A valid source-derived draft condition should reach the real search while authorized.');
    expectAudit(Harness::contains($h->retriever->calls[1]['intent']->conditions, 'experience', [$marker], 'soft', 'interpreted_draft'), 'Setup did not create the source-derived draft condition.');
    $h->provider->plans[] = ['action' => 'clarify', 'message' => '这次还需要哪种投入时间？', 'conditions' => []];
    $v = $h->service()->submit(1, $v['conversation_id'], $v['version'], '再换一批，先确认还有什么需求。', 'clarify-after-draft', 'refresh');
    expectAudit($v['error'] === null && $v['current_batch'] === null && $v['interaction_status'] === 'awaiting_input', 'Setup must reach clarification with no current display but saved interpreted conditions.');
    unset($h->ports->profiles->rows[$oldId]); $before = count($h->provider->calls);
    $v = $h->service()->get(1, $v['conversation_id']);
    expectAudit(cleanAudit($v, $marker), 'Revoked source fact survives in a no-current-batch clarification.');
    try { $v = $h->service()->submit(1, $v['conversation_id'], $v['version'], '时间不限，继续。', 'after-revoked-draft', 'chat'); }
    catch (AiRecommendationException $error) { expectAudit(in_array($error->reason, ['context_invalidated', 'run_conflict'], true), 'Unexpected revoked-draft continuation error.'); }
    foreach (array_slice($h->provider->calls, $before) as $call) { expectAudit(cleanAudit($call['input'], $marker), 'A revoked interpreted condition was sent to the next model.'); }
    expectAudit(count($h->provider->calls) === $before, 'Continuation after revoked source-derived requirements must fail before paid work.');
};
$cases['hard_confirmation_questions_share_three_round_limit'] = static function (): void {
    $h = new Harness(); $v = $h->start(message: '必须周六14点到18点联调，还需要后端贡献。');
    $runId = $v['current_run_id'];
    for ($i = 1; $i <= 3; $i++) { $v = $h->service()->submit(1, $v['conversation_id'], $v['version'], '继续按刚才说的要求。', 'pending-round-' . $i, 'chat'); }
    expectAudit($v['current_run_id'] === $runId && $v['error'] === 'clarification_limit', 'Pending confirmation asked more than three questions or reset its run.');
    expectAudit($h->retriever->calls === [] && count($h->provider->calls) <= 5, 'Repeated confirmation questions silently searched or exceeded the run model cap.');
    try { $v = $h->service()->submit(1, $v['conversation_id'], $v['version'], '换一批。', 'refresh-exhausted-pending', 'refresh'); }
    catch (AiRecommendationException $error) { expectAudit(in_array($error->reason, ['run_conflict', 'invalid_request'], true), 'Unexpected refresh error after the confirmation limit.'); }
    expectAudit($h->retriever->calls === [], 'Refresh after a confirmation-limit failure removed the unresolved hard requirement.');
};
$results = [];
foreach ($cases as $name => $case) {
    try { $case(); $results[] = ['case' => $name, 'status' => 'passed']; }
    catch (Throwable $error) { $results[] = ['case' => $name, 'status' => 'failed', 'detail' => $error->getMessage()]; }
}
$failed = count(array_filter($results, static fn(array $r): bool => $r['status'] === 'failed'));
$implementationAfter = hash_file('sha256', $implementationPath);
if ($implementationBefore !== $implementationAfter) {
    $results[] = ['case' => 'implementation_stable_during_suite', 'status' => 'failed', 'detail' => 'Implementation changed during this run; rerun after the writer completes.'];
    $failed++;
}
echo json_encode(['suite' => 'conversation_preintegration', 'status' => $failed === 0 ? 'passed' : 'failed', 'cases' => count($results), 'failed' => $failed,
    'implementation_sha256' => $implementationAfter,
    'network_calls' => 0, 'database_connections' => 0, 'results' => $results], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL;
exit($failed === 0 ? 0 : 1);
