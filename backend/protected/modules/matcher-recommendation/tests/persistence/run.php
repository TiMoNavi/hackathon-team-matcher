<?php
declare(strict_types=1);
// Isolated synthetic SQLite :memory: only. No app bootstrap, existing configuration, network or MySQL.
$backend = dirname(__DIR__, 5);
require $backend . '/protected/vendor/autoload.php'; require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
require dirname(__DIR__) . '/support/autoload.php';
require __DIR__ . '/Fixtures.php';
use humhub\modules\matcherRecommendation\adapters\persistence\{PublishedPolicyStore, RecommendationStorageSchema as S, SqlDiscoveryBatchStore, SqlPolicyRevisionStore, StorageException, TypedJsonCodec};
use humhub\modules\matcherRecommendation\application\policy\PolicyLifecycle;
use humhub\modules\matcherRecommendation\domain\{DiscoveryBatch, RulePolicy};
use humhub\modules\matcherRecommendation\domain\config\{Fingerprint, PolicyDraft};
use humhub\modules\matcherRecommendation\tests\persistence\{Fixtures as F, MutableEvents};
use humhub\modules\matcherRecommendation\tests\policy\{Fixtures as PF, MemoryEnvironment};
use yii\db\Query;

$checks = [];
function psVerify(bool $ok, string $label): void { global $checks; if (!$ok) { throw new RuntimeException('FAIL: ' . $label); } $checks[] = $label; }
function psReject(callable $call, string $label, ?string $reason = null): void {
    try { $call(); } catch (Throwable $error) {
        psVerify($reason === null || ($error instanceof StorageException && $error->reason === $reason && $error->getPrevious() === null), $label); return;
    }
    psVerify(false, $label);
}
function psLifecycle(SqlPolicyRevisionStore $store, ?MemoryEnvironment $env = null): PolicyLifecycle {
    $env ??= new MemoryEnvironment(); return new PolicyLifecycle($store, $env, $env, $env, $env);
}
function psReady(PolicyLifecycle $service, string $id, ?array $params = null): PolicyDraft {
    $draft = $service->createDraft(1, $id, $params ?? PF::parameters());
    $draft = $service->validate(1, $id, $draft->revision);
    return $service->replay(1, $id, $draft->revision);
}
function psRows($db, string $table): array { return (new Query())->from($table)->all($db); }

$db = F::database(); $store = new SqlPolicyRevisionStore($db); $other = new SqlPolicyRevisionStore($db); $codec = new TypedJsonCodec();
psVerify($store->active() === null && $store->draft('absent') === null && $store->published('absent') === null, 'fresh schema contains no invented draft or active policy');
psVerify(count(psRows($db, S::ACTIVE_TABLE)) === 1 && psRows($db, S::PUBLISHED_TABLE) === [], 'installation seeds only the empty active slot');
$events = new MutableEvents(); $published = new PublishedPolicyStore($store, $events);
psReject(fn() => $published->current(PF::context()), 'no explicit publication fails rather than falling back', 'policy_unavailable');

$draft = new PolicyDraft('synthetic-draft', 1, PF::parameters());
$store->save($draft, null); $loaded = $other->draft($draft->id);
psVerify($loaded !== $draft && $loaded?->parameters === $draft->parameters && $loaded?->revision === 1, 'draft survives another store instance as a separate readonly DTO');
psReject(function () use ($loaded): void { $loaded->revision = 99; }, 'loaded revision remains readonly');
psReject(function () use ($loaded): void { $loaded->parameters['minimum_match_score'] = .99; }, 'loaded parameters cannot mutate a readonly snapshot');
psReject(fn() => $other->save($draft, null), 'duplicate absent-draft CAS fails', 'cas_conflict');
$changed = PF::parameters(); $changed['minimum_match_score'] = .4;
$other->save(new PolicyDraft($draft->id, 2, $changed), 1);
psReject(fn() => $store->save(new PolicyDraft($draft->id, 2, PF::parameters()), 1), 'stale writer cannot overwrite a newer draft revision', 'cas_conflict');
psVerify($store->draft($draft->id)?->parameters === $changed, 'successful competing draft edit remains intact');
psReject(fn() => $store->save(new PolicyDraft($draft->id, 4, PF::parameters()), 2), 'revision must increase by exactly one', 'cas_conflict');
$invalidDraft = new PolicyDraft('synthetic-unvalidated', 1, ['unvalidated_configuration' => true]); $store->save($invalidDraft, null);
psVerify($other->draft($invalidDraft->id)?->parameters === $invalidDraft->parameters, 'draft storage preserves unvalidated configuration for lifecycle validation');

$service = psLifecycle($store); $ready = psReady($service, 'synthetic-publish-a');
$roundTrip = $other->draft($ready->id);
psVerify($roundTrip !== $ready && $roundTrip?->replay !== $ready->replay && Fingerprint::of($roundTrip) === Fingerprint::of($ready), 'validation and actual replay report round trip with exact typed data');
psVerify(is_float($roundTrip?->replay?->assertions[0]['score']) && $roundTrip?->replay?->assertions[0]['score'] === 1.0, 'typed JSON preserves integral floating scores instead of coercing them to integers');
$reportJson = json_decode($codec->encodeDraft($ready), true, 64, JSON_THROW_ON_ERROR);
foreach (['score', 'passed', 'draft_revision', 'policy_digest'] as $field) {
    $invalid = $reportJson;
    if ($field === 'score') { $invalid['value']['replay']['assertions'][0]['score'] = '1.0'; }
    elseif ($field === 'passed') { $invalid['value']['replay']['assertions'][0]['passed'] = 'true'; }
    elseif ($field === 'draft_revision') { $invalid['value']['replay'][$field] = $ready->revision + 1; }
    else { $invalid['value']['replay'][$field] = str_repeat('f', 64); }
    $bad = json_encode($invalid, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_SLASHES);
    psReject(fn() => $codec->decodeDraft($bad), 'typed draft rejects malformed replay ' . $field, 'corrupt_storage');
}
$policyA = $service->publish(1, $ready->id, $ready->revision, null);
psVerify($other->active()?->version === $policyA->version && $other->published($policyA->version)?->parameters === $policyA->parameters, 'publication atomically exposes immutable policy across instances');
$events = new MutableEvents(); $published = new PublishedPolicyStore($other, $events);
psVerify($published->current(PF::context())->version === $policyA->version && $events->checks === 2, 'current policy adapter revalidates activity before and after authoritative read');
$events->failAt = 4; psReject(fn() => $published->current(PF::context()), 'activity revoked after policy read does not return the policy');
psReject(fn() => $service->publish(1, $ready->id, $ready->revision, $policyA->version), 'same published version cannot be republished even with identical content', 'cas_conflict');

$readyB = psReady($service, 'synthetic-publish-b', $changed);
psReject(fn() => $service->publish(1, $readyB->id, $readyB->revision, null), 'stale active-pointer CAS cannot replace existing publication', 'cas_conflict');
$policyB = $service->publish(1, $readyB->id, $readyB->revision, $policyA->version);
psReject(fn() => $service->publish(1, $ready->id, $ready->revision, $policyB->version), 'historical version cannot be reactivated after an intervening publication', 'cas_conflict');
psVerify($store->active()?->version === $policyB->version && count(psRows($db, S::PUBLISHED_TABLE)) === 2, 'rejected reactivation rolls pointer and history changes back');
$rolled = $service->rollback(1, $policyA->version, 'synthetic-rollback-new', $policyB->version);
psVerify($rolled->version !== $policyA->version && $rolled->version !== $policyB->version && $rolled->parameters === $policyA->parameters, 'rollback reruns lifecycle and publishes restored parameters under a new version');
psVerify($store->published($policyA->version)?->version === $policyA->version && count(psRows($db, S::PUBLISHED_TABLE)) === 3, 'rollback preserves every immutable publication record');
$unfinished = $service->createDraft(1, 'synthetic-unfinished', PF::parameters());
psReject(fn() => $store->publish($unfinished->id, 1, $rolled->version, $unfinished->policy()), 'direct storage publication also requires bound successful replay metadata', 'invalid_data');

$db = F::database(); $store = new SqlPolicyRevisionStore($db); $service = psLifecycle($store); $ready = psReady($service, 'synthetic-atomic');
$oldLock = psRows($db, S::DRAFT_TABLE)[0]['lock_version'];
$db->getMasterPdo()->exec("CREATE TRIGGER synthetic_fail_history BEFORE INSERT ON matcher_recommendation_policy_published BEGIN SELECT RAISE(ABORT, 'SYNTHETIC_PRIVATE_DATABASE_TEXT'); END");
psReject(fn() => $service->publish(1, $ready->id, $ready->revision, null), 'failure after active pointer update is safe and explicit');
psVerify($store->active() === null && psRows($db, S::PUBLISHED_TABLE) === [] && psRows($db, S::DRAFT_TABLE)[0]['lock_version'] === $oldLock, 'failed publication rolls pointer history and draft guard back together');
$db->getMasterPdo()->exec('DROP TRIGGER synthetic_fail_history');
psReject(fn() => $store->transaction(function () use ($store): void { $store->save(new PolicyDraft('synthetic-rolled-back', 1, PF::parameters()), null); throw new RuntimeException('SYNTHETIC_PRIVATE_CALLBACK_TEXT'); }), 'transaction failure is redacted', 'transaction_failed');
psVerify($store->draft('synthetic-rolled-back') === null, 'callback failure rolls all successful earlier writes back');
$store->transaction(function () use ($store): void {
    $store->save(new PolicyDraft('synthetic-outer', 1, PF::parameters()), null);
    try { $store->transaction(function () use ($store): void { $store->save(new PolicyDraft('synthetic-inner', 1, PF::parameters()), null); throw new RuntimeException('Synthetic nested abort.'); }); } catch (StorageException) {}
});
psVerify($store->draft('synthetic-outer') !== null && $store->draft('synthetic-inner') === null, 'owned nested savepoint failure can be caught without committing inner writes');
$store->transaction(function () use ($store, $ready): void {
    try { $store->publish($ready->id, $ready->revision, 'synthetic-stale-pointer', $ready->policy()); } catch (StorageException) {}
    $store->save(new PolicyDraft('synthetic-after-failed-publish', 1, PF::parameters()), null);
});
psVerify($store->active() === null && $store->draft('synthetic-after-failed-publish') !== null, 'caught publication failure leaves no half-published state inside outer transaction');
$tx = $db->beginTransaction();
foreach ([fn() => $store->active(), fn() => $store->save(new PolicyDraft('external', 1, PF::parameters()), null), fn() => $store->transaction(fn() => null)] as $call) { psReject($call, 'policy store rejects externally owned transaction', 'transaction_unsupported'); }
psVerify($tx->isActive, 'store never commits or rolls back external owner transaction'); $tx->rollBack();

$db = F::database(); $batches = new SqlDiscoveryBatchStore($db); $otherBatches = new SqlDiscoveryBatchStore($db);
foreach ([0, 1, 30, 200] as $size) {
    $batch = F::batch($size); $id = $batches->put($batch); $read = $otherBatches->get($id);
    psVerify((bool)preg_match('/^[a-f0-9]{64}$/D', $id) && $read !== $batch && Fingerprint::of($read) === Fingerprint::of($batch), $size . '-candidate batch persists across store instances with exact version bindings');
    psVerify($read?->createdAt->format('Y-m-d\TH:i:s.uP e') === $batch->createdAt->format('Y-m-d\TH:i:s.uP e') && $read?->expiresAt->format('U.u') === $batch->expiresAt->format('U.u'), $size . '-candidate timestamps preserve microseconds and timezone identity');
    psVerify($read?->projectionFingerprints === $batch->projectionFingerprints && $read?->relationshipVersions === $batch->relationshipVersions, $size . '-candidate numeric-key version maps keep their PHP types and order');
}
psVerify($batches->get(str_repeat('a', 64)) === null, 'absent opaque batch ID returns null without inventing a batch');
psReject(fn() => $batches->get('../arbitrary-id'), 'malformed batch ID is not interpreted as a path or SQL', 'invalid_data');
$legacy = F::batch(2, true);
psVerify($codec->decodeBatch($codec->encodeBatch($legacy))->policyFingerprint === null, 'legacy null policy fingerprint remains explicitly inspectable');
psReject(fn() => $batches->put($legacy), 'new persisted batch requires exact policy fingerprint', 'invalid_data');
$created = F::batch()->createdAt;
psReject(fn() => $batches->put(F::batch(2, false, $created, $created->add(new DateInterval('PT15M'))->modify('+1 microsecond'))), 'fifteen minutes plus one microsecond exceeds batch lifetime', 'invalid_data');
psReject(fn() => F::batch(201), 'more than 200 batch IDs are rejected at DTO boundary');
$dst = new DateTimeImmutable('2026-11-01T01:55:00.123456-04:00');
psVerify($codec->decodeBatch($codec->encodeBatch(F::batch(1, false, $dst, $dst->add(new DateInterval('PT15M')))))->createdAt->format('U.u') === $dst->format('U.u'), 'lifetime compares elapsed instants without losing timezone offsets');
$json = $codec->encodeBatch(F::batch()); $raw = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
psVerify(array_keys($raw['value']) === ['context', 'query_hash', 'policy_version', 'policy_fingerprint', 'target_ids', 'projection_fingerprints', 'relationship_versions', 'created_at', 'expires_at'], 'batch envelope contains only IDs version bindings context and times');
psVerify(!str_contains($json, 'profile_payload') && !str_contains($json, 'query_text') && !str_contains($json, 'summary'), 'batch payload never adds profile query-text or model-summary fields');

foreach ([
    'unexpected profile payload' => function (array &$x): void { $x['value']['profile_payload'] = 'SYNTHETIC_PRIVATE_PROFILE'; },
    'unknown schema' => function (array &$x): void { $x['schema_version'] = 2; },
    'wrong root kind' => function (array &$x): void { $x['kind'] = 'rule_policy'; },
    'string actor ID' => function (array &$x): void { $x['value']['context']['viewer_id'] = '1'; },
    'numeric target ID' => function (array &$x): void { $x['value']['target_ids'][0] = 2; },
    'missing version map entry' => function (array &$x): void { unset($x['value']['projection_fingerprints'][2]); },
    'additional version subject' => function (array &$x): void { $x['value']['relationship_versions'][99] = 'foreign'; },
    'invalid calendar' => function (array &$x): void { $x['value']['created_at']['iso'] = '2026-02-30T10:11:12.123456+08:00'; },
    'timezone mismatch' => function (array &$x): void { $x['value']['created_at']['timezone'] = 'UTC'; },
    'wrong policy fingerprint' => function (array &$x): void { $x['value']['policy_fingerprint'] = 'not-a-hash'; },
] as $name => $mutate) {
    $copy = $raw; $mutate($copy); $bad = json_encode($copy, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_SLASHES);
    psReject(fn() => $codec->decodeBatch($bad), 'typed batch decoder rejects ' . $name, 'corrupt_storage');
}
foreach (['O:8:"stdClass":0:{}', '{', str_repeat('x', TypedJsonCodec::MAX_BYTES + 1), str_replace('"schema_version":1,', '"schema_version":1,"schema_version":1,', $json)] as $bad) {
    psReject(fn() => $codec->decodeBatch($bad), 'malformed oversized serialized or duplicate-key payload fails closed', 'corrupt_storage');
}

$db = F::database(); $batches = new SqlDiscoveryBatchStore($db); $id = $batches->put(F::batch());
$db->createCommand()->update(S::BATCH_TABLE, ['payload_json' => '{"SYNTHETIC_PRIVATE_TAMPER":true}'], ['id' => $id])->execute();
psReject(fn() => $batches->get($id), 'batch checksum mismatch is an explicit storage error', 'corrupt_storage');
$bad = json_encode(['schema_version' => 1, 'kind' => 'discovery_batch', 'value' => ['profile_payload' => 'SYNTHETIC_PRIVATE_TAMPER']], JSON_THROW_ON_ERROR);
$db->createCommand()->update(S::BATCH_TABLE, ['payload_json' => $bad, 'payload_digest' => hash('sha256', $bad)], ['id' => $id])->execute();
psReject(fn() => $batches->get($id), 'valid checksum does not bypass typed payload shape validation', 'corrupt_storage');
$id = $batches->put(F::batch()); $db->createCommand()->update(S::BATCH_TABLE, ['expires_at' => '2000-01-01 00:00:00.000000'], ['id' => $id])->execute();
psReject(fn() => $batches->get($id), 'batch expiry metadata must agree with immutable payload', 'corrupt_storage');

$db = F::database(); $store = new SqlPolicyRevisionStore($db); $store->save(new PolicyDraft('synthetic-corrupt-draft', 1, PF::parameters()), null);
$db->createCommand()->update(S::DRAFT_TABLE, ['revision' => 2], ['id' => 'synthetic-corrupt-draft'])->execute();
psReject(fn() => $store->draft('synthetic-corrupt-draft'), 'draft row revision must match typed payload', 'corrupt_storage');
psReject(fn() => $store->save(new PolicyDraft('synthetic-corrupt-draft', 3, PF::parameters()), 2), 'CAS edit does not silently replace a corrupt existing draft head', 'corrupt_storage');
$db->createCommand()->update(S::ACTIVE_TABLE, ['active_version' => 'synthetic-missing-history'], ['slot' => 1])->execute();
psReject(fn() => $store->active(), 'dangling active pointer is corruption rather than missing-policy success', 'corrupt_storage');
$db->createCommand()->delete(S::ACTIVE_TABLE, ['slot' => 1])->execute();
psReject(fn() => $store->active(), 'missing singleton pointer is corruption rather than a fabricated default', 'corrupt_storage');

$db = F::database(); $store = new SqlPolicyRevisionStore($db); $batches = new SqlDiscoveryBatchStore($db);
$tx = $db->beginTransaction();
psReject(fn() => $batches->put(F::batch()), 'batch write does not adopt an external transaction', 'transaction_unsupported');
psReject(fn() => $batches->get(str_repeat('a', 64)), 'batch read does not trust an external transaction snapshot', 'transaction_unsupported'); $tx->rollBack();
$db->enableLogging = true; $db->enableProfiling = true; $db->observations = [];
$service = psLifecycle($store); $draft = psReady($service, 'synthetic-safe-io'); $service->publish(1, $draft->id, $draft->revision, null); $store->active(); $store->published($draft->policy()->version);
$id = $batches->put(F::batch()); $batches->get($id);
psVerify($db->observations !== [] && count(array_filter($db->observations, fn($x) => $x['master'] && $x['cache_disabled'] && !$x['logging'] && !$x['profiling'])) === count($db->observations), 'all recommendation storage I/O uses master with cache logging and profiling disabled');
psVerify($db->enableLogging && $db->enableProfiling, 'storage restores caller logging and profiling configuration');

$db->getMasterPdo()->exec("CREATE TRIGGER synthetic_fail_batch BEFORE INSERT ON matcher_recommendation_discovery_batch BEGIN SELECT RAISE(ABORT, 'SYNTHETIC_PRIVATE_BATCH_SQL'); END");
$before = count(psRows($db, S::BATCH_TABLE));
try { $batches->put(F::batch()); psVerify(false, 'trigger must fail'); }
catch (StorageException $error) { psVerify(!str_contains((string)$error, 'SYNTHETIC_PRIVATE_BATCH_SQL') && $error->getPrevious() === null, 'batch SQL error remains redacted at the public boundary'); }
psVerify(count(psRows($db, S::BATCH_TABLE)) === $before && $db->enableLogging && $db->enableProfiling, 'failed atomic batch insert adds no row and restores logging flags');

$oldIgnore = ini_set('zend.exception_ignore_args', '0');
try {
    $store->transaction(function (): void { throw new RuntimeException('SYNTHETIC_PRIVATE_CALLBACK_TRACE'); });
} catch (StorageException $error) {
    psVerify(!str_contains((string)$error, 'SYNTHETIC_PRIVATE_CALLBACK_TRACE') && $error->getPrevious() === null, 'callback failure leaves no original exception message or previous chain');
    psVerify(!str_contains(json_encode($error->getTrace(), JSON_PARTIAL_OUTPUT_ON_ERROR), 'SYNTHETIC_PRIVATE_CALLBACK_TRACE'), 'callback failure trace does not expose captured upstream exception');
} finally { if ($oldIgnore !== false) { ini_set('zend.exception_ignore_args', $oldIgnore); } }

$oldIgnore = ini_set('zend.exception_ignore_args', '0');
try { $codec->decodeBatch('{SYNTHETIC_PRIVATE_CODEC_JSON'); }
catch (StorageException $error) {
    psVerify(!str_contains((string)$error, 'SYNTHETIC_PRIVATE_CODEC_JSON') && !str_contains(json_encode($error->getTrace(), JSON_PARTIAL_OUTPUT_ON_ERROR), 'SYNTHETIC_PRIVATE_CODEC_JSON'), 'direct codec failure also redacts raw JSON from trace serialization');
    $frames = array_values(array_filter($error->getTrace(), fn($frame) => ($frame['function'] ?? null) === 'decodeBatch'));
    psVerify($frames !== [] && ($frames[0]['args'][0] ?? null) instanceof SensitiveParameterValue, 'codec public payload parameter is marked sensitive when trace arguments are enabled');
} finally { if ($oldIgnore !== false) { ini_set('zend.exception_ignore_args', $oldIgnore); } }

$db = F::database(); $store = new SqlPolicyRevisionStore($db); $batches = new SqlDiscoveryBatchStore($db);
$db->createCommand()->dropTable(S::DRAFT_TABLE)->execute();
psReject(fn() => $store->draft('synthetic-absent-dependency'), 'missing policy table is dependency failure rather than missing draft', 'dependency_unavailable');
$db->createCommand()->dropTable(S::BATCH_TABLE)->execute();
psReject(fn() => $batches->get(str_repeat('a', 64)), 'missing batch table is dependency failure rather than empty result', 'dependency_unavailable');

$db = F::database(); S::remove($db);
psVerify($db->createCommand('SELECT value FROM native_sentinel WHERE id=1')->queryScalar() === 'synthetic-original-unchanged', 'schema rollback preserves the synthetic original-module sentinel');
$remaining = $db->createCommand("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'matcher_recommendation_%'")->queryColumn();
psVerify($remaining === [], 'schema rollback removes only its own four storage tables');
S::install($db); psVerify((new SqlPolicyRevisionStore($db))->active() === null, 'schema can be installed again without inventing a production policy');
require dirname(__DIR__, 2) . '/migrations/m261111_000003_policy_batch_storage.php';
$migration = new m261111_000003_policy_batch_storage(['db' => $db]); $migration->down(); $migration->up();
psVerify((new SqlPolicyRevisionStore($db))->active() === null && $db->createCommand('SELECT value FROM native_sentinel WHERE id=1')->queryScalar() === 'synthetic-original-unchanged', 'actual migration class up/down is reversible on the new SQLite database and preserves original tables');

echo json_encode(['status' => 'passed', 'scope' => 'Recommendation-owned SQL storage and policy lifecycle on synthetic SQLite memory; no real DB, MySQL, HTTP, external authorization locking or production policy.', 'passed' => count($checks), 'checks' => $checks], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
