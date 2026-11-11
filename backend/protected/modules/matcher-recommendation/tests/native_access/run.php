<?php
declare(strict_types=1);
// No BootstrapService, application, .env, local credentials, existing database or module enablement.
$backend = dirname(__DIR__, 5);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
require_once dirname(__DIR__) . '/support/autoload.php';
require_once __DIR__ . '/Fixtures.php';

use humhub\modules\matcherRecommendation\adapters\native\{NativeAccessException, NativeContactEligibilityReader, NativeCurrentEventAccess, NativeEligibilityQuery, YiiSessionSelectionSource};
use humhub\modules\matcherRecommendation\contracts\{CandidateRequest, CurrentEventContext};
use humhub\modules\matcherRecommendation\tests\native_access\{Fixtures as F, MutableSelection, SyntheticSession, SyntheticWebUser};

$checks = [];
function verify(bool $condition, string $label): void { global $checks; if (!$condition) { throw new RuntimeException('FAIL: ' . $label); } $checks[] = $label; }
function rejects(callable $action, string $reason, string $label): void
{
    try { $action(); } catch (NativeAccessException $error) { verify($error->reason === $reason, $label . ' [' . $error->reason . ']'); return; }
    verify(false, $label);
}

$actor = new SyntheticWebUser(); $session = new SyntheticSession();
$source = new YiiSessionSelectionSource($actor, $session);
rejects(fn() => $source->read(), 'current_event_required', 'missing server selection is not inferred from a Space URL');
$session->values['event_id'] = 7;
rejects(fn() => $source->read(), 'current_event_required', 'unrelated request-like session fields cannot select an activity');
$session->values[YiiSessionSelectionSource::SESSION_KEY] = ['actor_id' => 1, 'space_id' => 7, 'selection_revision' => 'selection-1'];
verify($source->read()['space_id'] === 7, 'session source reads the explicit server selection');
$actor->syntheticId = '1'; verify($source->read()['actor_id'] === 1, 'canonical native identity string is accepted');
$actor->syntheticId = 2; rejects(fn() => $source->read(), 'current_event_mismatch', 'selection is bound to the currently authenticated actor');
$actor->syntheticId = 1; $actor->syntheticGuest = true; rejects(fn() => $source->read(), 'authentication_required', 'guest cannot reuse a stored activity selection');
$actor->syntheticGuest = false; $actor->syntheticId = '01'; rejects(fn() => $source->read(), 'authentication_required', 'noncanonical actor identity is rejected');
$actor->syntheticId = 1;
foreach ([['actor_id' => 1, 'space_id' => 7], ['actor_id' => 1, 'space_id' => '7', 'selection_revision' => 'a'], ['actor_id' => 1, 'space_id' => 7, 'selection_revision' => ''], ['actor_id' => 1, 'space_id' => 7, 'selection_revision' => 'a', 'trusted' => true]] as $bad) {
    $session->values[YiiSessionSelectionSource::SESSION_KEY] = $bad;
    rejects(fn() => $source->read(), 'current_event_required', 'malformed or overbroad server-selection state is rejected');
}
verify($session->writes === 0, 'selection source never writes the session');

$db = F::database(); $selection = new MutableSelection(); $events = F::events($db, $selection);
$context = $events->resolve(1, 7);
verify($context->viewerId === 1 && $context->spaceId === 7 && $context->policyVersion === 'synthetic-activity-policy-1', 'native account Space membership and explicit activity policy resolve');
verify(count($db->selects) === 1, 'event resolution performs one joined native SELECT');
$events->assertCurrent($context); verify(count($db->selects) === 2, 'context validation rereads native authorization instead of trusting the DTO');
rejects(fn() => $events->resolve(2, 7), 'current_event_mismatch', 'caller cannot impersonate another server actor');
rejects(fn() => $events->resolve(1, 8), 'current_event_mismatch', 'even another joined Space cannot override the selected Space hint');
rejects(fn() => $events->assertCurrent(new CurrentEventContext(1, 7, 'forged', $context->policyVersion)), 'context_changed', 'constructed context is not an authorization token');
$selection->value['selection_revision'] = 'synthetic-selection-2';
rejects(fn() => $events->assertCurrent($context), 'context_changed', 'changing selection revision invalidates an earlier context');
$fresh = $events->resolve(1);
rejects(fn() => (new NativeCurrentEventAccess($db, $selection, 'synthetic-activity-policy-2'))->assertCurrent($fresh), 'context_changed', 'activity-policy version change invalidates prior context');
$selection->onRead = static function (MutableSelection $selected): void { if ($selected->reads % 2 === 0) { $selected->value['selection_revision'] .= '-changed'; } };
rejects(fn() => $events->resolve(1), 'context_changed', 'selection changed while reading native facts is rejected');

foreach ([0, 2, 3] as $status) {
    $db = F::database(); $db->createCommand()->update('user', ['status' => $status], ['id' => 1])->execute();
    rejects(fn() => F::events($db)->resolve(1), 'access_denied', 'viewer disabled unapproved and deleted statuses cannot browse');
}
foreach ([0, 2] as $status) {
    $db = F::database(); $db->createCommand()->update('space', ['status' => $status], ['id' => 7])->execute();
    rejects(fn() => F::events($db)->resolve(1), 'access_denied', 'disabled and archived Spaces are not active activities');
}
foreach ([1, 2] as $status) {
    $db = F::database(); $db->createCommand()->update('space_membership', ['status' => $status], ['user_id' => 1, 'space_id' => 7])->execute();
    rejects(fn() => F::events($db)->resolve(1), 'access_denied', 'invited and applicant viewers are not formal members');
}
$db = F::database(); $db->createCommand()->delete('space_membership', ['user_id' => 1, 'space_id' => 7])->execute();
$db->createCommand()->update('space', ['visibility' => 2], ['id' => 7])->execute();
rejects(fn() => F::events($db)->resolve(1), 'access_denied', 'public Space visibility does not substitute for current membership');
$db = F::database(); F::block($db, 1007, 1);
rejects(fn() => F::events($db)->resolve(1), 'access_denied', 'Space blocking overrides a stale member record');
$db = F::database(); $db->createCommand()->update('user', ['contentcontainer_id' => null], ['id' => 1])->execute();
rejects(fn() => F::events($db)->resolve(1), 'access_denied', 'missing native container cannot bypass block verification');
$db = F::database(); F::member($db, 1);
rejects(fn() => F::events($db)->resolve(1), 'dependency_unavailable', 'ambiguous duplicate viewer memberships fail closed');
$db = F::database(); $db->createCommand()->update('user', ['visibility' => 3], ['id' => 1])->execute();
verify(F::events($db)->resolve(1)->viewerId === 1, 'viewer discovery visibility does not remove their own active browsing rights');

$db = F::database(); $events = F::events($db); $context = $events->resolve(1);
$db->createCommand()->update('space_membership', ['group_id' => 'admin'], ['user_id' => 1, 'space_id' => 7])->execute();
rejects(fn() => $events->assertCurrent($context), 'context_changed', 'observed membership-role change invalidates context fingerprint');
$context = $events->resolve(1);
$db->createCommand()->delete('space_membership', ['user_id' => 1, 'space_id' => 7])->execute(); F::member($db, 1);
rejects(fn() => $events->assertCurrent($context), 'context_changed', 'membership delete and recreate changes the native row identity');
$context = $events->resolve(1);
$db->createCommand()->update('space', ['join_policy' => 0], ['id' => 7])->execute();
rejects(fn() => $events->assertCurrent($context), 'context_changed', 'observed activity policy facts invalidate context fingerprint');

$db = F::database(); $events = F::events($db); $context = $events->resolve(1); $reader = new NativeContactEligibilityReader($db, $events);
F::friend($db, 1, 2); F::friend($db, 2, 1); F::friend($db, 1, 3); F::friend($db, 4, 1);
$db->selects = [];
$states = $reader->readCurrent(new CandidateRequest($context, 'person', ['4', '2', '5', '3']));
verify(array_map(strval(...), array_keys($states)) === ['4', '2', '5', '3'], 'batch relationship output preserves the requested candidate order');
verify($states[2]['friend'] && !$states[2]['pending_in'] && !$states[2]['pending_out'], 'mutual native rows mean friendship');
verify($states[3]['pending_out'] && !$states[3]['friend'] && !$states[3]['pending_in'], 'only outgoing native row means pending out');
verify($states[4]['pending_in'] && !$states[4]['friend'] && !$states[4]['pending_out'], 'only incoming native row means pending in');
verify(!$states[5]['friend'] && !$states[5]['pending_in'] && !$states[5]['pending_out'] && !$states[5]['blocked'], 'absence of current relation is explicit without invented history');
verify(count($states) === 4, 'ordinary discovery retains friends and pending people');
verify(count($db->selects) === 3, 'batch current relationship read performs two access checks and one joined data SELECT');
verify(array_reduce($db->selects, fn(bool $ok, array $q): bool => $ok && $q['master'] && $q['cache_disabled'], true), 'every native authorization read uses master with query cache disabled');
verify(!$reader->supportsSentHistory(), 'native current Friendship does not claim terminal request history support');
rejects(fn() => $reader->readSentHistory(new CandidateRequest($context, 'person', ['5'])), 'unsupported_history', 'history request fails explicitly instead of returning false for everyone');
$oldVersion = $states[2]['version']; $db->createCommand()->delete('user_friendship', ['user_id' => 2, 'friend_user_id' => 1])->execute();
$fresh = $reader->readCurrent(new CandidateRequest($context, 'person', ['2']));
verify($fresh[2]['pending_out'] && $fresh[2]['version'] !== $oldVersion, 'friendship changes are reread and change the current-facts version');

foreach ([[10001, 2], [10002, 1], [1007, 2]] as [$container, $user]) {
    $db = F::database(); $events = F::events($db); $context = $events->resolve(1); F::block($db, $container, $user);
    $reader = new NativeContactEligibilityReader($db, $events);
    verify($reader->readCurrent(new CandidateRequest($context, 'person', ['2']))[2]['blocked'], 'user-out user-in and Space blocks remain actual relationship facts');
    $native = new NativeEligibilityQuery($db);
    verify($native->run($native->candidateQuery($context, ['2'])) === [], 'shared recall eligibility excludes every authoritative block direction');
}
foreach ([['user', ['status' => 0], ['id' => 2]], ['user', ['status' => 2], ['id' => 2]], ['user', ['status' => 3], ['id' => 2]], ['user', ['visibility' => 3], ['id' => 2]], ['space_membership', ['status' => 1], ['user_id' => 2, 'space_id' => 7]], ['space_membership', ['status' => 2], ['user_id' => 2, 'space_id' => 7]]] as [$table, $values, $where]) {
    $db = F::database(); $events = F::events($db); $context = $events->resolve(1);
    $db->createCommand()->update($table, $values, $where)->execute();
    $reader = new NativeContactEligibilityReader($db, $events);
    rejects(fn() => $reader->readCurrent(new CandidateRequest($context, 'person', ['2'])), 'candidate_access_revoked', 'ineligible candidate is not mislabeled as unblocked or blocked');
}
$db = F::database(); $events = F::events($db); $context = $events->resolve(1); $reader = new NativeContactEligibilityReader($db, $events);
$db->createCommand()->delete('space_membership', ['user_id' => 2, 'space_id' => 7])->execute(); F::member($db, 2, 8);
rejects(fn() => $reader->readCurrent(new CandidateRequest($context, 'person', ['2'])), 'candidate_access_revoked', 'candidate membership in another activity cannot fill this activity');
rejects(fn() => $reader->readCurrent(new CandidateRequest($context, 'person', ['999'])), 'candidate_access_revoked', 'missing requested candidate is a stale authorization result');
rejects(fn() => $reader->readCurrent(new CandidateRequest($context, 'idea', ['3'])), 'invalid_request', 'person relationship policy cannot be applied to an idea');
rejects(fn() => $reader->readCurrent(new CandidateRequest($context, 'person', ['1'])), 'invalid_request', 'viewer is not a person recommendation candidate');
foreach (['02', '1 OR 1=1', '9223372036854775808'] as $id) { rejects(fn() => $reader->readCurrent(new CandidateRequest($context, 'person', [$id])), 'invalid_request', 'native IDs are bounded canonical integers'); }
rejects(fn() => NativeEligibilityQuery::assertPersonIds(['2', '2']), 'invalid_request', 'duplicate native IDs are rejected');
rejects(fn() => NativeEligibilityQuery::assertPersonIds(array_fill(0, 201, '2')), 'invalid_request', 'native batch cannot exceed 200 explicit IDs');
$db->selects = []; verify($reader->readCurrent(new CandidateRequest($context, 'person', [])) === [] && count($db->selects) === 1, 'empty IDs read no people while still revalidating current access');
$native = new NativeEligibilityQuery($db); verify($native->run($native->candidateQuery($context, [])) === [], 'explicit empty recall IDs never expand to the entire activity');

$db = F::database(); $events = F::events($db); $context = $events->resolve(1); $reader = new NativeContactEligibilityReader($db, $events);
$db->selects = []; $db->onSelect = static function ($db, int $count): void { if ($count === 2) { $db->createCommand()->delete('space_membership', ['user_id' => 2, 'space_id' => 7])->execute(); } };
rejects(fn() => $reader->readCurrent(new CandidateRequest($context, 'person', ['2'])), 'candidate_access_revoked', 'candidate removal during a batch fails closed');
$db = F::database(); $events = F::events($db); $context = $events->resolve(1); $reader = new NativeContactEligibilityReader($db, $events);
$db->selects = []; $db->onSelect = static function ($db, int $count): void { if ($count === 3) { $db->createCommand()->delete('space_membership', ['user_id' => 1, 'space_id' => 7])->execute(); } };
rejects(fn() => $reader->readCurrent(new CandidateRequest($context, 'person', ['2'])), 'access_denied', 'viewer revocation during a relationship read is checked before return');

$batchQueryCounts = [];
foreach ([1, 30, 200] as $size) {
    $db = F::database($size); $events = F::events($db); $context = $events->resolve(1); $reader = new NativeContactEligibilityReader($db, $events);
    $ids = array_map(strval(...), range(2, $size + 1)); $db->selects = [];
    $states = $reader->readCurrent(new CandidateRequest($context, 'person', $ids));
    $batchQueryCounts[$size] = count($db->selects);
    verify(count($states) === $size && count($db->selects) === 3, 'native relationship batch has constant SELECT count at size ' . $size);
}
$db = F::database(400); $events = F::events($db); $context = $events->resolve(1); $native = new NativeEligibilityQuery($db);
$rows = $native->run($native->candidateQuery($context)->select(['id' => 'u.id'])->distinct()->orderBy(['u.id' => SORT_DESC])->limit(80));
verify(count($rows) === 80 && (int)$rows[0]['id'] === 401, 'shared eligibility allows bounded ranking across all 400 members without an earliest-200 cutoff');
$db = F::database(); $events = F::events($db); $context = $events->resolve(1); $native = new NativeEligibilityQuery($db);
$query = $native->candidateQuery($context, ['2'])->cache(3600);
verify(count($native->run($query)) === 1, 'caller query-cache request cannot change initial native eligibility');
$db->createCommand()->update('user', ['visibility' => 3], ['id' => 2])->execute();
verify($native->run($query) === [], 'even an explicitly cacheable query rereads a revoked candidate');
$db->createCommand('DROP TABLE contentcontainer_blocked_users')->execute();
rejects(fn() => $events->assertCurrent($context), 'dependency_unavailable', 'missing authorization table is a dependency failure not zero matches');

$db = F::database(); $events = F::events($db); $context = $events->resolve(1); $native = new NativeEligibilityQuery($db); $reader = new NativeContactEligibilityReader($db, $events);
$db->selects = []; $transaction = $db->beginTransaction();
try {
    rejects(fn() => $events->resolve(1), 'authorization_transaction_unsupported', 'event authorization refuses a possibly stale outer transaction snapshot');
    rejects(fn() => $native->run($native->candidateQuery($context, ['2'])), 'authorization_transaction_unsupported', 'shared recall eligibility uses the same fresh-read transaction guard');
    rejects(fn() => $reader->readCurrent(new CandidateRequest($context, 'person', ['2'])), 'authorization_transaction_unsupported', 'relationship reads cannot bypass the transaction authorization guard');
    verify($transaction->isActive && $db->selects === [], 'native adapters neither query stale snapshots nor change a caller transaction');
} finally { $transaction->rollBack(); }
verify(count($reader->readCurrent(new CandidateRequest($context, 'person', ['2']))) === 1, 'authorization reads resume after the caller ends its transaction');

$db = F::database(); $events = F::events($db); $context = $events->resolve(1); $native = new NativeEligibilityQuery($db);
$syntheticQuery = 'synthetic-sensitive-search-phrase';
$loggerCount = count(Yii::getLogger()->messages);
foreach ([[true, true], [true, false], [false, true], [false, false]] as [$logging, $profiling]) {
    $db->enableLogging = $logging; $db->enableProfiling = $profiling; $db->selects = [];
    $query = $native->candidateQuery($context, ['2'])->addSelect(['synthetic_term' => new yii\db\Expression(':syntheticTerm', [':syntheticTerm' => $syntheticQuery])]);
    verify(count($native->run($query)) === 1 && !$db->selects[0]['logging'] && !$db->selects[0]['profiling'], 'bound-term SELECT disables query logging and profiling during execution');
    verify($db->enableLogging === $logging && $db->enableProfiling === $profiling, 'successful query restores the exact caller logging and profiling flags');
    verify($db->enableSlaves && $db->enableQueryCache, 'query execution preserves other caller connection settings');
}
$db->enableLogging = true; $db->enableProfiling = true; $db->selects = [];
try {
    $native->run((new yii\db\Query())->from('synthetic_missing_relation')->where(['synthetic_term' => $syntheticQuery]));
    verify(false, 'database errors must fail');
} catch (NativeAccessException $error) {
    verify($error->reason === 'dependency_unavailable' && $error->getPrevious() === null, 'database errors expose a bounded failure without the raw SQL exception chain');
    verify(!str_contains($error->getMessage(), $syntheticQuery) && !str_contains((string)$error, 'synthetic_missing_relation'), 'public failure text contains neither bound query terms nor raw SQL');
}
verify(!$db->selects[0]['logging'] && !$db->selects[0]['profiling'], 'failing query also executes with logging and profiling disabled');
verify($db->enableLogging && $db->enableProfiling && $db->enableSlaves && $db->enableQueryCache, 'query failure restores caller flags and preserves other settings');
verify(count(Yii::getLogger()->messages) === $loggerCount, 'native successful and failing SELECTs add no Yii query log or profiling entries');

verify(Yii::$app === null, 'tests never construct a HumHub or Yii application');
verify(count(array_filter(get_included_files(), static fn(string $path): bool => str_contains($path, 'BootstrapService.php') || str_ends_with($path, '/.env'))) === 0, 'test bootstrap loads no application configuration or environment credentials');
echo json_encode(['status' => 'passed', 'scope' => 'Native adapters over fresh SQLite memory tables using installed HumHub model constants and Yii Query; no live application or production database.', 'checks' => count($checks), 'relationship_select_counts' => $batchQueryCounts, 'native_adapters_executed' => true, 'production_database_calls' => 0, 'network_calls' => 0, 'model_calls' => 0, 'application_created' => Yii::$app !== null, 'sent_history_supported' => false, 'checks_passed' => $checks], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
