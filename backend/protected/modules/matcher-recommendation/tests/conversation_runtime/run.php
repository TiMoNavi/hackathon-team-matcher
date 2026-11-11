<?php
declare(strict_types=1);
require_once __DIR__ . '/Fixtures.php';
use humhub\modules\matcherRecommendation\tests\conversation_runtime\Harness;
use humhub\modules\matcherRecommendation\tests\ai_runs\Fixtures as F;
use humhub\modules\matcherRecommendation\adapters\conversation\{ConversationRuntimeSchema, ConversationStorageSchema, PdoConversationRuntime, PdoConversationStore, PdoRecommendationBudget, ConversationHttpInput, ConversationHttpView};
$checks = [];
function checkRuntime(bool $ok, string $label): void { global $checks; if (!$ok) { throw new RuntimeException($label); } $checks[] = $label; }
function rejectsRuntime(callable $action, string $label, ?string $reason = null): void
{ try { $action(); } catch (Throwable $e) { checkRuntime($reason === null || ($e->reason ?? null) === $reason, $label); return; } throw new RuntimeException('NOT REJECTED: ' . $label); }
function memoryRuntime(): PDO { return new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]); }
$db = memoryRuntime(); ConversationRuntimeSchema::install($db); $runtime = new PdoConversationRuntime($db);
checkRuntime($runtime->read() === ['revision' => 1, 'enabled' => false, 'provider_id' => null, 'provider_revision' => null], 'migration defaults to disabled without provider');
rejectsRuntime(fn() => $runtime->identity(), 'disabled runtime never issues an active identity', 'disabled');
$runtime->configure(1, true, 'synthetic-provider', 'v1'); $identity = $runtime->identity();
checkRuntime((new PdoConversationRuntime($db))->identity() === $identity, 'independently reconstructed runtime has persistent identity');
rejectsRuntime(fn() => $runtime->configure(1, true, 'synthetic-provider', 'v1'), 'stale lifecycle CAS rejected', 'run_conflict');
$runtime->configure(2, false, 'synthetic-provider', 'v1'); $runtime->configure(3, true, 'synthetic-provider', 'v1');
rejectsRuntime(fn() => $runtime->assertCurrent($identity), 'pause and resume never revive prior identity', 'context_invalidated');
$identity = $runtime->identity(); $runtime->configure(4, true, 'synthetic-provider', 'v2');
rejectsRuntime(fn() => $runtime->assertCurrent($identity), 'provider revision change invalidates held identity', 'context_invalidated');
$f = F::create(); $budget = new PdoRecommendationBudget($db, $f->platform, $runtime, $runtime->identity(), $f->clock);
rejectsRuntime(fn() => $budget->reserveAttempt('run-1', 'plan', 'p-1'), 'zero local allowance never reaches platform', 'budget_exhausted');
checkRuntime($f->platform->reservations === [], 'zero allowance prevents outbound reservation');
$budget->configureAllowance(1, 3); $budget->reserveAttempt('run-1', 'plan', 'p-1');
rejectsRuntime(fn() => $budget->reserveAttempt('run-1', 'plan', 'p-1'), 'duplicate permit cannot fund a second attempt', 'budget_exhausted');
checkRuntime($budget->read()['reserved'] === 1 && count($f->platform->reservations) === 1, 'duplicate reservation rolls back local counter');
$f->platform->remaining = 0; rejectsRuntime(fn() => $budget->reserveAttempt('run-1', 'respond', 'p-2'), 'platform denial blocks despite local allowance', 'budget_exhausted');
checkRuntime($budget->read()['reserved'] === 2, 'platform failure conservatively retains local reservation');
rejectsRuntime(fn() => $budget->configureAllowance(2, 1), 'allowance cannot erase already reserved usage', 'run_conflict');
$db->beginTransaction(); rejectsRuntime(fn() => $budget->reserveAttempt('run-1', 'plan', 'p-3'), 'caller transaction cannot encompass a model reservation', 'storage_unavailable'); checkRuntime($db->inTransaction(), 'caller transaction remains owned by caller'); $db->rollBack();
$prefixDb = memoryRuntime(); $prefixDb->exec(ConversationStorageSchema::sql('sqlite', 't_')); ConversationRuntimeSchema::install($prefixDb, 't_');
$prefixStore = new PdoConversationStore($prefixDb, tablePrefix: 't_'); $prefixStore->create('test-prefixed', 1, 7, ['version' => 1]);
checkRuntime($prefixStore->load('test-prefixed', 1)['version'] === 1 && (new PdoConversationRuntime($prefixDb, 't_'))->read()['enabled'] === false, 'migration and PDO store honor a native table prefix');
rejectsRuntime(fn() => ConversationRuntimeSchema::statements('sqlite', 'bad;'), 'table prefix cannot inject SQL');
$h = new Harness(memoryRuntime()); $s = $h->service(); $a = $s->create(1, 7, 'creation-key'); $again = $h->service()->create(1, 7, 'creation-key');
checkRuntime($a['conversation_id'] === $again['conversation_id'] && $h->db->query('SELECT COUNT(*) FROM matcher_recommendation_conversation')->fetchColumn() == 1, 'create idempotency survives service reconstruction without duplicate conversation');
checkRuntime($h->provider->calls === 0, 'create and replay consume zero model calls');
$v = $s->submit(1, $a['conversation_id'], $a['version'], '找共同主题的伙伴', 'turn-key', 'recommend', F::query(), 1);
checkRuntime($v['error'] === null && count($v['items']) === 1 && $v['model_calls_used'] === 2, 'persistent runtime and quota complete a synthetic recommendation');
$public = ConversationHttpView::present($v); $json = json_encode($public, JSON_THROW_ON_ERROR);
checkRuntime(!preg_match('/permit_id|source_refs|input_hash|fact_references|idempotency_key|atom_hash/', $json), 'public view strips permit identifiers and provenance internals');
checkRuntime(count(array_filter($public['events'], static fn(array $e): bool => $e['type'] === 'tool_completed')) === 1, 'real tool completion remains in public view');
$replay = $h->service()->submit(1, $a['conversation_id'], $a['version'], '找共同主题的伙伴', 'turn-key', 'recommend', F::query(), 1);
checkRuntime($replay['version'] === $v['version'] && $h->provider->calls === 2, 'confirmed idempotent replay ignores stale versions without fresh work');
rejectsRuntime(fn() => $s->submit(1, $a['conversation_id'], $v['version'], '确认条件后换一批', 'stale-confirm', 'refresh', F::query(), 1), 'requirements version is checked after source authorization', 'run_conflict');
$h->runtime->configure(2, false, 'synthetic-provider', 'reviewed-v1'); $revoked = $s->get(1, $a['conversation_id']);
checkRuntime($revoked['applicability'] === 'revoked' && $revoked['confirmed_conditions'] === [] && $revoked['items'] === [], 'held service GET revokes candidate and confirmed condition views on persistent pause');
checkRuntime($h->provider->calls === 2, 'runtime revocation GET has no model calls');
$h2 = new Harness(memoryRuntime()); $s2 = $h2->service(); $c = $s2->create(1, 7);
$h2->provider->onCall = fn() => $h2->runtime->configure(2, false, 'synthetic-provider', 'reviewed-v1');
$late = $s2->submit(1, $c['conversation_id'], $c['version'], '找共同主题的伙伴', 'pause-in-call', 'recommend');
checkRuntime($late['applicability'] === 'revoked' && $late['items'] === [] && $h2->provider->calls === 1, 'pause during model call rejects late output before search');
checkRuntime($h2->ports->search->calls === [], 'late provider result cannot initiate retrieval after pause');
$valid = ['expected_version' => 3, 'requirements_version' => 2, 'confirmation_intent' => 'replace_complete_requirements', 'message' => '确认完整条件', 'command' => 'recommend', 'conditions' => [['feature' => 'topics', 'operator' => 'similarity', 'value' => ['social'], 'strength' => 'hard']]];
$parsed = ConversationHttpInput::parse(json_encode($valid), 'confirm'); checkRuntime($parsed['intent']->conditions[0]['origin'] === 'user_confirmed', 'only explicit confirmation boundary stamps user origin');
foreach (['origin' => 'user_confirmed', 'viewer_id' => 99, 'event_id' => 9, 'user_confirmed' => true] as $key => $value) { $bad = $valid + [$key => $value]; rejectsRuntime(fn() => ConversationHttpInput::parse(json_encode($bad), 'confirm'), 'confirmation rejects extra field ' . $key); }
$bad = $valid; $bad['conditions'][0]['origin'] = 'user_confirmed'; rejectsRuntime(fn() => ConversationHttpInput::parse(json_encode($bad), 'confirm'), 'client cannot set condition origin');
$bad = $valid; $bad['conditions'][0]['value'] = (object)['0' => 'social']; rejectsRuntime(fn() => ConversationHttpInput::parse(json_encode($bad), 'confirm'), 'numeric-key object cannot masquerade as a token array');
$empty = $valid; $empty['conditions'] = []; checkRuntime(ConversationHttpInput::parse(json_encode($empty), 'confirm')['intent']->conditions === [], 'empty explicit full snapshot withdraws all conditions');
rejectsRuntime(fn() => ConversationHttpInput::parse('{"expected_version":1,"message":"ok","command":"chat","conditions":[]}', 'turn'), 'ordinary chat cannot confirm conditions');
rejectsRuntime(fn() => ConversationHttpInput::parse('[]', 'create'), 'create requires empty JSON object not array');
$path = tempnam(sys_get_temp_dir(), 'recommendation-quota-');
try {
    $raceDb = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]); ConversationRuntimeSchema::install($raceDb);
    $raceRuntime = new PdoConversationRuntime($raceDb); $raceRuntime->configure(1, true, 'synthetic-provider', 'v1');
    (new PdoRecommendationBudget($raceDb, $f->platform, $raceRuntime, $raceRuntime->identity(), $f->clock))->configureAllowance(1, 1);
    $workers = [];
    foreach (['race-a', 'race-b'] as $permit) { $process = proc_open([PHP_BINARY, '-n', __DIR__ . '/race.php', $path, $permit], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes); checkRuntime(trim(fgets($pipes[1])) === 'READY', 'separate reservation worker prepared'); $workers[] = [$process, $pipes]; }
    foreach ($workers as [$process, $pipes]) { fwrite($pipes[0], "GO\n"); fclose($pipes[0]); }
    $results = []; foreach ($workers as [$process, $pipes]) { $results[] = trim(stream_get_contents($pipes[1])); $error = stream_get_contents($pipes[2]); fclose($pipes[1]); fclose($pipes[2]); checkRuntime(proc_close($process) === 0 && $error === '', 'reservation worker exits cleanly'); }
    sort($results); checkRuntime($results === ['DENIED:0', 'RESERVED:1'], 'two processes race for one remaining permit with exactly one platform attempt');
    checkRuntime((int)$raceDb->query('SELECT reserved FROM matcher_recommendation_quota')->fetchColumn() === 1 && (int)$raceDb->query('SELECT COUNT(*) FROM matcher_recommendation_attempt')->fetchColumn() === 1, 'race commits exactly one durable quota and attempt');
    ConversationStorageSchema::install($raceDb); $workers = [];
    for ($i = 0; $i < 2; $i++) { $process = proc_open([PHP_BINARY, '-n', __DIR__ . '/race.php', $path, 'create'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes); checkRuntime(trim(fgets($pipes[1])) === 'READY', 'separate create worker prepared'); $workers[] = [$process, $pipes]; }
    foreach ($workers as [$process, $pipes]) { fwrite($pipes[0], "GO\n"); fclose($pipes[0]); }
    $results = []; foreach ($workers as [$process, $pipes]) { $results[] = trim(stream_get_contents($pipes[1])); $error = stream_get_contents($pipes[2]); fclose($pipes[1]); fclose($pipes[2]); checkRuntime(proc_close($process) === 0 && $error === '', 'create worker exits cleanly'); }
    checkRuntime($results[0] === $results[1] && str_ends_with($results[0], ':0') && (int)$raceDb->query('SELECT COUNT(*) FROM matcher_recommendation_conversation')->fetchColumn() === 1, 'concurrent same actor event key creates one durable zero-model conversation');
} finally { unset($raceDb); @unlink($path); }
echo json_encode(['suite' => 'conversation_runtime', 'status' => 'passed', 'checks' => count($checks), 'labels' => $checks, 'network_calls' => 0, 'production_database_calls' => 0, 'real_model_calls' => 0], JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT) . PHP_EOL;
