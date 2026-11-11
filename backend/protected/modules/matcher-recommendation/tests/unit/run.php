<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/support/autoload.php';

use humhub\modules\matcherRecommendation\application\DiscoverPeople;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CandidateRequest, CurrentEventContext, EvidenceRef, ProjectionVersions, QueryIntent};
use humhub\modules\matcherRecommendation\domain\{MatchReason, RuleAssessment, RulePolicy};
use humhub\modules\matcherRecommendation\tests\support\FixtureEnvironment;

$checks = [];
function verify(bool $condition, string $name): void
{
    global $checks;
    if (!$condition) { throw new RuntimeException('FAIL: ' . $name); }
    $checks[] = $name;
}
function rejects(callable $action, string $name, string $expected = Throwable::class): void
{
    try { $action(); }
    catch (Throwable $error) { verify($error instanceof $expected, $name); return; }
    verify(false, $name);
}
function failsWithoutBatch(callable $configure, string $name, string $expected = Throwable::class): void
{
    $env = FixtureEnvironment::create(); $configure($env);
    rejects(fn() => $env->service()->execute(1, $env::query(), 7), $name, $expected);
    verify($env->batches->records === [], $name . ': no successful batch persisted');
}
function projectionRows(FixtureEnvironment $env, CandidateRequest $request): array
{
    $out = [];
    foreach ($request->targetIds as $id) { if (isset($env->profiles->rows[$id])) { $out[] = $env->profiles->rows[$id]; } }
    return $out;
}
function relationshipRows(FixtureEnvironment $env, CandidateRequest $request): array
{
    $out = [];
    foreach ($request->targetIds as $id) { if (isset($env->relationships->states[$id])) { $out[$id] = $env->relationships->states[$id]; } }
    return $out;
}
function fixtureAssessment(CandidateProjection $candidate): RuleAssessment
{
    return new RuleAssessment(true, 0.8, [new MatchReason('fixture_rule', 'Synthetic evidence only', $candidate->features['fixture_topic']['evidence'])]);
}
function detailedProjection(string $id, bool $reverseMaps = false, array $orderedValues = ['first', 'second'], string $detail = 'unchanged'): CandidateProjection
{
    $base = FixtureEnvironment::person($id);
    $scopes = $base->versions->scopes;
    $nested = ['description' => $detail, 'flags' => ['left' => true, 'right' => false], 'ordered' => $orderedValues];
    if ($reverseMaps) {
        $scopes = array_reverse($scopes, true);
        foreach ($scopes as &$versions) { $versions = array_reverse($versions, true); }
        unset($versions);
        $nested['flags'] = array_reverse($nested['flags'], true);
        $nested = array_reverse($nested, true);
    }
    $features = $base->features + ['fixture_details' => ['value' => $nested, 'evidence' => $base->features['fixture_topic']['evidence']]];
    if ($reverseMaps) { $features = array_reverse($features, true); }
    return new CandidateProjection($base->targetType, $base->targetId, $base->spaceId, new ProjectionVersions($scopes, $base->versions->schemaVersion, $base->versions->profilePolicyVersion, $base->versions->identityVersion), $features, $base->unknownFeatures);
}

$env = FixtureEnvironment::create(); $query = $env::query();
$result = $env->service()->execute(1, $query, 7);
verify($result->batch->targetIds === ['102', '103', '101'], 'descending scores and stable ID tie break');
verify($env->profiles->requests[0] === ['101', '102', '103', '104'], 'self is removed before profile reading');
verify(!in_array('104', array_column($env->rules->seen, 'candidate_id'), true), 'blocked candidate never reaches evaluator');
verify($result->items[0]->relationship['pending_in'] && $result->items[1]->relationship['pending_out'] && $result->items[2]->relationship['friend'], 'ordinary discovery preserves incoming outgoing and friend states');
verify($env->relationships->historyCalls === 0 && $env->relationships->capabilityCalls === 0, 'ordinary discovery does not require AI sent-history capability');
verify($env->rules->seen[0]['intent'] === $query && $env->rules->seen[0]['policy'] === $env->policies->policy, 'exact hard and soft query plus active policy reach evaluator');
verify($env->rules->seen[0]['route_ranks'] === ['structured' => 2], 'recall route rank reaches evaluator without being discarded');
verify($result->items[0]->candidate->unknownFeatures === ['collaboration_style'], 'optional unknown information preserved');
verify($result->items[0]->assessment->reasons[0]->evidence[0]->targetId === '102', 'result reasons refer to authorized candidate');
verify($env->events->checks >= 5 && $env->profiles->reads === 2 && $env->relationships->reads === 2, 'context and selected projections rechecked before result');
verify($env->batches->get($result->batchId) === $result->batch, 'batch storage receives returned snapshot');
verify($result->batch->expiresAt->getTimestamp() - $result->batch->createdAt->getTimestamp() === 900, 'batch expiry is 15 minutes');
verify(!str_contains(json_encode($result->batch, JSON_THROW_ON_ERROR), 'robotics'), 'batch stores IDs hashes and versions without profile or query payload');
$env->clock->advance(20); $next = $env->service()->execute(1, $query, 7);
verify($next->batch->targetIds === $result->batch->targetIds, 'same query uses deterministic score order');
verify($next->batch->createdAt->getTimestamp() - $result->batch->createdAt->getTimestamp() === 20, 'injected clock controls time');

$env = FixtureEnvironment::create(); $env->retriever->rows = [];
$empty = $env->service()->execute(1, $env::query(), 7);
verify($empty->items === [] && $empty->batch->targetIds === [], 'empty recall remains a true empty result');
verify($env->profiles->reads === 0 && $env->relationships->reads === 0 && $env->rules->seen === [], 'empty recall does not trigger full activity fallback');
$env = FixtureEnvironment::create(); $env->retriever->rows = [['target_type' => 'person', 'id' => '1', 'routes' => ['structured' => 1]]];
verify($env->service()->execute(1, $env::query(), 7)->items === [] && $env->profiles->reads === 0, 'self-only recall is empty');
$env = FixtureEnvironment::create(); $env->profiles->rows = [];
verify($env->service()->execute(1, $env::query(), 7)->items === [], 'missing authorized projections never fabricate candidates');
$env = FixtureEnvironment::create(); $env->retriever->rows = [['target_type' => 'person', 'id' => '104', 'routes' => ['structured' => 1]]];
verify($env->service()->execute(1, $env::query(), 7)->items === [] && $env->rules->seen === [], 'blocked-only pool remains empty');
$env = FixtureEnvironment::create();
$unmet = new QueryIntent('person', [['feature' => 'fixture_topic', 'operator' => 'fixture_equals', 'value' => 'different-topic', 'strength' => 'hard', 'origin' => 'user_confirmed']]);
verify($env->service()->execute(1, $unmet, 7)->items === [] && $env->rules->seen[0]['intent'] === $unmet, 'unmet explicit hard condition stays hard and produces zero matches');
$env = FixtureEnvironment::create();
$unknown = new QueryIntent('person', [['feature' => 'unknown_required', 'operator' => 'fixture_equals', 'value' => true, 'strength' => 'hard', 'origin' => 'user_confirmed']]);
verify($env->service()->execute(1, $unknown, 7)->items === [], 'unknown hard requirement is not assumed satisfied');

foreach (['events', 'retriever', 'profiles', 'relationships', 'rules', 'policies', 'batches'] as $dependency) {
    failsWithoutBatch(static function (FixtureEnvironment $env) use ($dependency): void { $env->{$dependency}->available = false; }, $dependency . ' failure propagates rather than becoming empty success', RuntimeException::class);
}
$env = FixtureEnvironment::create();
rejects(fn() => new DiscoverPeople($env->events, $env->retriever, $env->profiles, $env->relationships, null, $env->policies, $env->batches, $env->clock), 'missing evaluator has no implicit test fallback', TypeError::class);
rejects(fn() => $env->service()->execute(1, new QueryIntent('idea'), 7), 'person use case rejects idea target', InvalidArgumentException::class);
rejects(fn() => $env->service()->execute(1, $env::query(), 8), 'other current Space is not accepted', RuntimeException::class);
$env = FixtureEnvironment::create();
rejects(fn() => $env->service()->execute(1, new QueryIntent('person', $env::query()->conditions, ['self-attribute']), 7), 'unconnected selected-self context is explicitly rejected', InvalidArgumentException::class);
rejects(fn() => $env->service()->execute(1, new QueryIntent('person', $env::query()->conditions, [], 'idea-context'), 7), 'unconnected current-idea context is explicitly rejected', InvalidArgumentException::class);
verify($env->profiles->reads === 0 && $env->rules->seen === [] && $env->batches->records === [], 'unsupported contextual inputs never run partial discovery');

failsWithoutBatch(static function (FixtureEnvironment $env): void { $env->events->resolveOverride = new CurrentEventContext(2, 7, 'access-fixture-1', 'event-fixture-1'); }, 'malicious context cannot replace viewer', UnexpectedValueException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void { $env->retriever->rows[0]['target_type'] = 'idea'; }, 'recall cannot change target type', UnexpectedValueException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void { $env->retriever->rows[0]['id'] = '01'; }, 'person IDs must be canonical to exclude self safely', UnexpectedValueException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void { $env->retriever->rows[] = $env->retriever->rows[1]; }, 'duplicate recall IDs rejected', UnexpectedValueException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void { $env->retriever->rows[0]['profile_payload'] = 'not permitted'; }, 'recall cannot attach arbitrary profile payload', UnexpectedValueException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void { $env->retriever->rows[0]['routes'] = ['sql' => 1]; }, 'unknown recall route rejected', UnexpectedValueException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void { $env->retriever->rows[0]['routes'] = ['fulltext' => 41]; }, 'fulltext route rank limit enforced', UnexpectedValueException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void { $env->retriever->rows = array_map(static fn(int $id): array => ['target_type' => 'person', 'id' => (string)$id, 'routes' => ['structured' => 1]], range(100, 300)); }, 'more than 200 recalled candidates rejected', UnexpectedValueException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void { $env->retriever->rows = array_map(static fn(int $id): array => ['target_type' => 'person', 'id' => (string)$id, 'routes' => ['structured' => 1]], range(100, 180)); }, 'structured route count limit enforced', UnexpectedValueException::class);

failsWithoutBatch(static function (FixtureEnvironment $env): void { $env->profiles->onRead = static fn() => [FixtureEnvironment::person('999')]; }, 'unrequested projection rejected', UnexpectedValueException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void { $env->profiles->onRead = static fn() => [FixtureEnvironment::person('101', 8)]; }, 'cross-Space projection rejected', UnexpectedValueException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void { $env->profiles->onRead = static fn() => [FixtureEnvironment::person('101'), FixtureEnvironment::person('101')]; }, 'duplicate projection rejected', UnexpectedValueException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void { $env->profiles->onRead = static fn() => [new CandidateProjection('idea', '101', 7, new ProjectionVersions(['space:7' => ['revision' => 1, 'permission_version' => 1]], 1, 'idea-fixture'), [])]; }, 'idea projection cannot masquerade as person', UnexpectedValueException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void { unset($env->relationships->states['101']); }, 'incomplete current relationships do not imply permission', UnexpectedValueException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void { $env->relationships->states['101']['friend'] = 'yes'; }, 'relationship facts require explicit booleans', UnexpectedValueException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void { $env->relationships->onRead = static fn() => ['999' => FixtureEnvironment::relationship()]; }, 'foreign relationship subjects rejected', UnexpectedValueException::class);

failsWithoutBatch(static function (FixtureEnvironment $env): void {
    $env->retriever->onRecall = static function () use ($env): array { $env->events->version = 'revoked'; return $env->retriever->rows; };
}, 'activity revoked during recall rejects stale context', RuntimeException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void {
    $env->rules->onEvaluate = static function ($context, $intent, CandidateProjection $candidate) use ($env): RuleAssessment { $env->events->version = 'revoked'; return fixtureAssessment($candidate); };
}, 'activity revoked during evaluation never publishes result', RuntimeException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void {
    $env->rules->onEvaluate = static fn() => new RuleAssessment(true, 0.9, [new MatchReason('forged', 'Unrelated synthetic evidence', [new EvidenceRef('person', '999', 'profile_attribute', 'hidden-attribute', 'global', 3, 1)])]);
}, 'evaluator cannot cite evidence outside supplied projection', UnexpectedValueException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void { $env->rules->onEvaluate = static fn() => new RuleAssessment(true, 0.9); }, 'positive result without evidence rejected', InvalidArgumentException::class);
failsWithoutBatch(static function (FixtureEnvironment $env): void { $env->policies->onCurrent = static fn($context, int $reads) => new RulePolicy('policy-' . $reads); }, 'policy change during query rejects stale scoring', RuntimeException::class);

$env = FixtureEnvironment::create();
$env->profiles->onRead = static function (CandidateRequest $request, int $reads) use ($env): array {
    if ($reads === 2) { unset($env->profiles->rows['101']); }
    return projectionRows($env, $request);
};
verify($env->service()->execute(1, $env::query(), 7)->batch->targetIds === ['102', '103'], 'revoked final projection reduces result count without refilling');
$env = FixtureEnvironment::create();
$env->profiles->onRead = static function (CandidateRequest $request, int $reads) use ($env): array {
    if ($reads === 2) { $env->profiles->rows['101'] = FixtureEnvironment::person('101', 7, 4); }
    return projectionRows($env, $request);
};
verify($env->service()->execute(1, $env::query(), 7)->batch->targetIds === ['102', '103'], 'changed profile revision removes stale reason');
$env = FixtureEnvironment::create(); $env->profiles->rows['101'] = detailedProjection('101');
$env->profiles->onRead = static function (CandidateRequest $request, int $reads) use ($env): array {
    if ($reads === 2) { $env->profiles->rows['101'] = detailedProjection('101', reverseMaps: true); }
    return projectionRows($env, $request);
};
verify($env->service()->execute(1, $env::query(), 7)->batch->targetIds === ['102', '103', '101'], 'same projection values with reordered feature scope and nested map keys stay eligible');
$env = FixtureEnvironment::create(); $env->profiles->rows['101'] = detailedProjection('101');
$env->profiles->onRead = static function (CandidateRequest $request, int $reads) use ($env): array {
    if ($reads === 2) { $env->profiles->rows['101'] = detailedProjection('101', detail: 'changed'); }
    return projectionRows($env, $request);
};
verify($env->service()->execute(1, $env::query(), 7)->batch->targetIds === ['102', '103'], 'actual projection value change still invalidates stale evidence');
$env = FixtureEnvironment::create(); $env->profiles->rows['101'] = detailedProjection('101');
$env->profiles->onRead = static function (CandidateRequest $request, int $reads) use ($env): array {
    if ($reads === 2) { $env->profiles->rows['101'] = detailedProjection('101', orderedValues: ['second', 'first']); }
    return projectionRows($env, $request);
};
verify($env->service()->execute(1, $env::query(), 7)->batch->targetIds === ['102', '103'], 'ordered list value changes are not normalized away');
$env = FixtureEnvironment::create();
$env->policies->onCurrent = static fn($context, int $reads) => new RulePolicy('stable-policy', $reads === 1 ? ['nested' => ['beta' => 2, 'alpha' => 1], 'enabled' => true] : ['enabled' => true, 'nested' => ['alpha' => 1, 'beta' => 2]]);
verify(count($env->service()->execute(1, $env::query(), 7)->items) === 3, 'policy map key order alone does not invalidate scoring');
failsWithoutBatch(static function (FixtureEnvironment $env): void {
    $env->policies->onCurrent = static fn($context, int $reads) => new RulePolicy('stable-policy', ['shape' => $reads === 1 ? [1 => 'b', 0 => 'a'] : ['a', 'b']]);
}, 'map to list semantic change remains a policy change', RuntimeException::class);
$firstEnv = FixtureEnvironment::create(); $secondEnv = FixtureEnvironment::create();
$firstEnv->policies->policy = new RulePolicy('stable-policy', ['b' => ['y' => 2, 'x' => 1], 'a' => true]);
$secondEnv->policies->policy = new RulePolicy('stable-policy', ['a' => true, 'b' => ['x' => 1, 'y' => 2]]);
$firstQuery = $firstEnv::query();
$secondQuery = new QueryIntent('person', array_map(static fn(array $condition): array => array_reverse($condition, true), $firstQuery->conditions));
verify($firstEnv->service()->execute(1, $firstQuery, 7)->batch->queryHash === $secondEnv->service()->execute(1, $secondQuery, 7)->batch->queryHash, 'query hash is stable across equivalent condition and policy map key order');
$firstEnv = FixtureEnvironment::create(); $secondEnv = FixtureEnvironment::create();
$firstEnv->policies->policy = new RulePolicy('stable-policy', ['shape' => [1 => 'b', 0 => 'a']]);
$secondEnv->policies->policy = new RulePolicy('stable-policy', ['shape' => ['a', 'b']]);
verify($firstEnv->service()->execute(1, $firstEnv::query(), 7)->batch->queryHash !== $secondEnv->service()->execute(1, $secondEnv::query(), 7)->batch->queryHash, 'canonical query hash preserves associative map versus list semantics');
$env = FixtureEnvironment::create();
$env->relationships->onRead = static function (CandidateRequest $request, int $reads) use ($env): array {
    if ($reads === 2) { $env->relationships->states['102'] = FixtureEnvironment::relationship(blocked: true, version: 'rel-2'); }
    return relationshipRows($env, $request);
};
verify($env->service()->execute(1, $env::query(), 7)->batch->targetIds === ['103', '101'], 'late block removes candidate without historical filtering');
$env = FixtureEnvironment::create();
$env->relationships->onRead = static function (CandidateRequest $request, int $reads) use ($env): array {
    if ($reads === 2) { $env->relationships->states['101'] = FixtureEnvironment::relationship(pendingOut: true, version: 'rel-2'); }
    return relationshipRows($env, $request);
};
$updated = $env->service()->execute(1, $env::query(), 7);
verify($updated->items[2]->relationship['pending_out'] && $updated->items[2]->relationship['version'] === 'rel-2', 'late non-blocking relationship change is displayed without hiding person');

$env = FixtureEnvironment::create();
$env->catalog->fields['new_source'] = ['key' => 'new_source', 'scope' => 'global', 'value_schema' => ['type' => 'string'], 'cardinality' => 'one'];
$old = $env->profiles->rows['101'];
$env->profiles->rows['101'] = new CandidateProjection('person', '101', 7, $old->versions, $old->features + ['new_feature' => ['value' => 'not automatically enabled', 'evidence' => $old->features['fixture_topic']['evidence']]], $old->unknownFeatures);
$mapped = $env->service()->execute(1, $env::query(), 7);
verify(!isset($mapped->items[2]->candidate->features['new_feature']), 'new catalog feature remains absent until explicitly mapped');
$env->profiles->bindings['new_feature'] = 'new_source';
verify(isset($env->service()->execute(1, $env::query(), 7)->items[2]->candidate->features['new_feature']), 'explicit metadata binding enables only its logical feature');
unset($env->catalog->fields['synthetic_topics']);
$env->catalog->fields['renamed_topics'] = ['key' => 'renamed_topics', 'scope' => 'global', 'value_schema' => ['type' => 'string'], 'cardinality' => 'one'];
verify($env->service()->execute(1, $env::query(), 7)->items === [], 'renamed source does not silently replace missing binding');
$env->profiles->bindings['fixture_topic'] = 'renamed_topics';
verify(count($env->service()->execute(1, $env::query(), 7)->items) === 3, 'explicit remapping restores logical feature without original column dependency');

$env = FixtureEnvironment::create();
$env->retriever->rows[1]['routes'] = ['structured' => 2, 'fulltext' => 3];
$env->service()->execute(1, $env::query(), 7);
verify($env->rules->seen[0]['route_ranks'] === ['structured' => 2, 'fulltext' => 3], 'all route ranks remain available for future RRF evaluator');

$moduleRoot = dirname(__DIR__, 2); $sourceFiles = 0;
foreach (['application', 'domain', 'contracts'] as $directory) {
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($moduleRoot . '/' . $directory, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
        if ($file->getExtension() !== 'php') { continue; }
        $sourceFiles++;
        foreach (token_get_all(file_get_contents($file->getPathname())) as $token) {
            if (!is_array($token) || !in_array($token[0], [T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED], true)) { continue; }
            $name = ltrim($token[1], chr(92));
            $foreignHumHub = str_starts_with($name, 'humhub' . chr(92)) && !str_starts_with($name, implode(chr(92), ['humhub', 'modules', 'matcherRecommendation']) . chr(92));
            if ($foreignHumHub || str_starts_with(strtolower($name), 'yii' . chr(92))) { throw new RuntimeException('Forbidden source dependency: ' . $name); }
        }
        if (str_contains(file_get_contents($file->getPathname()), 'FixtureEnvironment')) { throw new RuntimeException('Production source references test fixture.'); }
    }
}
verify($sourceFiles >= 20, 'pure source dependency scan covers contracts domain and application');
echo json_encode(['status' => 'passed', 'phase' => 'R1 pure use case with synthetic adapters', 'checks' => count($checks), 'source_files_checked' => $sourceFiles, 'database_calls' => 0, 'network_calls' => 0, 'model_calls' => 0, 'production_adapters_executed' => false, 'formal_rule_evaluator_executed_in_this_suite' => false, 'checks_passed' => $checks], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
