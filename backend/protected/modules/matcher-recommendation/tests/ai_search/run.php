<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/support/autoload.php';

use humhub\modules\matcherRecommendation\application\ai\SearchAiCandidates;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CurrentEventContext, EvidenceRef, ProjectionVersions, QueryIntent};
use humhub\modules\matcherRecommendation\domain\{MatchReason, RuleAssessment, RuleDiagnostics};
use humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException;
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;
use humhub\modules\matcherRecommendation\tests\ai_search\Fixtures as F;
use humhub\modules\matcherRecommendation\tests\rules\Fixtures as R;

$checks = [];
function verify(bool $condition, string $label): void
{
    global $checks;
    if (!$condition) { throw new RuntimeException('FAIL: ' . $label); }
    $checks[] = $label;
}
function rejects(callable $action, string $reason, string $label): AiRecommendationException
{
    try { $action(); }
    catch (Throwable $error) {
        verify($error instanceof AiRecommendationException && $error->reason === $reason, $label);
        return $error;
    }
    throw new RuntimeException('FAIL: ' . $label . ' did not reject.');
}
function ids(array $matches): array { return array_map(static fn($match): string => $match->candidate->targetId, $matches); }
function syntheticDiagnostics(float $score = 1.0, array $conflicts = []): RuleDiagnostics
{
    return new RuleDiagnostics('synthetic-evaluator-1', $score, .5, 1.0, ['topic' => $score], ['topic' => 1.0], [], $conflicts, null, ['topic:robotics']);
}

// The backend tool remains useful for both small and bounded large pools; no profile or social N+1 calls.
foreach ([1, 30, 200] as $count) {
    $f = new F($count); $matches = $f->search();
    verify(count($matches) === $count, "all {$count} qualifying current-Space candidates remain available for subsequent selection");
    verify(($f->calls['recall'] ?? 0) === 1 && ($f->calls['profiles'] ?? 0) === 1
        && ($f->calls['relationships'] ?? 0) === 1 && ($f->calls['history'] ?? 0) === 1, "{$count} candidates use one recall and one batch per data source");
    foreach (['profiles', 'relationships', 'history'] as $source) {
        $request = $f->requests[$source][0];
        verify($request->context === $f->context && $request->targetType === 'person'
            && count($request->targetIds) === $count, "{$source} receives only the server-supplied context and bounded candidate IDs ({$count})");
    }
    verify(($f->calls['context'] ?? 0) === 3 && ($f->calls['policy'] ?? 0) === 2
        && ($f->calls['capability'] ?? 0) === 2, "{$count} candidate return rechecks current context, policy and history capability");
    verify(array_keys($matches[0]->relationship) === array_keys(F::relationship()), "history is not injected into DiscoveryMatch relationship ({$count})");
    for ($i = 1; $i < count($matches); ++$i) {
        if ($matches[$i - 1]->assessment->sortScore < $matches[$i]->assessment->sortScore) { throw new RuntimeException('Scores are not descending.'); }
    }
    verify(true, "{$count} results are sorted by descending rule score");
}
$f = new F(0); verify($f->search() === [], 'empty activity yields a genuine empty result');
verify(($f->calls['capability'] ?? 0) === 2 && array_intersect(['profiles', 'relationships', 'history'], array_keys($f->calls)) === [], 'empty pool still checks capability without unbounded data reads');
foreach ([0, 30] as $count) {
    $f = new F($count); $f->historyCapable = false;
    rejects(fn() => $f->search(), 'history_unavailable', "missing authoritative history fails for {$count} candidates");
    verify(!isset($f->calls['recall']) && !isset($f->calls['profiles']), 'missing history blocks before recall and profiles');
}
$f = new F(); $f->hooks['capability'] = static function (): void { throw new RuntimeException('Synthetic source unavailable.'); };
rejects(fn() => $f->search(), 'history_unavailable', 'throwing capability never becomes false history');
$f = new F(); $f->hooks['capability'] = static function (F $f, int $call): void { if ($call === 2) { $f->historyCapable = false; } };
rejects(fn() => $f->search(), 'history_unavailable', 'history capability revoked during search blocks publication');

// Explicit exclusions are checked before any scorer receives the candidate.
$f = new F(6);
foreach (['blocked', 'friend', 'pending_in', 'pending_out'] as $i => $flag) { $f->relationships[(string)(101 + $i)][$flag] = true; }
$f->histories['105']['ever_sent'] = true;
verify(ids($f->search()) === ['106'] && ($f->calls['evaluate'] ?? 0) === 1, 'blocked, friend, either pending direction and any successful sent request are excluded before scoring');
$f = new F(); $f->histories['101']['ever_sent'] = true;
verify($f->search() === [], 'terminal sent history remains an exclusion even without current pending state');

$historyMutations = [
    'missing requested entry' => static fn() => [],
    'unexpected subject' => static fn() => ['999' => F::history()],
    'additional subject' => static fn() => ['101' => F::history(), '999' => F::history()],
    'numeric false' => static fn() => ['101' => ['ever_sent' => 0, 'version' => 'v1']],
    'missing boolean' => static fn() => ['101' => ['version' => 'v1']],
    'missing version' => static fn() => ['101' => ['ever_sent' => false]],
    'invalid version' => static fn() => ['101' => ['ever_sent' => false, 'version' => '']],
    'unknown field' => static fn() => ['101' => F::history() + ['raw' => 'synthetic-private-value']],
];
foreach ($historyMutations as $label => $mutate) {
    $f = new F(); $f->histories = $mutate();
    rejects(fn() => $f->search(), 'history_unavailable', 'sent history rejects ' . $label);
    verify(!isset($f->calls['evaluate']), 'malformed sent history never reaches scorer: ' . $label);
}
$relationMutations = [
    'missing requested entry' => static fn() => [],
    'unexpected subject' => static fn() => ['999' => F::relationship()],
    'noncanonical map ID' => static fn() => ['0101' => F::relationship()],
    'numeric blocked flag' => static fn() => ['101' => array_replace(F::relationship(), ['blocked' => 0])],
    'null pending flag' => static fn() => ['101' => array_replace(F::relationship(), ['pending_in' => null])],
    'invalid version' => static fn() => ['101' => array_replace(F::relationship(), ['version' => ''])],
    'extra history field' => static fn() => ['101' => F::relationship() + ['ever_sent' => false]],
];
foreach ($relationMutations as $label => $mutate) {
    $f = new F(); $f->relationships = $mutate();
    rejects(fn() => $f->search(), 'provider_unavailable', 'relationship batch rejects ' . $label);
}

// A retriever is a bounded, structured backend port; malformed/foreign output fails instead of silently truncating.
$recallMutations = [
    'associative batch' => static fn($row) => ['unexpected' => $row],
    'duplicate ID' => static fn($row) => [$row, $row],
    'self' => static fn($row) => [array_replace($row, ['id' => '1'])],
    'leading-zero ID' => static fn($row) => [array_replace($row, ['id' => '0101'])],
    'zero ID' => static fn($row) => [array_replace($row, ['id' => '0'])],
    'negative ID' => static fn($row) => [array_replace($row, ['id' => '-1'])],
    'integer ID' => static fn($row) => [array_replace($row, ['id' => 101])],
    'overflow ID' => static fn($row) => [array_replace($row, ['id' => (string)PHP_INT_MAX . '0'])],
    'idea target' => static fn($row) => [array_replace($row, ['target_type' => 'idea'])],
    'unexpected field' => static fn($row) => [$row + ['raw_profile' => 'synthetic-private-value']],
    'missing field' => static fn($row) => [['target_type' => 'person', 'id' => '101']],
    'empty routes' => static fn($row) => [array_replace($row, ['routes' => []])],
    'unknown route' => static fn($row) => [array_replace($row, ['routes' => ['global' => 1]])],
    'disabled semantic' => static fn($row) => [array_replace($row, ['routes' => ['semantic' => 1]])],
    'zero rank' => static fn($row) => [array_replace($row, ['routes' => ['structured' => 0]])],
    'string rank' => static fn($row) => [array_replace($row, ['routes' => ['structured' => '1']])],
    'float rank' => static fn($row) => [array_replace($row, ['routes' => ['structured' => 1.0]])],
    'out-of-budget fulltext' => static fn($row) => [array_replace($row, ['routes' => ['fulltext' => 41]])],
    'out-of-budget structured' => static fn($row) => [array_replace($row, ['routes' => ['structured' => 81]])],
    'duplicate route rank' => static fn($row) => [$row, array_replace($row, ['id' => '102'])],
];
foreach ($recallMutations as $label => $mutate) {
    $f = new F(); $f->rows = $mutate($f->rows[0]);
    rejects(fn() => $f->search(), 'provider_unavailable', 'recall rejects ' . $label);
    verify(!isset($f->calls['profiles']), 'invalid recall is rejected before profile read: ' . $label);
}
$f = new F(201); rejects(fn() => $f->search(), 'provider_unavailable', 'merged recall beyond 200 is rejected');
$f = new F(30); $f->parameters['limits']['recall'] = 29;
rejects(fn() => $f->search(), 'provider_unavailable', 'policy-specific smaller recall budget is enforced');
$f = new F(2); $f->rows[0]['routes']['fulltext'] = 1; $f->rows[1]['routes']['fulltext'] = 2;
verify(count($f->search()) === 2, 'overlapping enabled routes preserve merged unique candidates');

// Projections may omit people denied by authorization, but may never add people, fields or another Space.
$f = new F(2); array_pop($f->projections); unset($f->relationships['102'], $f->histories['102']);
verify(ids($f->search()) === ['101'], 'authorization omission is respected without filling from other activities');
verify($f->requests['profiles'][0]->targetIds === ['101', '102'] && $f->requests['history'][0]->targetIds === ['101'], 'relationship and history reads include only authorized projected IDs');
$f = new F(30); $f->projections = [];
verify($f->search() === [] && !isset($f->calls['relationships']) && !isset($f->calls['history']), 'fully inaccessible projection yields empty without global fallback');
$projectionMutations = [
    'associative rows' => static fn($row) => ['101' => $row],
    'duplicate projection' => static fn($row) => [$row, $row],
    'unexpected person' => static fn($row) => [R::candidate(['topics' => ['robotics']], null, [], '999')],
    'not a DTO' => static fn($row) => [['id' => '101']],
    'cross-Space person' => static fn($row) => [new CandidateProjection('person', '101', 8, new ProjectionVersions(['global' => ['revision' => 3, 'permission_version' => 1]], 2, 'fixture-v1'), $row->features)],
    'unknown logical field' => static fn($row) => [R::candidate(['raw_bio' => 'synthetic-private-value'])],
    'unknown unknown-feature key' => static fn($row) => [new CandidateProjection('person', '101', 7, $row->versions, $row->features, ['raw_bio'])],
    'wrong evidence scope' => static fn($row) => [R::candidate(['topics' => ['robotics']], null, ['topics' => 'space:7'])],
];
foreach ($projectionMutations as $label => $mutate) {
    $f = new F(); $f->projections = $mutate($f->projections[0]);
    rejects(fn() => $f->search(), 'provider_unavailable', 'projection rejects ' . $label);
    verify(!isset($f->calls['relationships']) && !isset($f->calls['history']), 'invalid projection stops before social reads: ' . $label);
}

// Actual policy/rule semantics, not a fixture that marks every person qualified.
$f = new F(4);
$f->intent = new QueryIntent('person', [R::condition('topics', 'similarity', ['robotics']), R::condition('needs', 'supply_demand', ['backend'])]);
$f->projections = [R::candidate(['topics' => ['robotics'], 'offers' => ['backend']], null, [], '101'),
    R::candidate(['topics' => ['other'], 'offers' => ['backend']], null, [], '102'),
    R::candidate(['topics' => ['robotics'], 'offers' => ['commercial']], null, [], '103'), R::candidate([], null, [], '104')];
$matches = $f->search();
verify(ids($matches) === ['101', '102', '103'], 'similar topics and complementary declared contributions both yield evidence-backed candidates');
verify($matches[0]->assessment->diagnostics->matchScore === 1.0 && $matches[1]->assessment->diagnostics->matchScore === .5, 'true deterministic scores distinguish full and partial matches');
verify(in_array('contribution_supply', array_map(static fn($reason): string => $reason->ruleId, $matches[1]->assessment->reasons), true), 'contribution recommendation records its actual configured rule');
$f = new F(3); $f->intent = new QueryIntent('person', [R::condition('topics', 'similarity', ['robotics'], 'hard')]);
$f->projections = [R::candidate(['topics' => ['robotics']], null, [], '101'), R::candidate(['topics' => ['other']], null, [], '102'), R::candidate([], null, [], '103')];
verify(ids($f->search()) === ['101'], 'hard mismatch and hard unknown cannot qualify');
$f = new F(); $f->projections = [R::candidate([])];
verify($f->search() === [], 'unknown soft fields do not manufacture positive evidence');
$f = new F(); $f->intent = new QueryIntent('person', [R::condition('preferences', 'explicit_preference', ['async'])]); $f->projections = [R::candidate(['preferences' => ['async']])];
verify($f->search() === [], 'style alone cannot invent positive topic or contribution evidence');
$f = new F(); $f->intent = new QueryIntent('person');
verify($f->search() === [], 'empty intent produces no evidence-backed candidates');
$f = new F(); $f->projections = [R::candidate(['topics' => ['robotics' => true]])];
rejects(fn() => $f->search(), 'provider_unavailable', 'malformed provider feature value fails instead of pretending it is unknown');

$invalidIntents = [
    'unsupported idea' => new QueryIntent('idea'),
    'unexpanded selected attributes' => new QueryIntent('person', [], ['fixture-self-1']),
    'unexpanded current idea' => new QueryIntent('person', [], [], 'fixture-idea-1'),
    'unknown query feature' => new QueryIntent('person', [R::condition('raw_bio', 'similarity', ['robotics'])]),
    'unknown operator' => new QueryIntent('person', [R::condition('topics', 'guessed_personality', ['robotics'])]),
    'invalid value' => new QueryIntent('person', [R::condition('topics', 'similarity', ['topic' => 'robotics'])]),
];
foreach ($invalidIntents as $label => $intent) {
    $f = new F(0); $f->intent = $intent;
    rejects(fn() => $f->search(), 'invalid_request', 'invalid intent rejected even for empty recall: ' . $label);
    verify(!isset($f->calls['recall']), 'invalid intent stops before retriever: ' . $label);
}
$f = new F(); $f->parameters['enabled_routes'] = ['unknown'];
rejects(fn() => $f->search(), 'invalid_request', 'invalid policy is rejected by fallback deterministic validator');

// A custom scoring port must still justify its positive claims using this projection and active query rules.
foreach (['foreign_owner', 'unprojected_source', 'changed_version', 'wrong_scope', 'other_active_feature', 'inactive_rule', 'invented_rule'] as $mutation) {
    $f = new F(); $f->projections = [R::candidate(['topics' => ['robotics'], 'offers' => ['backend']])];
    $f->intent = new QueryIntent('person', [R::condition('topics', 'similarity', ['robotics']), R::condition('needs', 'supply_demand', ['backend'])]);
    $f->assessment = static function ($context, $intent, $candidate, $policy, $ranks) use ($mutation): RuleAssessment {
        $reference = $candidate->features['topics']['evidence'][0]; $rule = 'topic_similarity';
        if ($mutation === 'foreign_owner') { $reference = R::candidate(['topics' => ['robotics']], null, [], '999')->features['topics']['evidence'][0]; }
        if ($mutation === 'unprojected_source') { $reference = new EvidenceRef('person', '101', 'profile_attribute', 'not-projected', 'global', 3, 1); }
        if ($mutation === 'changed_version') { $reference = new EvidenceRef('person', '101', 'profile_attribute', $reference->sourceId, 'global', 4, 1); }
        if ($mutation === 'wrong_scope') { $reference = new EvidenceRef('person', '101', 'profile_attribute', $reference->sourceId, 'space:7', 4, 2); }
        if ($mutation === 'other_active_feature') { $reference = $candidate->features['offers']['evidence'][0]; }
        if ($mutation === 'inactive_rule') { $rule = 'skill_similarity'; }
        if ($mutation === 'invented_rule') { $rule = 'personality_guessed'; }
        return new RuleAssessment(true, .9, [new MatchReason($rule, 'Synthetic evidence check.', [$reference])], syntheticDiagnostics());
    };
    rejects(fn() => $f->search(), 'provider_unavailable', 'scorer evidence rejects ' . $mutation);
}
foreach (['missing_diagnostics', 'hard_conflict', 'below_threshold'] as $mutation) {
    $f = new F();
    $f->assessment = static function ($context, $intent, $candidate, $policy, $ranks) use ($mutation): RuleAssessment {
        $diagnostics = match ($mutation) { 'missing_diagnostics' => null, 'hard_conflict' => syntheticDiagnostics(1.0, ['topic_similarity:unknown']), 'below_threshold' => syntheticDiagnostics(.1) };
        return new RuleAssessment(true, .9, [new MatchReason('topic_similarity', 'Synthetic evidence check.', $candidate->features['topics']['evidence'])], $diagnostics);
    };
    rejects(fn() => $f->search(), 'provider_unavailable', 'qualifying assessment rejects ' . $mutation);
}

// Higher match quality beats early member IDs; exact ties have a stable key independent of input order.
$f = new F(2); $f->rows[1]['id'] = '999999'; unset($f->relationships['102'], $f->histories['102']);
$f->relationships['999999'] = F::relationship(); $f->histories['999999'] = F::history();
$f->intent = new QueryIntent('person', [R::condition('topics', 'similarity', ['robotics', 'education'])]);
$f->projections = [R::candidate(['topics' => ['robotics']], null, [], '101'), R::candidate(['topics' => ['robotics', 'education']], null, [], '999999')];
verify(ids($f->search()) === ['999999', '101'], 'later member with stronger evidence ranks before early member');
$f = new F(2); $f->rows = [['target_type' => 'person', 'id' => '20', 'routes' => ['structured' => 2, 'fulltext' => 1]], ['target_type' => 'person', 'id' => '100', 'routes' => ['structured' => 1, 'fulltext' => 2]]];
$f->parameters['route_weights']['structured'] = .3; $f->parameters['route_weights']['fulltext'] = .3;
$f->projections = [R::candidate(['topics' => ['robotics']], null, [], '20'), R::candidate(['topics' => ['robotics']], null, [], '100')];
$f->relationships = ['20' => F::relationship(), '100' => F::relationship()]; $f->histories = ['20' => F::history(), '100' => F::history()];
$matches = $f->search(); verify($matches[0]->assessment->sortScore === $matches[1]->assessment->sortScore && ids($matches) === ['100', '20'], 'exact ties use canonical string ID ordering');
$f->rows = array_reverse($f->rows); $f->projections = array_reverse($f->projections);
verify(ids($f->search()) === ['100', '20'], 'stable ties ignore retriever and projection enumeration order');

// State races cannot produce a successful publication; policy equality covers parameters as well as version.
foreach ([1, 2, 3] as $at) {
    $f = new F(); $f->hooks['context'] = static function (F $f, int $call) use ($at): void { if ($call === $at) { throw new RuntimeException('Synthetic membership revoked.'); } };
    rejects(fn() => $f->search(), 'context_invalidated', "current-Space validation failure at checkpoint {$at} is rejected");
}
$f = new F(); $f->hooks['profiles'] = static function (F $f): void { $f->context = new CurrentEventContext(1, 8, 'access-fixture-2', 'event-fixture-2'); };
rejects(fn() => $f->service()->search(R::context(), $f->intent), 'context_invalidated', 'current activity changed during read cannot return previous-Space candidates');
foreach (['version', 'parameters'] as $mutation) {
    $f = new F(); $f->hooks['policy'] = static function (F $f, int $call) use ($mutation): void {
        if ($call === 2) { if ($mutation === 'version') { $f->policyVersion = 'synthetic-ai-search-v2'; } else { $f->parameters['minimum_match_score'] = .36; } }
    };
    rejects(fn() => $f->search(), 'context_invalidated', 'policy mutation during search invalidates ' . $mutation);
}
foreach (['recall', 'profiles', 'relationships', 'history', 'evaluate', 'policy'] as $stage) {
    $f = new F(); $f->hooks[$stage] = static function (): void { throw new RuntimeException('synthetic-private-marker-from-upstream'); };
    $error = rejects(fn() => $f->search(), $stage === 'history' ? 'history_unavailable' : 'provider_unavailable', $stage . ' failure does not become an empty successful result');
    verify($error->getPrevious() === null && !str_contains((string)$error, 'synthetic-private-marker-from-upstream'), $stage . ' public error drops sensitive upstream text and chain');
}
$f = new F(); $f->intent = new QueryIntent('person', [R::condition('topics', 'similarity', ['synthetic-private-intent-marker'])]);
$f->hooks['profiles'] = static function (): void { throw new RuntimeException('Synthetic failure.'); };
$error = rejects(fn() => $f->search(), 'provider_unavailable', 'sensitive intent failure is wrapped');
verify(!str_contains((string)$error, 'synthetic-private-intent-marker'), 'serialized public exception contains no query text');
$searchReflection = new ReflectionMethod(SearchAiCandidates::class, 'search');
verify(count($searchReflection->getParameters()[1]->getAttributes(SensitiveParameter::class)) === 1, 'public search intent is sensitive in PHP exception traces');
$constructorTypes = array_map(static fn(ReflectionParameter $parameter): string => (string)$parameter->getType(), (new ReflectionMethod(SearchAiCandidates::class, '__construct'))->getParameters());
verify(count($constructorTypes) === 6 && count(array_filter($constructorTypes, static fn(string $type): bool => str_contains($type, '\\contracts\\ports\\'))) === 6, 'search depends on six core ports and has no model, SQL or batch writer dependency');

echo json_encode(['suite' => 'ai_search', 'checks' => count($checks), 'status' => 'passed', 'network_calls' => 0, 'database_connections' => 0], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL;
