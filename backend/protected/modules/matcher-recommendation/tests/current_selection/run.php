<?php
declare(strict_types=1);
$backend = dirname(__DIR__, 5);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
require_once dirname(__DIR__) . '/support/autoload.php';
require_once dirname(__DIR__) . '/native_access/Fixtures.php';

use humhub\modules\matcherRecommendation\adapters\native\{CurrentEventSelectionSchema, NativeAccessException, NativeCurrentEventAccess, ServerActorSessionSource, SqlCurrentEventSelectionStore, YiiActorSessionSource};
use humhub\modules\matcherRecommendation\application\SelectCurrentEvent;
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;
use humhub\modules\matcherRecommendation\contracts\ports\CurrentEventSelectionWriter;
use humhub\modules\matcherRecommendation\tests\native_access\{Fixtures as F, SyntheticWebUser};

final class MutableIdentity implements ServerActorSessionSource
{
    public array $value;
    public ?Closure $onRead = null;
    public int $reads = 0;
    public function __construct() { $this->value = ['actor_id' => 1, 'session_hash' => hash('sha256', 'synthetic-session-a')]; }
    public function read(): array
    {
        $this->reads++;
        if ($this->onRead !== null) { ($this->onRead)($this); }
        return $this->value;
    }
}
final class ActiveSyntheticSession extends yii\web\Session
{
    public bool $active = true;
    public mixed $fixtureId = 'synthetic-active-session';
    public bool $fails = false;
    public int $writes = 0;
    public function init() {}
    public function getIsActive() { return $this->active; }
    public function getId() { if ($this->fails) { throw new RuntimeException('synthetic-private-session-text'); } return $this->fixtureId; }
    public function set($key, $value) { $this->writes++; throw new RuntimeException('Native session writes are forbidden in this test.'); }
}
$checks = [];
function verify(bool $condition, string $name): void { global $checks; if (!$condition) { throw new RuntimeException('FAIL: ' . $name); } $checks[] = $name; }
function rejects(callable $call, string $reason, string $name): void
{
    try { $call(); }
    catch (NativeAccessException $error) { verify($error->reason === $reason && $error->getPrevious() === null, $name . ' [' . $error->reason . ']'); return; }
    verify(false, $name);
}
function setup(): array
{
    $db = F::database(); $db->schemaCache = new yii\caching\ArrayCache(); CurrentEventSelectionSchema::install($db); $identity = new MutableIdentity();
    $store = new SqlCurrentEventSelectionStore($db, $identity, 'synthetic-activity-policy-1');
    return [$db, $identity, $store, new NativeCurrentEventAccess($db, $store, 'synthetic-activity-policy-1')];
}
function rows($db): array { return (new yii\db\Query())->from(CurrentEventSelectionSchema::TABLE)->orderBy(['actor_id' => SORT_ASC, 'session_hash' => SORT_ASC])->all($db); }

$user = new SyntheticWebUser(); $session = new ActiveSyntheticSession(); $source = new YiiActorSessionSource($user, $session);
$identity = $source->read();
verify(array_keys($identity) === ['actor_id', 'session_hash'] && $identity['actor_id'] === 1 && preg_match('/^[a-f0-9]{64}$/D', $identity['session_hash']), 'server actor bridge exposes only verified actor ID and namespaced session hash');
verify(!str_contains(json_encode($identity), $session->fixtureId), 'raw session identifier never leaves the identity bridge');
$user->syntheticId = '1'; verify($source->read() === $identity, 'canonical native identity string resolves to the same integer actor');
$session->fixtureId = 'synthetic-rotated-session'; verify($source->read()['session_hash'] !== $identity['session_hash'], 'session rotation creates a distinct selection namespace');
foreach (['', '01', 0, '9223372036854775808', '1 OR 1=1', 1.5, null] as $id) {
    $user->syntheticId = $id; rejects(fn() => $source->read(), 'authentication_required', 'noncanonical server actor cannot form selection identity');
}
$user->syntheticId = 1; $user->syntheticGuest = true; rejects(fn() => $source->read(), 'authentication_required', 'guest cannot select an activity');
$user->syntheticGuest = false; $session->active = false; rejects(fn() => $source->read(), 'authentication_required', 'inactive session is not silently started');
$session->active = true;
foreach (['', "synthetic session", str_repeat('x', 257), null] as $id) { $session->fixtureId = $id; rejects(fn() => $source->read(), 'authentication_required', 'invalid server session ID is rejected'); }
$session->fixtureId = 'synthetic-session'; $session->fails = true;
rejects(fn() => $source->read(), 'dependency_unavailable', 'session backend error drops raw exception chain');
verify($session->writes === 0, 'identity bridge performs zero native session writes');

[$db, $identity, $store, $events] = setup();
rejects(fn() => $store->read(), 'current_event_required', 'reading unselected activity never infers a visited URL');
$usecase = new SelectCurrentEvent($store); $context = $usecase->execute(7, null); $first = $store->read();
verify($context->viewerId === 1 && $context->spaceId === 7, 'pure explicit selection use case resolves a native-authorized context');
verify(preg_match('/^selection-[a-f0-9]{32}$/D', $first['selection_revision']) === 1, 'initial selection receives a random bounded revision');
verify(count(rows($db)) === 1 && rows($db)[0]['session_hash'] === $identity->value['session_hash'], 'only one own-table row is stored for actor plus session hash');
$secondContext = $usecase->execute(8, $first['selection_revision']); $second = $store->read();
verify($second['space_id'] === 8 && $second['selection_revision'] !== $first['selection_revision'], 'explicit switch changes Space and revision atomically');
rejects(fn() => $events->assertCurrent($context), 'current_event_mismatch', 'switching activity invalidates the previous current context');
$thirdContext = $store->select(8, $second['selection_revision']); $third = $store->read();
verify($third['selection_revision'] !== $second['selection_revision'], 'even a repeated explicit selection receives a fresh revision');
rejects(fn() => $events->assertCurrent($secondContext), 'context_changed', 'same-Space reselection invalidates an earlier revision');
rejects(fn() => $store->select(7, $first['selection_revision']), 'context_changed', 'stale expected revision cannot replace a later selection');
rejects(fn() => $store->select(7, null), 'context_changed', 'null expected revision never overwrites an existing row');
verify($store->read() === $third, 'CAS conflicts preserve the winner exactly');
$otherStore = new SqlCurrentEventSelectionStore($db, $identity, 'synthetic-activity-policy-1');
$otherStore->select(7, $third['selection_revision']); $winner = $otherStore->read();
rejects(fn() => $store->select(8, $third['selection_revision']), 'context_changed', 'two adapter instances with one observed revision have one CAS winner');
verify($store->read() === $winner, 'losing concurrent switch cannot overwrite winning state');

foreach ([0, -1] as $space) { rejects(fn() => $store->select($space, $winner['selection_revision']), 'invalid_request', 'nonpositive Space is rejected before mutation'); }
foreach (['', 'caller-selected-revision', str_repeat('x', 100)] as $revision) { rejects(fn() => $store->select(8, $revision), 'invalid_request', 'malformed expected revision is rejected before mutation'); }
verify($store->read() === $winner, 'invalid input preserves existing selection');
$prior = rows($db);
$db->createCommand()->delete('space_membership', ['user_id' => 1, 'space_id' => 8])->execute();
rejects(fn() => $store->select(8, $winner['selection_revision']), 'access_denied', 'unjoined activity is not selectable even if public');
verify(rows($db) === $prior, 'failed target authorization leaves old selection unchanged');

foreach ([['user', ['status' => 0], ['id' => 1]], ['space', ['status' => 0], ['id' => 7]], ['space', ['status' => 2], ['id' => 7]], ['space_membership', ['status' => 1], ['user_id' => 1, 'space_id' => 7]], ['space_membership', ['status' => 2], ['user_id' => 1, 'space_id' => 7]]] as [$table, $values, $where]) {
    [$db, $identity, $store] = setup(); $db->createCommand()->update($table, $values, $where)->execute();
    rejects(fn() => $store->select(7, null), 'access_denied', 'selection requires enabled actor Space and formal membership');
    verify(rows($db) === [], 'failed first authorization creates no selection');
}
[$db, $identity, $store] = setup(); F::block($db, 1007, 1);
rejects(fn() => $store->select(7, null), 'access_denied', 'Space block overrides membership when selecting');
[$db, $identity, $store] = setup(); F::member($db, 1);
rejects(fn() => $store->select(7, null), 'dependency_unavailable', 'ambiguous native membership cannot select');

[$db, $identity, $store] = setup(); $store->select(7, null); $first = $store->read();
$identity->value['session_hash'] = hash('sha256', 'synthetic-session-b');
rejects(fn() => $store->read(), 'current_event_required', 'a different authenticated session cannot reuse another selection');
$store->select(8, null); verify(count(rows($db)) === 2, 'same actor selections are isolated per session');
$identity->value['actor_id'] = 2;
rejects(fn() => $store->read(), 'current_event_required', 'changed authenticated actor cannot reuse previous actor selection');
$store->select(7, null); verify(count(rows($db)) === 3, 'different actor cannot overwrite the prior actor row even with equal session hash');

[$db, $identity, $store] = setup();
$identity->onRead = static function (MutableIdentity $id): void { if ($id->reads === 2) { $id->value['session_hash'] = hash('sha256', 'synthetic-new-session'); } };
rejects(fn() => $store->select(7, null), 'context_changed', 'identity change during target authorization aborts before CAS');
verify(rows($db) === [], 'identity change before CAS writes no row');
[$db, $identity, $store] = setup();
$identity->onRead = static function (MutableIdentity $id): void { if ($id->reads === 3) { $id->value['session_hash'] = hash('sha256', 'synthetic-new-session'); } };
rejects(fn() => $store->select(7, null), 'context_changed', 'identity change after CAS aborts result');
verify(rows($db) === [], 'post-CAS identity failure invalidates only its issued revision');

[$db, $identity, $store] = setup(); $db->selects = [];
$db->onSelect = static function ($db, int $count): void { if ($count === 4) { $db->createCommand()->delete('space_membership', ['user_id' => 1, 'space_id' => 7])->execute(); } };
rejects(fn() => $store->select(7, null), 'access_denied', 'membership revoked after CAS is checked before returning context');
$db->onSelect = null; verify(rows($db) === [], 'failed post-write membership check invalidates own new selection');

[$db, $identity, $store] = setup(); $store->select(7, null); $previous = $store->read(); $db->selects = [];
$db->onSelect = static function ($db, int $count): void { if ($count === 4) { $db->createCommand()->delete('space_membership', ['user_id' => 1, 'space_id' => 8])->execute(); } };
rejects(fn() => $store->select(8, $previous['selection_revision']), 'access_denied', 'revocation after a replacement CAS fails instead of returning the new Space');
$db->onSelect = null; verify(rows($db) === [], 'failed post-CAS switch clears its revision and intentionally does not restore an older activity');

[$db, $identity, $store] = setup(); $db->selects = []; $newerRevision = 'selection-' . str_repeat('a', 32);
$db->onSelect = static function ($db, int $count) use ($newerRevision): void {
    if ($count === 4) {
        $db->createCommand()->delete('space_membership', ['user_id' => 1, 'space_id' => 7])->execute();
        $db->createCommand()->update(CurrentEventSelectionSchema::TABLE, ['space_id' => 8, 'selection_revision' => $newerRevision], ['actor_id' => 1])->execute();
    }
};
rejects(fn() => $store->select(7, null), 'access_denied', 'postcheck revocation remains an error while another switch wins');
$db->onSelect = null;
verify($store->read()['selection_revision'] === $newerRevision && $store->read()['space_id'] === 8, 'conditional cleanup never deletes a newer concurrent selection');

[$db, $identity, $store] = setup(); $db->selects = []; $newerRevision = 'selection-' . str_repeat('b', 32);
$db->onSelect = static function ($db, int $count) use ($newerRevision): void {
    if ($count === 2) { $db->createCommand()->update(CurrentEventSelectionSchema::TABLE, ['space_id' => 8, 'selection_revision' => $newerRevision], ['actor_id' => 1])->execute(); }
};
rejects(fn() => $store->select(7, null), 'context_changed', 'concurrent newer revision immediately after CAS prevents stale success');
$db->onSelect = null; verify($store->read()['selection_revision'] === $newerRevision, 'losing operation preserves concurrent post-CAS winner');

[$db, $identity, $store] = setup(); $transaction = $db->beginTransaction();
try {
    rejects(fn() => $store->select(7, null), 'authorization_transaction_unsupported', 'selection refuses stale outer native authorization transaction');
    rejects(fn() => $store->read(), 'authorization_transaction_unsupported', 'selection read also rejects a stale outer transaction');
    verify($transaction->isActive, 'selection never commits or rolls back another owner transaction');
} finally { $transaction->rollBack(); }
verify(rows($db) === [], 'refused transaction leaves selection absent');

[$db, $identity, $store] = setup(); $db->enableLogging = true; $db->enableProfiling = true; $db->selects = [];
$store->select(7, null);
verify(array_reduce($db->selects, static fn(bool $ok, array $q): bool => $ok && $q['master'] && $q['cache_disabled'] && !$q['logging'] && !$q['profiling'], true), 'selection reads use master without cache logging or profiling');
verify($db->enableLogging && $db->enableProfiling, 'selection restores connection logging and profiling flags');
$db->createCommand()->dropTable(CurrentEventSelectionSchema::TABLE)->execute();
rejects(fn() => $store->read(), 'dependency_unavailable', 'missing own selection schema fails without SQL exception chain');
rejects(fn() => $store->select(7, null), 'dependency_unavailable', 'write to missing schema fails explicitly without changing native tables');
verify($db->enableLogging && $db->enableProfiling, 'selection failed writes restore logging and profiling flags');

[$db, $identity, $store] = setup();
$identity->onRead = static function (): void { throw new RuntimeException('synthetic-private-session-text'); };
rejects(fn() => $store->read(), 'dependency_unavailable', 'identity provider arbitrary exception is sanitized');
$identity->onRead = static function (): void { throw new NativeAccessException('authentication_required', new RuntimeException('synthetic-private-session-text')); };
rejects(fn() => $store->select(7, null), 'authentication_required', 'identity provider typed error also strips untrusted previous chain');

$fake = new class implements CurrentEventSelectionWriter {
    public array $calls = [];
    public function select(int $spaceId, ?string $expectedRevision): CurrentEventContext { $this->calls[] = [$spaceId, $expectedRevision]; return new CurrentEventContext(42, $spaceId, 'memory-context', 'memory-policy'); }
};
$pure = new SelectCurrentEvent($fake); verify($pure->execute(7, null)->viewerId === 42 && $fake->calls === [[7, null]], 'selection use case is testable against a framework-free memory port');
foreach ([[0, null], [7, ''], [7, str_repeat('x', 65)]] as [$space, $revision]) {
    try { $pure->execute($space, $revision); verify(false, 'invalid use-case input'); }
    catch (InvalidArgumentException) { verify(count($fake->calls) === 1, 'pure use case rejects invalid input before calling the port'); }
}
verify(Yii::$app === null, 'selection suite never bootstraps HumHub or starts a real session');
echo json_encode(['status' => 'passed', 'scope' => 'Own SQL CAS selection plus native qualification on fresh SQLite memory tables and synthetic authenticated sessions; no HTTP action or production session/database.', 'checks' => count($checks), 'checks_passed' => $checks, 'native_session_writes' => 0, 'production_database_calls' => 0, 'network_calls' => 0, 'model_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
