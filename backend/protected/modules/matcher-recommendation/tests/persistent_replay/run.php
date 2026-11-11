<?php
declare(strict_types=1);
$backend = dirname(__DIR__, 5);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
require dirname(__DIR__) . '/support/autoload.php';
require dirname(__DIR__) . '/native_access/Fixtures.php';
$modules = dirname(__DIR__, 3);
spl_autoload_register(static function (string $class) use ($modules): void {
    foreach (['matcherProfile' => 'matcher-user-profile', 'matcherPrivacy' => 'matcher-profile-privacy'] as $ns => $dir) {
        $prefix = 'humhub' . chr(92) . 'modules' . chr(92) . $ns . chr(92);
        if (str_starts_with($class, $prefix)) {
            $path = $modules . '/' . $dir . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php';
            if (is_file($path)) { require_once $path; }
        }
    }
});
require_once $modules . '/matcher-user-profile/tests/discovery_batch/Fixtures.php';
require dirname(__DIR__) . '/live_recall/Fixtures.php';

use humhub\modules\matcherProfile\application\DiscoveryProfileBatchReader;
use humhub\modules\matcherProfile\adapters\persistence\SqlDiscoveryProfileBatchSource;
use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherPrivacy\application\DiscoveryBatchService;
use humhub\modules\matcherPrivacy\adapters\native\NativeDiscoveryRelations;
use humhub\modules\matcherRecommendation\adapters\composition\NativeRuleDiscoveryFactory;
use humhub\modules\matcherRecommendation\adapters\cursor\HmacDiscoveryCursorCodec;
use humhub\modules\matcherRecommendation\adapters\native\{SqlCurrentEventSelectionStore, ServerActorSessionSource, NativeCurrentEventAccess};
use humhub\modules\matcherRecommendation\adapters\profile\P1FieldCatalogAdapter;
use humhub\modules\matcherRecommendation\adapters\persistence\{PublishedPolicyStore, RecommendationStorageSchema, SqlDiscoveryBatchStore, SqlPolicyRevisionStore, StorageException};
use humhub\modules\matcherRecommendation\application\policy\PolicyLifecycle;
use humhub\modules\matcherRecommendation\contracts\QueryIntent;
use humhub\modules\matcherRecommendation\contracts\ports\Clock;
use humhub\modules\matcherRecommendation\domain\BatchReplayException;
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;
use humhub\modules\matcherRecommendation\tests\live_recall\Fixtures as F;
use humhub\modules\matcherRecommendation\tests\native_access\Fixtures as NF;
use humhub\modules\matcherRecommendation\tests\policy\MemoryEnvironment;

final class PersistentClock implements Clock
{
    public DateTimeImmutable $value;
    public function __construct() { $this->value = new DateTimeImmutable('2026-11-11T06:00:00.123456Z'); }
    public function now(): DateTimeImmutable { return $this->value; }
}
$checks = []; $observations = [];
function prCheck(bool $value, string $label): void { global $checks; if (!$value) { throw new RuntimeException('FAIL: ' . $label); } $checks[] = $label; }
function prReject(callable $call, string $label, string $reason = 'batch_invalidated'): void {
    try { $call(); } catch (BatchReplayException $error) { prCheck($error->reason === $reason && $error->getPrevious() === null, $label); return; }
    prCheck(false, $label);
}
function prQuery(): QueryIntent { return new QueryIntent('person', [['feature' => 'topics', 'operator' => 'similarity', 'value' => ['social'], 'strength' => 'soft', 'origin' => 'user_confirmed']]); }
function prPublish(PolicyLifecycle $lifecycle, string $id, array $parameters, ?string $active) {
    $draft = $lifecycle->createDraft(1, $id, $parameters);
    $draft = $lifecycle->validate(1, $id, $draft->revision);
    $draft = $lifecycle->replay(1, $id, $draft->revision);
    return $lifecycle->publish(1, $id, $draft->revision, $active);
}
function prSetup(int $size = 35): array {
    $db = F::database($size); RecommendationStorageSchema::install($db);
    $actor = new class implements ServerActorSessionSource { public function read(): array { return ['actor_id' => 1, 'session_hash' => hash('sha256', 'synthetic-persistence-session')]; } };
    $selection = new SqlCurrentEventSelectionStore($db, $actor, 'synthetic-access'); $selection->select(7, null);
    $events = new NativeCurrentEventAccess($db, $selection, 'synthetic-access');
    $catalog = new P1FieldCatalogAdapter(fn() => ['schema_version' => FieldCatalog::VERSION, 'fields' => FieldCatalog::definitions()]);
    $revisions = new SqlPolicyRevisionStore($db);
    // Management actor and replay suite are explicit synthetic authorities, not a public admin endpoint.
    $synthetic = new MemoryEnvironment();
    $lifecycle = new PolicyLifecycle($revisions, $catalog, $synthetic, new DeterministicRuleEvaluator(), $synthetic);
    $parameters = F::policy()->parameters; $parameters['selection']['max_results'] = 80;
    $policy = prPublish($lifecycle, 'synthetic-first-publication', $parameters, null);
    $clock = new PersistentClock(); $cursors = new HmacDiscoveryCursorCodec(str_repeat('synthetic-cursor-key-', 3));
    $profiles = new DiscoveryProfileBatchReader(new SqlDiscoveryProfileBatchSource($db));
    $privacy = new DiscoveryBatchService(new NativeDiscoveryRelations($db), [$profiles, 'read']);
    $factory = static fn() => new NativeRuleDiscoveryFactory($db, $events, $catalog, [$privacy, 'read'], new PublishedPolicyStore(new SqlPolicyRevisionStore($db), $events), new SqlDiscoveryBatchStore($db), $clock);
    return [$db, $factory, $clock, $cursors, $selection, $lifecycle, $policy];
}
function prIds(array $items): array { return array_map(static fn($item) => $item->candidate->targetId, $items); }

foreach ([0, 1, 35, 400] as $size) {
    [$db, $factory, $clock, $cursors] = prSetup($size);
    $result = $factory()->create(1, 7)->execute(1, prQuery(), 7);
    $saved = (new SqlDiscoveryBatchStore($db))->get($result->batchId);
    prCheck($saved !== null && $saved->targetIds === prIds($result->items) && $saved->policyFingerprint !== null, $size . ' generated batch persists through a fresh store instance');
    prCheck(F::clean($db), $size . ' recall releases terms intervals and generation metadata');
    $cursor = null; $ids = []; $pages = 0; $selects = []; $start = hrtime(true);
    do {
        $db->selects = [];
        $page = $factory()->createBatchReader(1, $cursors, 7)->execute(1, $result->batchId, $cursor, 24, 7);
        $selects[] = count($db->selects); $pages++;
        array_push($ids, ...prIds($page->items));
        prCheck($page->expiresAt == $saved->expiresAt && count($page->items) <= 24, $size . ' page keeps original deadline and configured page bound');
        $cursor = $page->nextCursor;
        if ($pages > 5) { throw new RuntimeException('Unexpected pagination loop'); }
    } while ($cursor !== null);
    prCheck($ids === $saved->targetIds && count($ids) === count(array_unique($ids)), $size . ' pages replay fixed batch without duplicates missing positions or backfill');
    prCheck(F::clean($db), $size . ' replay never rebuilds recall index');
    prCheck((int)$db->createCommand('SELECT COUNT(*) FROM matcher_recommendation_discovery_batch')->queryScalar() === 1, $size . ' replay does not create or renew batches');
    $payload = $db->createCommand('SELECT payload_json FROM matcher_recommendation_discovery_batch')->queryScalar();
    prCheck(!str_contains($payload, '"features"') && !str_contains($payload, '"interest"') && !str_contains($payload, '"social"') && !str_contains($payload, '"reasons"'), $size . ' stored batch contains no profile features query terms or reason text');
    $observations[(string)$size] = ['activity_candidates' => $size, 'fixed_batch_count' => count($ids), 'pages' => $pages, 'selects_per_page_including_factory' => $selects, 'replay_elapsed_ms' => round((hrtime(true) - $start) / 1e6, 3)];
}

[$db, $factory, $clock, $cursors] = prSetup();
$result = $factory()->create(1)->execute(1, prQuery());
$first = $factory()->createBatchReader(1, $cursors)->execute(1, $result->batchId);
$second = $factory()->createBatchReader(1, $cursors)->execute(1, $result->batchId, $first->nextCursor);
$repeat = $factory()->createBatchReader(1, $cursors)->execute(1, $result->batchId, $first->nextCursor);
prCheck(prIds($second->items) === prIds($repeat->items) && $repeat->nextCursor === null, 'continuation is repeatable and exhaustion does not open a new batch');
prReject(fn() => $factory()->createBatchReader(1, $cursors)->execute(1, $result->batchId, $first->nextCursor . 'x'), 'tampered real stored batch cursor is rejected', 'cursor_invalid');
$clock->value = $result->batch->expiresAt;
prReject(fn() => $factory()->createBatchReader(1, $cursors)->execute(1, $result->batchId), 'absolute batch expiry is enforced across store and factory instances', 'batch_expired');

foreach (['visibility', 'value', 'identity', 'removed', 'blocked', 'pending', 'deleted'] as $mutation) {
    [$db, $factory, $clock, $cursors] = prSetup();
    $result = $factory()->create(1)->execute(1, prQuery());
    $first = $factory()->createBatchReader(1, $cursors)->execute(1, $result->batchId, null, 1);
    $target = (int)$result->batch->targetIds[array_key_last($result->batch->targetIds)];
    if ($mutation === 'visibility') { $db->createCommand()->update('matcher_profile_attribute', ['visibility' => 'private'], ['state_id' => $target . '-global', 'field_key' => 'interest'])->execute(); }
    elseif ($mutation === 'value') { F::topic($db, $target, 'changed-topic'); }
    elseif ($mutation === 'identity') { $db->createCommand()->update('matcher_profile_state', ['identity_version' => 99], ['user_id' => $target, 'scope_key' => 'global'])->execute(); }
    elseif ($mutation === 'removed') { $db->createCommand()->delete('space_membership', ['user_id' => $target, 'space_id' => 7])->execute(); }
    elseif ($mutation === 'blocked') { NF::block($db, 10000 + $target, 1); }
    elseif ($mutation === 'pending') { NF::friend($db, 1, $target); }
    else { $db->createCommand()->delete('matcher_profile_state', ['user_id' => $target])->execute(); }
    prReject(fn() => $factory()->createBatchReader(1, $cursors)->execute(1, $result->batchId, null, 1), 'page-external actual source change invalidates entire batch: ' . $mutation);
    prCheck(F::clean($db), 'invalid replay never falls back to recall: ' . $mutation);
}

[$db, $factory, $clock, $cursors, $selection, $lifecycle, $original] = prSetup(1);
$result = $factory()->create(1)->execute(1, prQuery());
$parameters = $original->parameters; $parameters['minimum_match_score'] = .4;
$changed = prPublish($lifecycle, 'synthetic-new-publication', $parameters, $original->version);
prReject(fn() => $factory()->createBatchReader(1, $cursors)->execute(1, $result->batchId), 'real policy publication invalidates old batch');
$restored = $lifecycle->rollback(1, $original->version, 'synthetic-restoration', $changed->version);
prCheck($restored->parameters === $original->parameters && $restored->version !== $original->version, 'SQL rollback restores rules under a fresh publication identity');
prReject(fn() => $factory()->createBatchReader(1, $cursors)->execute(1, $result->batchId), 'restored rule contents never revive old batch');
$newResult = $factory()->create(1)->execute(1, prQuery());
prCheck(count($factory()->createBatchReader(1, $cursors)->execute(1, $newResult->batchId)->items) === 1, 'fresh batch works under restored publication');
$selected = $selection->read(); $selection->select(8, $selected['selection_revision']);
prReject(fn() => $factory()->createBatchReader(1, $cursors)->execute(1, $newResult->batchId), 'different server-selected Space cannot replay saved batch');
$selected = $selection->read(); $selection->select(7, $selected['selection_revision']);
prReject(fn() => $factory()->createBatchReader(1, $cursors)->execute(1, $newResult->batchId), 'switching back does not revive previous selection context');

// A signing capability passed through a failed composition must not expose its private key in trace args.
$oldTraceSetting = ini_get('zend.exception_ignore_args'); ini_set('zend.exception_ignore_args', '0');
try {
    $redacted = false;
    try { $factory()->createBatchReader(999, $cursors); }
    catch (Throwable $error) {
        foreach ($error->getTrace() as $frame) {
            if (($frame['function'] ?? null) === 'createBatchReader') { $redacted = ($frame['args'][1] ?? null) instanceof SensitiveParameterValue; }
        }
    }
    prCheck($redacted, 'failed factory composition redacts signer capability in exception trace');
} finally { ini_set('zend.exception_ignore_args', $oldTraceSetting); }
ob_start(); var_dump($cursors); $diagnostic = ob_get_clean();
prCheck(str_contains($diagnostic, '[REDACTED]') && !str_contains($diagnostic, 'synthetic-cursor-key-'), 'debug representation contains no signing material');
try { serialize($cursors); prCheck(false, 'signing capability must not serialize'); }
catch (LogicException) { prCheck(true, 'signing capability cannot be persisted through serialization'); }
try { $cursors->__unserialize([]); prCheck(false, 'signing capability must not be restored'); }
catch (LogicException) { prCheck(true, 'signing capability rejects unserialization'); }

// Actual migration methods only on a new synthetic database, including an unrelated source-data sentinel.
[$db] = prSetup(1); $nativeUsers = (int)$db->createCommand('SELECT COUNT(*) FROM user')->queryScalar();
$states = (int)$db->createCommand('SELECT COUNT(*) FROM matcher_profile_state')->queryScalar();
$classes = ['m261111_000001_candidate_index', 'm261111_000002_current_event_selection', 'm261111_000003_policy_batch_storage', 'm261111_000004_index_generation_lifecycle'];
$migrations = [];
foreach ($classes as $class) { require_once dirname(__DIR__, 2) . '/migrations/' . $class . '.php'; $migrations[] = new $class(['db' => $db]); }
foreach (array_reverse($migrations) as $migration) { $migration->down(); }
prCheck((int)$db->createCommand('SELECT COUNT(*) FROM user')->queryScalar() === $nativeUsers && (int)$db->createCommand('SELECT COUNT(*) FROM matcher_profile_state')->queryScalar() === $states, 'all recommendation migrations reverse without deleting native users or P1 state');
foreach ($migrations as $migration) { $migration->up(); }
prCheck(F::clean($db) && (new SqlPolicyRevisionStore($db))->active() === null, 'all migrations reinstall empty owned schemas without default policy');

echo json_encode(['status' => 'passed', 'passed' => count($checks), 'scope' => 'Fresh synthetic SQLite: actual SQL policy lifecycle, SQL selection, P1/P8, rule discovery, SQL batch store, fresh factory replay and HMAC cursor. Actor/session, clock, management access and synthetic replay suite are explicit test fixtures. No HTTP, production configuration, existing database or AI.', 'observations' => $observations, 'checks' => $checks], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
