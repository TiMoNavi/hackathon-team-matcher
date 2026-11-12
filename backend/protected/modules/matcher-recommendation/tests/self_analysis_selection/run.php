<?php
declare(strict_types=1);
$backend = dirname(__DIR__, 5);
require $backend . '/protected/vendor/autoload.php'; require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
require dirname(__DIR__) . '/support/autoload.php';
$modules = dirname(__DIR__, 3);
spl_autoload_register(static function (string $class) use ($modules): void {
    foreach (['matcherProfile' => 'matcher-user-profile', 'matcherPrivacy' => 'matcher-profile-privacy'] as $ns => $directory) {
        $prefix = 'humhub\\modules\\' . $ns . '\\';
        if (str_starts_with($class, $prefix)) { $file = $modules . '/' . $directory . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php'; if (is_file($file)) { require_once $file; } }
    }
});
require_once $modules . '/matcher-user-profile/tests/discovery_batch/Fixtures.php';
require_once __DIR__ . '/Fixtures.php';

use humhub\modules\matcherProfile\domain\{DiscoveryProfileBatchRequest, ProfileException};
use humhub\modules\matcherProfile\tests\discovery_batch\Fixtures as P1;
use humhub\modules\matcherPrivacy\application\DiscoveryBatchService;
use humhub\modules\matcherPrivacy\domain\ports\DiscoveryRelations;
use humhub\modules\matcherRecommendation\adapters\analysis\{SelfAnalysisSelectionSchema, SqlSelfSelectionStore};
use humhub\modules\matcherRecommendation\adapters\profile\P1CooperationProjectionReader;
use humhub\modules\matcherRecommendation\application\analysis\AnalyzeCooperation;
use humhub\modules\matcherRecommendation\contracts\{CandidateRequest, CurrentEventContext};
use humhub\modules\matcherRecommendation\contracts\analysis\{CooperationAnalysisException, CooperationAnalysisRequest, SelectedSelfAttributes};
use humhub\modules\matcherRecommendation\domain\config\{Fingerprint, PolicyValidator};
use humhub\modules\matcherRecommendation\tests\self_analysis_selection\{Fixture as F, Identity};

set_error_handler(static function (int $severity, string $message, string $file, int $line): never { throw new ErrorException($message, 0, $severity, $file, $line); });
$passed = []; $failed = [];
function saCheck(bool $condition): void { if (!$condition) { throw new RuntimeException('Assertion failed.'); } }
function saReject(callable $run, ?string $reason = null): void {
    try { $run(); } catch (Throwable $e) {
        if ($reason !== null && !($e instanceof CooperationAnalysisException && $e->reason === $reason) && !($e instanceof ProfileException && $e->errorCode === $reason)) { throw $e; }
        saCheck($e->getPrevious() === null); return;
    } throw new RuntimeException('Expected rejection.');
}
function saTest(string $label, callable $run): void { global $passed, $failed; try { $run(); $passed[] = $label; } catch (Throwable $e) { $failed[] = ['test' => $label, 'error' => get_class($e) . ': ' . $e->getMessage()]; } }

saTest('P1 explicit IDs restrict SQL values by owner, current scope, confirmation and visibility', function (): void {
    $f = new F(); $result = $f->p1->read(1, 7, ['skill', 'event_seeking'], ['1-space:7-event_seeking']);
    saCheck($result['profiles'][1]['scopes']['global']['attributes'] === [] && count($result['profiles'][1]['scopes']['space:7']['attributes']) === 1);
    $queries = $f->attributeQueries(); saCheck(count($queries) === 1);
    foreach (['attribute_id', 'user_id', 'scope_key', 'confirmation', 'visibility'] as $part) { saCheck(str_contains($queries[0]['sql'], $part)); }
});
saTest('P1 [] reads metadata without any attribute-value query', function (): void {
    $f = new F(); $r = $f->p1->read(1, 7, ['skill'], []); saCheck($f->attributeQueries() === [] && $r['profiles'][1]['scopes']['global']['revision'] === 3);
});
foreach (['2-global-skill', 'missing', '1-global-headline'] as $id) {
    saTest('P1 selection cannot escape explicit owner or approved source ' . $id, function () use ($id): void { $f = new F(); saReject(fn() => $f->p1->read(1, 7, ['skill'], [$id]), 'PROFILE_SELECTION_UNAVAILABLE'); });
}
foreach (['private', 'friends', 'pending'] as $state) {
    saTest('P1 selection excludes ' . $state . ' even for the owner', function () use ($state): void { $f = new F(); $change = $state === 'pending' ? ['confirmation' => $state] : ['visibility' => $state]; $f->db->createCommand()->update('matcher_profile_attribute', $change, ['attribute_id' => '1-global-skill'])->execute(); saReject(fn() => $f->p1->read(1, 7, ['skill'], ['1-global-skill']), 'PROFILE_SELECTION_UNAVAILABLE'); });
}
saTest('P1 owner and membership checks remain separate from activity DTO construction', function (): void { $f = new F(); $f->access->memberships[7] = [2]; saReject(fn() => $f->p1->read(1, 7, ['skill'], ['1-global-skill']), 'PROFILE_ACCESS_DENIED'); saCheck($f->attributeQueries() === []); });
saTest('P1 late membership revocation denies selected output', function (): void { $f = new F(); $f->db->onSelect = function () use ($f): void { $f->access->memberships[7] = [2]; }; saReject(fn() => $f->p1->read(1, 7, ['skill'], ['1-global-skill']), 'PROFILE_ACCESS_DENIED'); });
foreach ([['same', 'same'], [17], [''], [str_repeat('a', 129)], ['value' => 'x']] as $ids) {
    saTest('P1 selected ID contract rejects malformed list ' . count($passed), fn() => saReject(fn() => new DiscoveryProfileBatchRequest([1], 7, ['skill'], $ids), 'INVALID_PROFILE_BATCH'));
}
saTest('Initial GET exposes approved optional facts with version zero and no stored selection', function (): void {
    $f = new F(); $r = $f->manager->read(1, 7); saCheck($r['selection_version'] === 0 && $r['selection_current'] && $r['selected_attribute_ids'] === [] && count($r['options']) === 4 && $f->row() === false);
    $json = json_encode($r); saCheck(!str_contains($json, 'private-title') && !str_contains($json, 'Synthetic headline') && !str_contains($json, 'native_binding'));
});
saTest('A two-field demand appears as two separate facts on one actual selectable attribute', function (): void { $f = new F(); $r = $f->manager->read(1, 7); $o = array_values(array_filter($r['options'], fn($o) => $o['source_key'] === 'event_seeking'))[0]; saCheck(count($o['facts']) === 2 && $o['attribute_id'] === '1-space:7-event_seeking'); });
saTest('An unsaved implicit empty selection is unavailable to analysis', function (): void { $f = new F(); saReject(fn() => $f->manager->current(1, 7, 0), 'selection_unavailable'); });
saTest('Explicit PUT [] creates version one and metadata-only authority', function (): void {
    $f = new F(); $s = $f->manager->replace(1, 7, [], 0); saCheck($s->selectionVersion === 1 && $s->references === [] && $f->attributeQueries() === []);
    $f->selected->assertCurrent($f->events->current, $s); saCheck($f->attributeQueries() === [] && $f->manager->current(1, 7, 1)->selectionId === $s->selectionId);
});
saTest('Selected self adapter reads only explicitly saved items and emits owned references', function (): void {
    $f = new F(); $s = $f->manager->replace(1, 7, ['1-space:7-event_seeking'], 0); $p = $f->selected->read($f->events->current, $s);
    saCheck(array_keys($p->features) === ['needs', 'need_roles'] && $p->targetId === '1');
    saCheck($p->features['needs']['evidence'][0]->sourceId === '1-space:7-event_seeking');
});
saTest('SQL selection row contains references/versions but no facts or raw session credential', function (): void {
    $f = new F(); $f->manager->replace(1, 7, ['1-global-project'], 0); $row = $f->row(); $p = json_decode($row['selection_json'], true);
    saCheck(isset($p['references'][0]['sourceId']) && !isset($p['features']) && !str_contains($row['selection_json'], 'private-title') && !str_contains($row['selection_json'], 'php'));
});
saTest('Replacement and explicit clear increment CAS version and invalidate old authority', function (): void {
    $f = new F(); $old = $f->manager->replace(1, 7, ['1-global-skill'], 0); $clear = $f->manager->replace(1, 7, [], 1);
    saCheck($clear->selectionVersion === 2 && $clear->references === []); saReject(fn() => $f->selected->assertCurrent($f->events->current, $old), 'selection_unavailable');
    saReject(fn() => $f->manager->replace(1, 7, ['1-global-skill'], 1), 'selection_unavailable'); saCheck((int)$f->row()['selection_version'] === 2);
});
saTest('Unchosen IDs and client-shaped forged selection cannot replace authority', function (): void {
    $f = new F(); $s = $f->manager->replace(1, 7, ['1-global-skill'], 0);
    $forged = new SelectedSelfAttributes(1, 7, 'forged-selection', 1, $s->expectedVersions, $s->references);
    saReject(fn() => $f->selected->assertCurrent($f->events->current, $forged), 'selection_unavailable');
    saReject(fn() => $f->manager->replace(1, 7, ['2-global-skill'], 1));
});
saTest('Stale profile versions make GET selection_current false without mutating the saved row', function (): void {
    $f = new F(); $f->manager->replace(1, 7, ['1-global-skill'], 0); $before = $f->row();
    $f->db->createCommand()->update('matcher_profile_state', ['permission_version' => 3], ['id' => '1-global'])->execute();
    $r = $f->manager->read(1, 7); saCheck(!$r['selection_current'] && $r['selection_version'] === 1 && $r['selected_attribute_ids'] === [] && $before === $f->row());
    saReject(fn() => $f->manager->current(1, 7, 1), 'selection_unavailable');
    $new = $f->manager->replace(1, 7, ['1-global-skill'], 1); saCheck($new->selectionVersion === 2);
});
saTest('Activity switch reads are nonmutating, and switch-back with new revision cannot revive selection', function (): void {
    $f = new F(); $f->manager->replace(1, 7, [], 0); $before = $f->row();
    $f->events->current = new CurrentEventContext(1, 8, 'synthetic-selection-2', 'synthetic-policy'); saCheck($f->store->read($f->events->current) === null && $before === $f->row());
    $f->events->current = new CurrentEventContext(1, 7, 'synthetic-selection-3', 'synthetic-policy'); saCheck($f->store->read($f->events->current) === null && $before === $f->row());
    $read = $f->manager->read(1, 7); saCheck($read['selection_version'] === 1 && !$read['selection_current'] && $read['selected_attribute_ids'] === [] && $before === $f->row());
    saReject(fn() => $f->manager->replace(1, 7, [], 0), 'selection_unavailable');
    $new = $f->manager->replace(1, 7, [], $read['selection_version']); saCheck($new->selectionVersion === 2 && $f->row()['context_hash'] !== $before['context_hash']);
});
saTest('Different session has no selection; another actor cannot reuse the authenticated session key', function (): void {
    $f = new F(); $f->manager->replace(1, 7, [], 0); $f->identity->hash = str_repeat('b', 64); saCheck($f->store->read($f->events->current) === null);
    $f->identity->actor = 2; saReject(fn() => $f->store->read($f->events->current), 'context_changed');
});
saTest('Concurrent stale replace loses atomic SQL CAS and leaves the winning clear intact', function (): void {
    $f = new F(); $s = $f->manager->replace(1, 7, [], 0); $winner = new SelectedSelfAttributes(1, 7, 'winner-clear', 2, $s->expectedVersions, []);
    $second = new SqlSelfSelectionStore($f->db, $f->events, new Identity()); $f->identity->reads = 0;
    $f->identity->onRead = function (Identity $identity) use ($second, $winner, $f): void { if ($identity->reads === 4) { $identity->onRead = null; $second->replace($f->events->current, 1, $winner); } };
    $loser = new SelectedSelfAttributes(1, 7, 'losing-stale-write', 2, $s->expectedVersions, []);
    saReject(fn() => $f->store->replace($f->events->current, 1, $loser), 'selection_unavailable'); saCheck($f->store->read($f->events->current)->selectionId === 'winner-clear');
});
saTest('Concurrent version-zero creation permits only one winner', function (): void {
    $f = new F(); $v = $f->profiles->read($f->events->current, [])->versions; $winner = new SelectedSelfAttributes(1, 7, 'first-insert', 1, $v, []);
    $second = new SqlSelfSelectionStore($f->db, $f->events, new Identity()); $f->identity->reads = 0;
    $f->identity->onRead = function (Identity $identity) use ($second, $winner, $f): void { if ($identity->reads === 4) { $identity->onRead = null; $second->replace($f->events->current, 0, $winner); } };
    saReject(fn() => $f->store->replace($f->events->current, 0, new SelectedSelfAttributes(1, 7, 'second-insert', 1, $v, [])), 'selection_unavailable');
    saCheck($f->store->read($f->events->current)->selectionId === 'first-insert');
});
saTest('Old-context request cannot delete or overwrite a new current selection', function (): void {
    $f = new F(); $oldContext = $f->events->current; $old = $f->manager->replace(1, 7, [], 0);
    $f->events->current = new CurrentEventContext(1, 7, 'synthetic-selection-new', 'synthetic-policy'); $f->manager->replace(1, 7, [], 1); $before = $f->row();
    saReject(fn() => $f->store->read($oldContext)); saReject(fn() => $f->store->replace($oldContext, 1, new SelectedSelfAttributes(1, 7, 'old-stale', 2, $old->expectedVersions, []))); saCheck($before === $f->row());
});
saTest('Missing owned table fails closed and is not installed by reads', function (): void { $f = new F(false); saReject(fn() => $f->manager->read(1, 7), 'dependency_unavailable'); saCheck($f->db->getTableSchema(SelfAnalysisSelectionSchema::TABLE, true) === null); });
saTest('Caller transaction cannot supply stale authority or be committed by this adapter', function (): void { $f = new F(); $t = $f->db->beginTransaction(); saReject(fn() => $f->store->read($f->events->current), 'dependency_unavailable'); saCheck($t->isActive); $t->rollBack(); });
saTest('Corrupt persisted selection metadata returns a controlled dependency failure', function (): void { $f = new F(); $f->manager->replace(1, 7, [], 0); $f->db->createCommand()->update(SelfAnalysisSelectionSchema::TABLE, ['selection_json' => '{invalid'])->execute(); saReject(fn() => $f->manager->read(1, 7), 'dependency_unavailable'); });
saTest('Actual self/P1 SQL plus actual P8 candidate service execute the unchanged analysis use case', function (): void {
    $f = new F(); $selection = $f->manager->replace(1, 7, ['1-space:7-event_seeking'], 0);
    $relations = new class implements DiscoveryRelations { public function eligibleOwnerIds(int $v, int $s, array $ids): array { return $ids; } };
    $p1Batch = new \humhub\modules\matcherProfile\application\DiscoveryProfileBatchReader(new \humhub\modules\matcherProfile\adapters\persistence\SqlDiscoveryProfileBatchSource($f->db));
    $p8 = new DiscoveryBatchService($relations, $p1Batch->read(...));
    $reader = new P1CooperationProjectionReader($f->events, $f->catalog, $f->mapping, $f->bindings, $p8->read(...));
    $candidate = $reader->read(new CandidateRequest($f->events->current, 'person', ['2']))[0];
    $usecase = new AnalyzeCooperation($f->events, $reader, $f->selected, $f->catalog, $f->mapping, PolicyValidator::catalogFingerprint($f->catalog->read()));
    $r = $usecase->execute(1, new CooperationAnalysisRequest($f->events->current, '2', $candidate->versions, $selection, $f->mapping->fingerprint()));
    saCheck($r['verification'] === 'internal_ports_rechecked' && $r['dimensions'][0]['status'] === 'supported');
    $f->manager->replace(1, 7, [], 1); saReject(fn() => $usecase->execute(1, new CooperationAnalysisRequest($f->events->current, '2', $candidate->versions, $selection, $f->mapping->fingerprint())), 'selection_unavailable');
});
saTest('New schema migration installs and removes only the owned table in isolation', function (): void {
    $f = new F(false); require_once dirname(__DIR__, 2) . '/migrations/m261112_220000_self_analysis_selection.php';
    $migration = new m261112_220000_self_analysis_selection(['db' => $f->db]); $migration->up(); saCheck($f->db->getTableSchema(SelfAnalysisSelectionSchema::TABLE, true) !== null);
    $migration->down(); saCheck($f->db->getTableSchema(SelfAnalysisSelectionSchema::TABLE, true) === null && $f->db->getTableSchema('matcher_profile_attribute') !== null);
});
saTest('Forty actual P1 entries remain explicitly selectable and are not capped at feature count', function (): void {
    $f = new F(); $ids = ['1-global-skill'];
    for ($i = 1; $i < 40; $i++) { $id = 'synthetic-selected-skill-' . $i; P1::attribute($f->db, 1, 'global', 'skill', ['code' => 'skill' . $i, 'label' => 'Synthetic skill'], ['attribute_id' => $id]); $ids[] = $id; }
    $s = $f->manager->replace(1, 7, $ids, 0); $p = $f->selected->read($f->events->current, $s);
    saCheck(count($s->references) === 40 && count($p->features['skills']['value']) === 40);
});
saTest('Malformed unselected value is never read into an explicit narrow self projection', function (): void {
    $f = new F(); $f->db->createCommand()->update('matcher_profile_attribute', ['value_json' => '{synthetic-invalid-json'], ['attribute_id' => '1-global-project'])->execute();
    $s = $f->manager->replace(1, 7, ['1-global-skill'], 0); saCheck($f->selected->read($f->events->current, $s)->features['skills']['value'] === ['php']);
});
saTest('Unknown and formerly visible selected values cannot silently become successful unknown analysis', function (): void {
    $f = new F(); $s = $f->manager->replace(1, 7, ['1-global-skill'], 0);
    $f->db->createCommand()->update('matcher_profile_attribute', ['visibility' => 'private'], ['attribute_id' => '1-global-skill'])->execute();
    saReject(fn() => $f->selected->read($f->events->current, $s), 'selection_unavailable');
});
saTest('Late context loss after successful CAS invalidates that write without restoring old selection', function (): void {
    $f = new F(); $s = $f->manager->replace(1, 7, [], 0); $context = $f->events->current;
    $f->events->onAssert = function ($events) use ($f): void {
        $row = $f->row();
        if ($row !== false && (int)$row['selection_version'] === 2) { $events->onAssert = null; $events->current = new CurrentEventContext(1, 7, 'changed-after-write', 'synthetic-policy'); }
    };
    saReject(fn() => $f->store->replace($context, 1, new SelectedSelfAttributes(1, 7, 'late-invalid', 2, $s->expectedVersions, [])), 'selection_unavailable');
    $row = $f->row(); saCheck($row !== false && $row['selection_json'] === 'null' && (int)$row['selection_version'] === 2);
    $state = $f->store->state($f->events->current); saCheck($state === ['version' => 2, 'selection' => null]);
    saReject(fn() => $f->manager->replace(1, 7, [], 0), 'selection_unavailable');
    saCheck($f->manager->replace(1, 7, [], 2)->selectionVersion === 3);
});
saTest('Owned schema reads use master with query cache and SQL value logging disabled', function (): void {
    $f = new F(); $f->manager->replace(1, 7, [], 0); $f->db->selects = []; $f->store->read($f->events->current);
    foreach ($f->db->selects as $query) { saCheck($query['master'] && $query['cache_disabled'] && !$query['logging'] && !$query['profiling']); }
});
saTest('Changing self profile contents during confirmation prevents saving a stale authority', function (): void {
    $f = new F(); $calls = 0;
    $f->db->onSelect = function ($db) use (&$calls): void {
        $calls++; if ($calls === 5) { $db->createCommand()->update('matcher_profile_state', ['revision' => 4], ['id' => '1-global'])->execute(); }
    };
    saReject(fn() => $f->manager->replace(1, 7, ['1-global-skill'], 0)); saCheck($f->row() === false);
});
saTest('A to B to A explicit clear keeps monotonic versions and rejects the delayed original write', function (): void {
    $f = new F(); $oldContext = $f->events->current;
    $original = $f->manager->replace(1, 7, ['1-global-skill'], 0, $oldContext);
    $f->access->memberships[8] = [1]; $f->events->current = new CurrentEventContext(1, 8, 'synthetic-B', 'synthetic-policy');
    $inB = $f->manager->read(1, 8); saCheck($inB['selection_version'] === 1 && !$inB['selection_current'] && $inB['selected_attribute_ids'] === []);
    $b = $f->manager->replace(1, 8, [], 1, $f->events->current); saCheck($b->selectionVersion === 2);
    $f->events->current = new CurrentEventContext(1, 7, 'synthetic-A-return', 'synthetic-policy');
    $back = $f->manager->read(1, 7); saCheck($back['selection_version'] === 2 && !$back['selection_current']);
    $cleared = $f->manager->replace(1, 7, [], 2, $f->events->current); saCheck($cleared->selectionVersion === 3);
    $before = $f->row();
    saReject(fn() => $f->manager->replace(1, 7, ['1-global-skill'], $original->selectionVersion), 'selection_unavailable');
    saReject(fn() => $f->manager->replace(1, 7, ['1-global-skill'], 0), 'selection_unavailable');
    saCheck($before === $f->row() && $f->store->read($f->events->current)->references === []);
});
saTest('Expected activity snapshot closes the factory-to-manager switch-back gap before any write', function (): void {
    $f = new F(); $firstContext = $f->events->current; $f->manager->replace(1, 7, ['1-global-skill'], 0, $firstContext);
    $before = $f->row(); $f->events->current = new CurrentEventContext(1, 7, 'same-space-new-selection', 'synthetic-policy'); $f->db->selects = [];
    saReject(fn() => $f->manager->replace(1, 7, [], 1, $firstContext), 'context_changed');
    saCheck($f->attributeQueries() === [] && $before === $f->row());
    $next = $f->manager->replace(1, 7, [], 1, $f->events->current); saCheck($next->selectionVersion === 2);
});
saTest('Failed postcheck tombstone cannot erase a newer concurrent selection', function (): void {
    $f = new F(); $s = $f->manager->replace(1, 7, [], 0); $context = $f->events->current;
    $second = new SqlSelfSelectionStore($f->db, $f->events, new Identity());
    $winner = new SelectedSelfAttributes(1, 7, 'newer-concurrent-clear', 3, $s->expectedVersions, []);
    $f->events->onAssert = function ($events) use ($f, $second, $context, $winner): void {
        $row = $f->row(); if ($row !== false && (int)$row['selection_version'] === 2) { $events->onAssert = null; $second->replace($context, 2, $winner); }
    };
    saReject(fn() => $f->store->replace($context, 1, new SelectedSelfAttributes(1, 7, 'superseded-write', 2, $s->expectedVersions, [])), 'selection_unavailable');
    saCheck($f->store->read($context)->selectionId === $winner->selectionId && $f->store->state($context)['version'] === 3);
});
saTest('Tombstone metadata GET is nonmutating and never becomes current authorization', function (): void {
    $f = new F(); $s = $f->manager->replace(1, 7, [], 0);
    $f->db->createCommand()->update(SelfAnalysisSelectionSchema::TABLE, ['selection_json' => 'null'])->execute();
    $before = $f->row(); $view = $f->manager->read(1, 7);
    saCheck($view['selection_version'] === 1 && !$view['selection_current'] && $view['selected_attribute_ids'] === [] && $f->row() === $before);
    saReject(fn() => $f->manager->current(1, 7, 1), 'selection_unavailable');
    saReject(fn() => $f->selected->assertCurrent($f->events->current, $s), 'selection_unavailable');
});
restore_error_handler();
echo json_encode(['status' => $failed === [] ? 'passed' : 'failed', 'scope' => 'Actual P1 SELECTs, recommendation CAS store and migration in SQLite memory; synthetic activity/owner/session authorities, no HumHub app/HTTP/MySQL/model.', 'passed' => count($passed), 'failed' => count($failed), 'checks' => $passed, 'failures' => $failed], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
exit($failed === [] ? 0 : 1);
