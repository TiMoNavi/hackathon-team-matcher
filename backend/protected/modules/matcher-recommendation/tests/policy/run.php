<?php
declare(strict_types=1);
require dirname(__DIR__) . '/support/autoload.php';
use humhub\modules\matcherRecommendation\application\policy\PolicyLifecycle;
use humhub\modules\matcherRecommendation\domain\config\{Fingerprint, PolicyValidator, ProfileProjectionMapper, ReplayCase, ReplaySuite, ValueSchema};
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\tests\policy\{Fixtures, MemoryEnvironment};

set_error_handler(static function (int $severity, string $message, string $file, int $line): never { throw new ErrorException($message, 0, $severity, $file, $line); });
$checks = []; $failures = [];
function check(bool $condition, string $message = 'Assertion failed'): void { if (!$condition) { throw new RuntimeException($message); } }
function rejects(callable $run, string $class = InvalidArgumentException::class): void {
    try { $run(); } catch (Throwable $error) { if (!$error instanceof $class) { throw $error; } return; }
    throw new RuntimeException('Expected rejection did not occur.');
}
function test(string $name, callable $run): void { global $checks, $failures; try { $run(); $checks[] = $name; } catch (Throwable $error) { $failures[] = ['test' => $name, 'error' => get_class($error) . ': ' . $error->getMessage()]; } }
function project(?array $attributes = null, ?array $catalog = null, ?array $parameters = null): \humhub\modules\matcherRecommendation\contracts\CandidateProjection {
    return (new ProfileProjectionMapper())->project(Fixtures::context(), '22', Fixtures::versions(), new RulePolicy('synthetic-policy-1', $parameters ?? Fixtures::parameters()), $catalog ?? Fixtures::catalog(), $attributes ?? Fixtures::attributes());
}
function service(MemoryEnvironment $env): PolicyLifecycle { return new PolicyLifecycle($env, $env, $env, $env, $env); }
function ready(MemoryEnvironment $env, string $id = 'test-draft', ?array $parameters = null): \humhub\modules\matcherRecommendation\domain\config\PolicyDraft {
    $service = service($env); $draft = $service->createDraft(1, $id, $parameters ?? Fixtures::parameters());
    $draft = $service->validate(1, $draft->id, $draft->revision); return $service->replay(1, $draft->id, $draft->revision);
}

test('Synthetic policy and catalog validate', fn() => PolicyValidator::validate(Fixtures::parameters(), Fixtures::catalog()));
foreach ([
    'top-level executable key' => static function (array &$p): void { $p['sql'] = 'not executable'; },
    'missing policy key' => static function (array &$p): void { unset($p['rules']); },
    'nonfinite weight' => static function (array &$p): void { $p['dimension_weights']['topic'] = INF; },
    'incorrect weight sum' => static function (array &$p): void { $p['dimension_weights']['topic'] = .1; },
    'zero active dimension' => static function (array &$p): void { $p['dimension_weights']['topic'] = 0; $p['dimension_weights']['contribution'] = .7; },
    'weakened evidence threshold' => static function (array &$p): void { $p['minimum_match_score'] = .1; },
    'too many recalled candidates' => static function (array &$p): void { $p['limits']['recall'] = 201; },
    'too many model candidates' => static function (array &$p): void { $p['limits']['model_candidates'] = 25; },
    'too many AI final results' => static function (array &$p): void { $p['limits']['final_results'] = 6; },
    'candidate byte overflow' => static function (array &$p): void { $p['limits']['candidate_bytes'] = 769; },
    'request byte overflow' => static function (array &$p): void { $p['limits']['request_bytes'] = 24577; },
    'increasing stage counts' => static function (array &$p): void { $p['limits']['recall'] = 10; },
    'invalid route' => static function (array &$p): void { $p['enabled_routes'] = ['global']; },
    'unbounded exploration' => static function (array &$p): void { $p['selection']['exploration_slots'] = 2; },
    'unbounded tie group' => static function (array &$p): void { $p['selection']['near_tie_delta'] = .4; },
    'unbound candidate field' => static function (array &$p): void { $p['rules'][0]['candidate_features'] = ['unbound']; },
    'duplicate rule' => static function (array &$p): void { $p['rules'][] = $p['rules'][0]; },
    'array operator fails cleanly' => static function (array &$p): void { $p['rules'][0]['operator'] = []; },
    'contact binding' => static function (array &$p): void { $p['bindings']['topics']['source_key'] = 'contact_email'; },
    'raw-source binding' => static function (array &$p): void { $p['bindings']['topics']['source_key'] = 'raw_resume'; },
    'private message binding' => static function (array &$p): void { $p['bindings']['topics']['source_key'] = 'private_messages'; },
    'age binding' => static function (array &$p): void { $p['bindings']['topics']['source_key'] = 'age_range'; },
    'capability is not willingness' => static function (array &$p): void { $p['rules'][2]['candidate_features'] = ['skills']; },
    'global willingness is not event willingness' => static function (array &$p): void { $p['bindings']['offers']['scope'] = 'global'; },
    'personality cannot be a contribution' => static function (array &$p): void { $p['bindings']['self_type']['purpose'] = 'contribution'; $p['rules'][5]['dimension'] = 'contribution'; },
    'personality similarity is not compatibility' => static function (array &$p): void { $p['rules'][5]['operator'] = 'similarity'; },
    'personality alias cannot invent compatibility' => static function (array &$p): void { $p['rules'][5]['aliases'] = ['INTJ' => 'ENFP']; },
    'style alias cannot invert preference' => static function (array &$p): void { $p['rules'][4]['aliases'] = ['async' => 'onsite']; },
    'alias chain' => static function (array &$p): void { $p['rules'][0]['aliases'] = ['a' => 'b', 'b' => 'c']; },
    'alias cycle' => static function (array &$p): void { $p['rules'][0]['aliases'] = ['a' => 'b', 'b' => 'a']; },
    'normalized alias chain' => static function (array &$p): void { $p['rules'][0]['aliases'] = ['A' => 'B', 'b' => 'c']; },
    'ambiguous normalized alias' => static function (array &$p): void { $p['rules'][0]['aliases'] = ['A' => 'b', 'a' => 'c']; },
    'custom transform' => static function (array &$p): void { $p['bindings']['topics']['transform'] = 'eval'; },
    'unsupported schema expression' => static function (array &$p): void { $p['bindings']['topics']['value_schema']['expression'] = 'arbitrary'; },
] as $name => $mutate) { test('Reject ' . $name, static function () use ($mutate): void { $p = Fixtures::parameters(); $mutate($p); rejects(fn() => PolicyValidator::assertParameters($p)); }); }
test('Ordinary results cap is independent of AI five-card cap', static function (): void { $p = Fixtures::parameters(); $p['selection']['max_results'] = 200; PolicyValidator::assertParameters($p); });
test('Configuration preserves literal enum validation', static function (): void { rejects(fn() => ValueSchema::assertValue('ENTP', Fixtures::parameters()['bindings']['self_type']['value_schema'])); });
test('Unicode length works without mbstring', static function (): void { ValueSchema::assertValue('你好', ['type' => 'string', 'minLength' => 2, 'maxLength' => 2]); rejects(fn() => ValueSchema::assertValue('你好啊', ['type' => 'string', 'maxLength' => 2])); });
test('Invalid calendar and absent timezone fail', static function (): void { foreach (['2026-02-30T10:00:00Z', '2026-11-11T10:00:00', '2026-11-11T10:00:00+14:30'] as $value) { rejects(fn() => ValueSchema::assertValue($value, ['type' => 'string', 'format' => 'date-time'])); } });
test('Canonical digest ignores associative insertion order', static function (): void { check(Fingerprint::of(['b' => 2, 'a' => 1]) === Fingerprint::of(['a' => 1, 'b' => 2])); check(Fingerprint::of([1, 2]) !== Fingerprint::of([2, 1])); });
test('Display rename has no semantic effect', static function (): void { $c = Fixtures::catalog(); $c['fields']['synthetic_topics']['label'] = 'Renamed'; PolicyValidator::validate(Fixtures::parameters(), $c); check(PolicyValidator::catalogFingerprint($c) === PolicyValidator::catalogFingerprint(Fixtures::catalog())); });
foreach (['delete', 'type', 'enum', 'scope', 'cardinality'] as $change) { test('Changed field ' . $change . ' invalidates exact binding', static function () use ($change): void {
    $c = Fixtures::catalog(); $key = $change === 'enum' ? 'synthetic_type' : 'synthetic_topics'; $feature = $change === 'enum' ? 'self_type' : 'topics';
    if ($change === 'delete') { unset($c['fields'][$key]); }
    elseif ($change === 'type') { $c['fields'][$key]['value_schema'] = ['type' => 'number']; }
    elseif ($change === 'enum') { $c['fields'][$key]['value_schema']['enum'][] = 'ENTP'; }
    else { $c['fields'][$key][$change] = $change === 'scope' ? 'event' : 'one'; }
    rejects(fn() => PolicyValidator::validate(Fixtures::parameters(), $c)); check(isset(PolicyValidator::bindingIssues(Fixtures::parameters(), $c)[$feature]));
    $projection = project(catalog: $c); check(!isset($projection->features[$feature]) && in_array($feature, $projection->unknownFeatures, true));
}); }
test('Explicit rebind is required and accepted after validation', static function (): void { $p = Fixtures::parameters(); $c = Fixtures::catalog(); $c['fields']['renamed_topic_key'] = $c['fields']['synthetic_topics']; $c['fields']['renamed_topic_key']['key'] = 'renamed_topic_key'; unset($c['fields']['synthetic_topics']); rejects(fn() => PolicyValidator::validate($p, $c)); $p['bindings']['topics']['source_key'] = 'renamed_topic_key'; PolicyValidator::validate($p, $c); });
test('New unmapped fields stay unused', static function (): void { $c = Fixtures::catalog(); $c['fields']['synthetic_new'] = ['key' => 'synthetic_new', 'scope' => 'global', 'cardinality' => 'one', 'value_schema' => ['type' => 'string']]; $a = Fixtures::attributes(); $a[] = array_replace($a[0], ['attribute_id' => 'new-unbound', 'key' => 'synthetic_new', 'value' => 'unused']); check(Fingerprint::of(project()->features) === Fingerprint::of(project($a, $c)->features)); });
test('Projection transforms and evidence stay minimal', static function (): void { $p = project(); check($p->features['topics']['value'] === ['social', 'education']); check($p->features['skills']['value'] === ['python']); check($p->features['offers']['value'] === ['leadership', 'backend']); check($p->features['self_type']['value'] === 'INTJ'); check(count($p->features['topics']['evidence']) === 2); check($p->features['skills']['evidence'][0]->attributeId() === 'synthetic-skill'); check(array_keys($p->features['availability']['value'][0]) === ['starts_at', 'ends_at']); check($p->features['availability']['value'][0]['starts_at'] === '2026-11-11T10:00:00+08:00'); check($p->unknownFeatures === []); });
foreach (['role_codes', 'skill_codes', 'tech_codes', 'traits', 'mode'] as $transform) { test('Allowlisted ' . $transform . ' transform excludes ancillary text', static function () use ($transform): void {
    $p = Fixtures::parameters(); $text = ['type' => 'string', 'maxLength' => 100]; $isMode = $transform === 'mode'; $isStyle = $transform === 'traits';
    $dimension = $isMode ? 'availability' : ($isStyle ? 'collaboration_style' : 'contribution');
    $schema = ['type' => 'object', 'properties' => [$transform => $isMode ? $text : ['type' => 'array', 'items' => $text, 'maxItems' => 10], 'note' => $text], 'required' => [$transform], 'additionalProperties' => false];
    $binding = ['source_key' => 'synthetic_transform', 'scope' => 'global', 'cardinality' => 'one', 'value_schema' => $schema, 'transform' => $transform, 'purpose' => $dimension, 'semantic' => $isMode ? 'availability' : ($isStyle ? 'collaboration_preference' : 'capability')];
    $p['bindings'] = ['projection_test' => $binding]; $p['rules'] = [['id' => 'projection_rule', 'dimension' => $dimension, 'operator' => $isMode || $isStyle ? 'explicit_preference' : 'similarity', 'query_feature' => 'projection_test', 'candidate_features' => ['projection_test'], 'aliases' => []]];
    $catalog = ['schema_version' => 2, 'fields' => ['synthetic_transform' => ['key' => 'synthetic_transform', 'scope' => 'global', 'cardinality' => 'one', 'value_schema' => $schema]]];
    $attribute = array_replace(Fixtures::attributes()[0], ['key' => 'synthetic_transform', 'value' => [$transform => $isMode ? 'online' : ['tag', 'tag'], 'note' => 'must not become a feature']]);
    $result = project([$attribute], $catalog, $p); check($result->features['projection_test']['value'] === ($isMode ? 'online' : ['tag']));
}); }
test('Identity string lists are deduplicated', static function (): void {
    $p = Fixtures::parameters(); $schema = ['type' => 'array', 'items' => ['type' => 'string'], 'maxItems' => 10]; $p['bindings']['topics']['value_schema'] = $schema;
    $c = Fixtures::catalog(); $c['fields']['synthetic_topics']['value_schema'] = $schema; $a = [array_replace(Fixtures::attributes()[0], ['value' => ['social', 'social', 'education']])];
    check(project($a, $c, $p)->features['topics']['value'] === ['social', 'education']);
});
foreach ([['visibility', 'private'], ['visibility', 'friends'], ['status', 'draft'], ['discovery_allowed', false]] as [$key, $value]) { test('Exclude attribute with ' . $key . '=' . json_encode($value), static function () use ($key, $value): void { $a = Fixtures::attributes(); $a[2][$key] = $value; check(!isset(project($a)->features['skills'])); }); }
test('Confirmed authenticated contacts are excluded', static function (): void { $a = Fixtures::attributes(); $a[] = array_replace($a[0], ['attribute_id' => 'synthetic-contact', 'key' => 'contact_phone', 'value' => 'synthetic-do-not-use']); check(Fingerprint::of(project()->features) === Fingerprint::of(project($a)->features)); });
test('Unknown optional fields produce no positive values', static function (): void { $p = project([]); check($p->features === [] && count($p->unknownFeatures) === 6); });
test('Invalid values remain unknown without coercion', static function (): void { $a = Fixtures::attributes(); $a[2]['value'] = ['code' => 42, 'label' => 'bad']; check(!isset(project($a)->features['skills'])); });
test('Single cardinality cannot hide duplicate source attributes', static function (): void { $a = Fixtures::attributes(); $a[] = array_replace($a[3], ['attribute_id' => 'duplicate-one']); rejects(fn() => project($a)); });
foreach (['owner_id' => 'other-person', 'scope' => 'space:8', 'revision' => 99, 'permission_version' => 99] as $key => $value) { test('Reject evidence ' . $key . ' mismatch', static function () use ($key, $value): void { $a = Fixtures::attributes(); $a[0][$key] = $value; rejects(fn() => project($a)); }); }
test('Reject duplicate stable evidence id', static function (): void { $a = Fixtures::attributes(); $a[1]['attribute_id'] = $a[0]['attribute_id']; rejects(fn() => project($a)); });
test('Reject full profile envelope at mapper boundary', static function (): void { $a = Fixtures::attributes(); $a[0]['raw_profile'] = []; rejects(fn() => project($a)); });

test('Replay executes real evaluator and publishes exact content', static function (): void { $e = new MemoryEnvironment(); $d = ready($e); check($e->evaluations === 4 && $d->replay?->passed()); check(array_unique($e->observedContextPolicyVersions) === [Fixtures::context()->policyVersion]); $p = service($e)->publish(1, $d->id, $d->revision, null); check($e->active()?->version === $p->version && $p->parameters === Fixtures::parameters()); });
test('Draft and validation alone cannot publish', static function (): void { $e = new MemoryEnvironment(); $s = service($e); $d = $s->createDraft(1, 'draft', Fixtures::parameters()); rejects(fn() => $s->publish(1, $d->id, $d->revision, null), RuntimeException::class); $d = $s->validate(1, $d->id, $d->revision); rejects(fn() => $s->publish(1, $d->id, $d->revision, null), RuntimeException::class); check($e->active() === null); });
test('Replay requires prior current validation', static function (): void { $e = new MemoryEnvironment(); $d = service($e)->createDraft(1, 'draft', Fixtures::parameters()); rejects(fn() => service($e)->replay(1, $d->id, $d->revision), RuntimeException::class); check($e->evaluations === 0); });
test('Client passed boolean cannot replace replay report', static function (): void { $e = new MemoryEnvironment(); $p = Fixtures::parameters(); $p['passed'] = true; $d = service($e)->createDraft(1, 'draft', $p); rejects(fn() => service($e)->validate(1, $d->id, $d->revision)); check($e->active() === null); });
test('Failed assertions are stored and block publication', static function (): void { $e = new MemoryEnvironment(); $case = $e->suite->cases[0]; $e->suite = new ReplaySuite('bad-expected-result', [new ReplayCase($case->id, $case->context, $case->intent, $case->candidate, $case->routeRanks, false, 1, 1)]); $d = ready($e); check($e->evaluations === 1 && !$d->replay?->passed()); rejects(fn() => service($e)->publish(1, $d->id, $d->revision, null), RuntimeException::class); });
test('Editing invalidates validation and replay', static function (): void { $e = new MemoryEnvironment(); $d = ready($e); $p = $d->parameters; $p['minimum_match_score'] = .4; $edited = service($e)->edit(1, $d->id, $d->revision, $p); check($edited->validatedDigest === null && $edited->replay === null); rejects(fn() => service($e)->publish(1, $edited->id, $edited->revision, null), RuntimeException::class); rejects(fn() => service($e)->publish(1, $d->id, $d->revision, null), RuntimeException::class); });
test('Changed catalog blocks stale publication', static function (): void { $e = new MemoryEnvironment(); $d = ready($e); $e->catalog['fields']['synthetic_topics']['value_schema']['maxLength'] = 50; rejects(fn() => service($e)->publish(1, $d->id, $d->revision, null)); check($e->active() === null); });
test('Catalog version bump blocks prior validation', static function (): void { $e = new MemoryEnvironment(); $s = service($e); $d = $s->createDraft(1, 'draft', Fixtures::parameters()); $d = $s->validate(1, $d->id, $d->revision); $e->catalog['schema_version'] = 3; rejects(fn() => $s->replay(1, $d->id, $d->revision)); });
test('Display rename permits already executed replay', static function (): void { $e = new MemoryEnvironment(); $d = ready($e); $e->catalog['fields']['synthetic_topics']['label'] = 'Display rename'; service($e)->publish(1, $d->id, $d->revision, null); check($e->active() !== null); });
test('Changed suite version blocks stale publication', static function (): void { $e = new MemoryEnvironment(); $d = ready($e); $e->suite = new ReplaySuite('synthetic-suite-2', $e->suite->cases); rejects(fn() => service($e)->publish(1, $d->id, $d->revision, null), RuntimeException::class); });
test('Changed suite content with same version blocks publication', static function (): void { $e = new MemoryEnvironment(); $d = ready($e); $e->suite = new ReplaySuite($e->suite->version, array_slice($e->suite->cases, 0, 2)); rejects(fn() => service($e)->publish(1, $d->id, $d->revision, null), RuntimeException::class); });
test('Concurrent draft edit cannot receive old replay', static function (): void { $e = new MemoryEnvironment(); $s = service($e); $d = $s->createDraft(1, 'draft', Fixtures::parameters()); $d = $s->validate(1, $d->id, $d->revision); $e->duringEvaluation = static function () use ($s, $d): void { $p = $d->parameters; $p['minimum_match_score'] = .4; $s->edit(1, $d->id, $d->revision, $p); }; rejects(fn() => $s->replay(1, $d->id, $d->revision), RuntimeException::class); check($e->draft($d->id)?->replay === null && $e->draft($d->id)?->parameters['minimum_match_score'] === .4); });
test('Catalog change during replay cannot save report', static function (): void { $e = new MemoryEnvironment(); $s = service($e); $d = $s->createDraft(1, 'draft', Fixtures::parameters()); $d = $s->validate(1, $d->id, $d->revision); $e->duringEvaluation = static function () use ($e): void { $e->catalog['schema_version']++; }; rejects(fn() => $s->replay(1, $d->id, $d->revision), RuntimeException::class); check($e->draft($d->id)?->replay === null); });
test('Access revocation during replay prevents report commit', static function (): void { $e = new MemoryEnvironment(); $s = service($e); $d = $s->createDraft(1, 'draft', Fixtures::parameters()); $d = $s->validate(1, $d->id, $d->revision); $e->duringEvaluation = static function () use ($e): void { $e->authorized = false; }; rejects(fn() => $s->replay(1, $d->id, $d->revision), RuntimeException::class); check($e->draft($d->id)?->replay === null); });
test('Active pointer CAS prevents overwriting a later publication', static function (): void { $e = new MemoryEnvironment(); $a = ready($e, 'draft-a'); $p = Fixtures::parameters(); $p['minimum_match_score'] = .4; $b = ready($e, 'draft-b', $p); $active = service($e)->publish(1, $a->id, $a->revision, null); rejects(fn() => service($e)->publish(1, $b->id, $b->revision, null), RuntimeException::class); check($e->active()?->version === $active->version); });
test('Rollback reruns validation and actual synthetic suite', static function (): void { $e = new MemoryEnvironment(); $s = service($e); $a = ready($e, 'draft-a'); $original = $s->publish(1, $a->id, $a->revision, null); $p = Fixtures::parameters(); $p['minimum_match_score'] = .4; $b = ready($e, 'draft-b', $p); $current = $s->publish(1, $b->id, $b->revision, $original->version); $count = $e->evaluations; $restored = $s->rollback(1, $original->version, 'rollback-draft', $current->version); check($e->evaluations === $count + 4 && $restored->version !== $original->version && $restored->parameters === $original->parameters && $e->active()?->version === $restored->version); });
test('Rollback refuses historical incompatible schema', static function (): void { $e = new MemoryEnvironment(); $d = ready($e); $p = service($e)->publish(1, $d->id, $d->revision, null); unset($e->catalog['fields']['synthetic_topics']); rejects(fn() => service($e)->rollback(1, $p->version, 'rollback-invalid', $p->version)); check($e->active()?->version === $p->version); });
test('Management permission is explicit and checked', static function (): void { $e = new MemoryEnvironment(); $e->authorized = false; rejects(fn() => service($e)->createDraft(1, 'denied', Fixtures::parameters()), RuntimeException::class); check($e->drafts === []); });
test('Create rechecks access inside transaction', static function (): void { $e = new MemoryEnvironment(); $e->duringTransaction = static function () use ($e): void { $e->authorized = false; }; rejects(fn() => service($e)->createDraft(1, 'revoked-create', Fixtures::parameters()), RuntimeException::class); check($e->drafts === []); });
test('Edit rechecks access after draft read', static function (): void { $e = new MemoryEnvironment(); $d = service($e)->createDraft(1, 'revoked-edit', Fixtures::parameters()); $e->duringDraftRead = static function () use ($e): void { $e->authorized = false; }; rejects(fn() => service($e)->edit(1, $d->id, $d->revision, Fixtures::parameters()), RuntimeException::class); check($e->draft($d->id)?->revision === 1); });
foreach (['validate', 'publish'] as $operation) { test(ucfirst($operation) . ' rechecks access after catalog I/O', static function () use ($operation): void {
    $e = new MemoryEnvironment(); $d = $operation === 'publish' ? ready($e) : service($e)->createDraft(1, 'revoked-validate', Fixtures::parameters());
    $catalog = new class($e) implements \humhub\modules\matcherRecommendation\contracts\ports\ProfileFieldCatalog {
        public function __construct(private MemoryEnvironment $environment) {}
        public function read(): array { $this->environment->authorized = false; return $this->environment->catalog; }
    };
    $s = new PolicyLifecycle($e, $catalog, $e, $e, $e);
    rejects(fn() => $operation === 'publish' ? $s->publish(1, $d->id, $d->revision, null) : $s->validate(1, $d->id, $d->revision), RuntimeException::class);
    check($e->active() === null && $e->draft($d->id)?->revision === $d->revision);
}); }
test('Publish rechecks access after suite I/O', static function (): void {
    $e = new MemoryEnvironment(); $d = ready($e);
    $suites = new class($e) implements \humhub\modules\matcherRecommendation\contracts\ports\PolicyReplaySuiteProvider {
        public function __construct(private MemoryEnvironment $environment) {}
        public function current(): ReplaySuite { $this->environment->authorized = false; return $this->environment->suite; }
    };
    rejects(fn() => (new PolicyLifecycle($e, $e, $suites, $e, $e))->publish(1, $d->id, $d->revision, null), RuntimeException::class); check($e->active() === null);
});
test('Memory transaction restores writes after failure', static function (): void { $e = new MemoryEnvironment(); rejects(function () use ($e): void { $e->transaction(function () use ($e): void { service($e)->createDraft(1, 'rolled-back', Fixtures::parameters()); throw new RuntimeException('Synthetic rollback'); }); }, RuntimeException::class); check($e->drafts === []); });

restore_error_handler();
echo json_encode(['status' => $failures === [] ? 'passed' : 'failed', 'scope' => 'Pure synthetic configuration, projection, actual rule replay and memory publication; no production storage/HTTP/model.', 'passed' => count($checks), 'failed' => count($failures), 'checks' => $checks, 'failures' => $failures], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
exit($failures === [] ? 0 : 1);
