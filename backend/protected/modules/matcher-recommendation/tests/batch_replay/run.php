<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/support/autoload.php';
require_once __DIR__ . '/Fixtures.php';
use humhub\modules\matcherRecommendation\adapters\cursor\HmacDiscoveryCursorCodec;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CurrentEventContext, DiscoveryCursor};
use humhub\modules\matcherRecommendation\domain\{BatchReplayException, RulePolicy};
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;
use humhub\modules\matcherRecommendation\tests\batch_replay\Fixtures as F;
use humhub\modules\matcherRecommendation\tests\support\FixtureEnvironment;

$checks = [];
function verify(bool $condition, string $name): void { global $checks; if (!$condition) { throw new RuntimeException('FAIL: ' . $name); } $checks[] = $name; }
function rejects(callable $call, string $reason, string $name): void
{
    try { $call(); } catch (BatchReplayException $error) { verify($error->reason === $reason && $error->getPrevious() === null, $name . ' [' . $error->reason . ']'); return; }
    verify(false, $name);
}
function items($page): array { return array_map(static fn($item): string => $item->candidate->targetId, $page->items); }
function cursorCopy(DiscoveryCursor $cursor, array $changes): DiscoveryCursor
{
    $v = array_replace(get_object_vars($cursor), $changes);
    return new DiscoveryCursor($v['batchId'], $v['viewerId'], $v['spaceId'], $v['contextFingerprint'], $v['queryHash'], $v['policyVersion'], $v['policyFingerprint'], $v['batchFingerprint'], $v['position'], $v['createdAt'], $v['expiresAt']);
}
function base64url(string $value): string { return rtrim(strtr(base64_encode($value), '+/', '-_'), '='); }
function signedPayload(string $payload): string
{
    $encoded = base64url($payload);
    return 'v1.' . $encoded . '.' . base64url(hash_hmac('sha256', "matcher-recommendation.cursor.v1\0" . $encoded, F::KEY, true));
}

foreach ([0, 1, 30, 200] as $size) {
    $f = new F($size); $cursor = null; $all = []; $positions = []; $pages = 0;
    do {
        $page = $f->service()->execute(1, $f->batchId, $cursor); $pages++;
        array_push($all, ...items($page)); array_push($positions, ...array_column($page->items, 'position'));
        verify($page->limit === 24 && count($page->items) <= 24, $size . ' batch applies default page size 24');
        verify($page->expiresAt == $f->batch()->expiresAt && $page->total === $size, $size . ' page keeps original expiry and fixed total');
        $cursor = $page->nextCursor;
    } while ($cursor !== null);
    verify($all === $f->batch()->targetIds && count(array_unique($all)) === $size, $size . ' complete traversal preserves saved order with no duplicate or missing position');
    verify($positions === ($size === 0 ? [] : range(0, $size - 1)), $size . ' traversal positions are consecutive');
    verify($f->batches->writes === 0, $size . ' replay never writes or replaces a batch');
    verify(count($f->profiles->requests) === ($size === 0 ? 0 : $pages * 2), $size . ' replay performs two complete profile observations per nonempty page');
    verify(count($f->relationships->requests) === ($size === 0 ? 0 : $pages * 2), $size . ' replay performs two complete relationship observations per nonempty page');
    verify(array_reduce([...$f->profiles->requests, ...$f->relationships->requests], static fn(bool $ok, array $ids): bool => $ok && $ids === $f->batch()->targetIds, true), $size . ' every observation includes page-external people');
}
$f = new F(200); $page = $f->service()->execute(1, $f->batchId, limit: 48);
verify(count($page->items) === 48, 'maximum page size 48 is supported without changing the 200-person batch budget');
$next = $f->service()->execute(1, $f->batchId, $page->nextCursor, 7);
verify($next->position === 48 && items($next) === array_slice($f->batch()->targetIds, 48, 7), 'changing a valid limit continues from the signed position without arbitrary jump support');
verify(!property_exists($next->items[0], 'assessment') && !property_exists($next->items[0], 'score') && !property_exists($next->items[0], 'reasons'), 'replay returns no fabricated assessment score or reasons');
foreach ([0, -1, 49, PHP_INT_MAX] as $limit) { rejects(fn() => $f->service()->execute(1, $f->batchId, limit: $limit), 'invalid_request', 'out-of-range page limit is rejected'); }
foreach (['', "bad\nidentifier", str_repeat('x', 129)] as $id) { rejects(fn() => $f->service()->execute(1, $id), 'invalid_request', 'invalid batch identifier is rejected'); }
rejects(fn() => $f->service()->execute(1, $f->batchId, ''), 'invalid_request', 'empty continuation is not silently treated as first page');
rejects(fn() => $f->service()->execute(1, 'absent-batch'), 'batch_not_found', 'missing batch is not a successful empty result');

$f = new F(); $page = $f->service()->execute(1, $f->batchId); $signed = $page->nextCursor; $decoded = $f->cursors->decode($signed);
verify($f->cursors->encode($decoded) === $signed, 'signed cursor has a canonical reproducible representation');
verify($decoded->position === 24 && $decoded->expiresAt == $f->batch()->expiresAt && $decoded->createdAt == $f->batch()->createdAt, 'cursor binds original position and microsecond batch lifetime');
verify(!str_contains(base64_decode(strtr(explode('.', $signed)[1], '-_', '+/')), 'robotics'), 'cursor contains no source profile or query values');
foreach (['', 'unsigned', str_repeat('a', 4097), $signed . '=', 'v2' . substr($signed, 2), substr($signed, 0, -1) . (substr($signed, -1) === 'a' ? 'b' : 'a')] as $bad) {
    rejects(fn() => $f->cursors->decode($bad), 'cursor_invalid', 'malformed unsigned or tampered cursor is rejected');
}
$wrongKey = new HmacDiscoveryCursorCodec(str_repeat('q', 32));
rejects(fn() => $wrongKey->decode($signed), 'cursor_invalid', 'another key cannot validate the cursor');
$payload = base64_decode(strtr(explode('.', $signed)[1], '-_', '+/')); $value = json_decode($payload, true);
$malformed = [str_repeat('x', 2049), '{', 'null', "{\"invalid\":\"\xff\"}", ' ' . $payload, str_replace('"position":24', '"position":24.0', $payload), str_replace('"position":24', '"position":9223372036854775808', $payload), str_replace('"position":24', '"position":0', $payload), str_replace('"position":24', '"position":201', $payload), str_replace('"position":24', '"position":"24"', $payload), str_replace('"viewer_id":1', '"viewer_id":1,"viewer_id":1', $payload)];
foreach (['extra' => true, 'position' => null, 'expires_at' => '2026-02-30T00:00:00.123456Z', 'created_at' => '2026-11-11T00:00:00Z'] as $key => $invalid) { $v = $value; $v[$key] = $invalid; $malformed[] = json_encode($v, JSON_UNESCAPED_SLASHES); }
$v = $value; unset($v['query_hash']); $malformed[] = json_encode($v, JSON_UNESCAPED_SLASHES);
$v = array_reverse($value, true); $malformed[] = json_encode($v, JSON_UNESCAPED_SLASHES);
foreach ($malformed as $badPayload) { rejects(fn() => $f->cursors->decode(signedPayload($badPayload)), 'cursor_invalid', 'even signed noncanonical or overbroad payload fails strict cursor decoding'); }
foreach (['batchId' => 'another-batch', 'viewerId' => 2, 'spaceId' => 8, 'contextFingerprint' => str_repeat('a', 64), 'queryHash' => str_repeat('b', 64), 'policyVersion' => 'other-policy', 'policyFingerprint' => str_repeat('c', 64), 'batchFingerprint' => str_repeat('d', 64), 'position' => 30, 'createdAt' => $decoded->createdAt->modify('+1 second'), 'expiresAt' => $decoded->expiresAt->modify('-1 second')] as $key => $change) {
    $other = $f->cursors->encode(cursorCopy($decoded, [$key => $change]));
    rejects(fn() => $f->service()->execute(1, $f->batchId, $other), 'cursor_invalid', 'continuation binding rejects changed ' . $key);
}

$f = new F(); $f->clock->time = $f->batch()->expiresAt->modify('-1 microsecond');
$page = $f->service()->execute(1, $f->batchId);
verify($f->cursors->decode($page->nextCursor)->expiresAt == $f->batch()->expiresAt, 'late first-page request cannot extend cursor lifetime');
$f->clock->time = $f->batch()->expiresAt;
rejects(fn() => $f->service()->execute(1, $f->batchId, $page->nextCursor), 'batch_expired', 'exact 15-minute boundary is expired');
$f = new F(); $f->replace(['expiresAt' => $f->batch()->createdAt->modify('+16 minutes')]);
rejects(fn() => $f->service()->execute(1, $f->batchId), 'batch_invalidated', 'a stored batch cannot grant a lifetime over 15 minutes');
$f = new F(); $f->clock->time = $f->batch()->createdAt->modify('-1 microsecond');
rejects(fn() => $f->service()->execute(1, $f->batchId), 'batch_invalidated', 'future-created batch is rejected');
$f = new F(); $f->replace(['policyFingerprint' => null]);
rejects(fn() => $f->service()->execute(1, $f->batchId), 'batch_invalidated', 'legacy batch without saved policy content binding cannot replay');
$f = new F(); $f->policies->policy = new RulePolicy($f->policies->policy->version, ['synthetic_only' => false]);
rejects(fn() => $f->service()->execute(1, $f->batchId), 'batch_invalidated', 'same-version policy content change invalidates replay');
$f = new F(); $f->policies->policy = new RulePolicy('synthetic-policy-2', $f->policies->policy->parameters);
rejects(fn() => $f->service()->execute(1, $f->batchId), 'batch_invalidated', 'republished identical policy with a fresh version cannot revive an old batch');

foreach (['missing_profile', 'changed_content', 'changed_revision', 'changed_relationship', 'blocked', 'missing_relationship'] as $change) {
    $f = new F(); $id = $f->batch()->targetIds[29];
    if ($change === 'missing_profile') { unset($f->profiles->rows[$id]); }
    if ($change === 'changed_content') { $f->profiles->rows[$id] = FixtureEnvironment::person($id, topic: 'synthetic-private-changed-profile'); }
    if ($change === 'changed_revision') { $f->profiles->rows[$id] = FixtureEnvironment::person($id, revision: 4); }
    if ($change === 'changed_relationship') { $f->relationships->rows[$id]['version'] = 'new-current-relation'; }
    if ($change === 'blocked') { $f->relationships->rows[$id]['blocked'] = true; }
    if ($change === 'missing_relationship') { unset($f->relationships->rows[$id]); }
    rejects(fn() => $f->service()->execute(1, $f->batchId), 'batch_invalidated', 'page-external ' . $change . ' invalidates the entire batch');
}
$f = new F(); $f->profiles->onRead = static function ($profiles) use ($f): void { if (count($profiles->requests) === 2) { unset($profiles->rows[$f->batch()->targetIds[29]]); } };
rejects(fn() => $f->service()->execute(1, $f->batchId), 'batch_invalidated', 'second full profile observation catches revocation during replay');
$f = new F(); $f->relationships->onRead = static function ($relationships) use ($f): void { if (count($relationships->requests) === 2) { $relationships->rows[$f->batch()->targetIds[29]]['version'] = 'changed-between-observations'; } };
rejects(fn() => $f->service()->execute(1, $f->batchId), 'batch_invalidated', 'second full relationship observation catches intervening relationship changes');
$f = new F(); $f->relationships->onRead = static function ($relationships) use ($f): void { if (count($relationships->requests) === 2) { $f->clock->time = $f->batch()->expiresAt; } };
rejects(fn() => $f->service()->execute(1, $f->batchId), 'batch_expired', 'batch that expires during reads cannot publish a page');
$f = new F(); $f->policies->onCurrent = static function ($policies): void { if ($policies->reads === 3) { $policies->policy = new RulePolicy('policy-changed-before-return'); } };
rejects(fn() => $f->service()->execute(1, $f->batchId), 'batch_invalidated', 'policy changed immediately before return prevents page publication');
$f = new F(); $f->batches->onGet = static function ($batches) use ($f): void { if ($batches->reads === 2) { $f->replace(['targetIds' => array_reverse($f->batch()->targetIds)]); } };
rejects(fn() => $f->service()->execute(1, $f->batchId), 'batch_invalidated', 'saved batch replacement during verification cannot reorder results');
$f = new F(); $page = $f->service()->execute(1, $f->batchId); $f->replace(['targetIds' => array_reverse($f->batch()->targetIds)]);
rejects(fn() => $f->service()->execute(1, $f->batchId, $page->nextCursor), 'cursor_invalid', 'saved order mutation across requests invalidates prior continuation');
$f = new F(); $f->events->context = new CurrentEventContext(1, 7, 'synthetic-access-new-selection', 'synthetic-event-policy');
rejects(fn() => $f->service()->execute(1, $f->batchId), 'batch_invalidated', 'same-Space selection revision change invalidates saved context');
$f = new F(); $f->events->context = new CurrentEventContext(2, 7, 'synthetic-access-a', 'synthetic-event-policy');
rejects(fn() => $f->service()->execute(2, $f->batchId), 'batch_invalidated', 'another authenticated viewer cannot read the saved batch');
$f = new F(); $f->events->context = new CurrentEventContext(1, 8, 'synthetic-access-a', 'synthetic-event-policy');
rejects(fn() => $f->service()->execute(1, $f->batchId), 'batch_invalidated', 'another server-selected activity cannot reuse batch IDs');
$f = new F(); $f->events->override = new CurrentEventContext(2, 7, 'forged', 'forged');
rejects(fn() => $f->service()->execute(1, $f->batchId), 'batch_invalidated', 'malformed current-event adapter cannot substitute another actor');
$f = new F(); $f->events->onAssert = static function ($events): void { if ($events->checks === 3) { $events->context = new CurrentEventContext(1, 8, 'new-selection', 'synthetic-event-policy'); } };
rejects(fn() => $f->service()->execute(1, $f->batchId), 'dependency_unavailable', 'event revocation during replay is an explicit failure');

$f = new F(); $f->profiles->onRead = static function ($profiles): void { $profiles->rows = array_reverse($profiles->rows, true); };
$f->relationships->onRead = static function ($relationships): void { $relationships->rows = array_reverse($relationships->rows, true); };
verify(items($f->service()->execute(1, $f->batchId)) === array_slice($f->batch()->targetIds, 0, 24), 'source adapter iteration order cannot alter saved page order');
foreach (['duplicate_profiles', 'foreign_profile', 'wrong_space', 'relationship_extra_key', 'relationship_nonboolean'] as $bad) {
    $f = new F(); $ids = $f->batch()->targetIds;
    if ($bad === 'duplicate_profiles') { $v = array_values($f->profiles->rows); $v[29] = $v[0]; $f->profiles->override = $v; }
    if ($bad === 'foreign_profile') { $v = array_values($f->profiles->rows); $v[29] = FixtureEnvironment::person('999'); $f->profiles->override = $v; }
    if ($bad === 'wrong_space') { $f->profiles->rows[$ids[29]] = FixtureEnvironment::person($ids[29], 8); }
    if ($bad === 'relationship_extra_key') { $f->relationships->rows[$ids[29]]['secret'] = 'synthetic'; }
    if ($bad === 'relationship_nonboolean') { $f->relationships->rows[$ids[29]]['friend'] = 1; }
    rejects(fn() => $f->service()->execute(1, $f->batchId), 'batch_invalidated', 'malformed upstream ' . $bad . ' fails without partial results');
}
$f = new F(); $f->profiles->onRead = static function (): void { throw new RuntimeException('synthetic-private-upstream-payload'); };
rejects(fn() => $f->service()->execute(1, $f->batchId), 'dependency_unavailable', 'upstream exceptions cannot become successful empty pages');
$old = ini_set('zend.exception_ignore_args', '0');
try {
    try { new HmacDiscoveryCursorCodec('synthetic-short-secret'); }
    catch (InvalidArgumentException $error) { verify(($error->getTrace()[0]['args'][0] ?? null) instanceof SensitiveParameterValue && !str_contains((string)$error . json_encode($error->getTrace()), 'synthetic-short-secret'), 'invalid signing key is redacted even with exception arguments enabled'); }
    $f = new F(); $id = $f->batch()->targetIds[29]; $f->profiles->rows[$id] = FixtureEnvironment::person($id, topic: 'synthetic-private-profile-marker');
    try { $f->service()->execute(1, $f->batchId); verify(false, 'private changed projection must fail'); }
    catch (BatchReplayException $error) { verify(!str_contains(serialize($error), 'synthetic-private-profile-marker') && $error->getPrevious() === null, 'public replay exception drops private projection arguments and previous chains'); }
} finally { if ($old !== false) { ini_set('zend.exception_ignore_args', $old); } }

echo json_encode(['status' => 'passed', 'scope' => 'Pure fixed-batch replay and real HMAC cursor on memory ports with synthetic profiles; no HTTP application or database.', 'checks' => count($checks), 'checks_passed' => $checks, 'production_database_calls' => 0, 'network_calls' => 0, 'model_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
