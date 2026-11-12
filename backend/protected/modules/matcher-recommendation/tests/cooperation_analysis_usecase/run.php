<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/support/autoload.php';
require_once __DIR__ . '/Fixtures.php';

use humhub\modules\matcherRecommendation\application\analysis\AnalyzeCooperation;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CurrentEventContext, EvidenceRef, ProjectionVersions};
use humhub\modules\matcherRecommendation\contracts\analysis\{CooperationAnalysisException, CooperationAnalysisRequest, SelectedSelfAttributes};
use humhub\modules\matcherRecommendation\domain\analysis\AnalysisMapping;
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;
use humhub\modules\matcherRecommendation\tests\cooperation_analysis_usecase\Fixture as F;

$checks = [];
function verifyUsecase(bool $ok, string $label): void
{ global $checks; if (!$ok) { throw new RuntimeException('FAIL: ' . $label); } $checks[] = $label; }
function rejectsUsecase(callable $run, string $label, string $reason): void
{
    try { $run(); } catch (CooperationAnalysisException $e) {
        verifyUsecase($e->reason === $reason && $e->getPrevious() === null, $label); return;
    }
    throw new RuntimeException('FAIL: did not reject ' . $label);
}
function rejectsContract(callable $run, string $label): void
{
    try { $run(); } catch (InvalidArgumentException) { verifyUsecase(true, $label); return; }
    throw new RuntimeException('FAIL: did not reject ' . $label);
}
function usecaseDimension(array $result, string $name): array
{ foreach ($result['dimensions'] as $row) { if ($row['dimension'] === $name) { return $row; } } throw new RuntimeException('Missing dimension.'); }

$f = new F(); $result = $f->run();
verifyUsecase(count($result['dimensions']) === 5 && usecaseDimension($result, 'role_complementarity')['status'] === 'supported', 'valid explicit projections produce five-dimensional internal analysis');
verifyUsecase($result['authorization'] === 'caller_must_revalidate' && $result['verification'] === 'internal_ports_rechecked', 'successful port checks do not turn result into a permission token');
verifyUsecase($f->self->reads === 2 && $f->candidates->reads === 2 && $f->catalog->reads === 2, 'each minimal projection and catalog is read before and after analysis');
verifyUsecase($f->self->assertions === 2 && $f->events->assertions === 3, 'independent selection and event checks surround analysis and result publication');
verifyUsecase($result['basis_version']['self_selection']['version'] === 1 && $result['basis_version']['catalog_fingerprint'] === $f->catalogFingerprint, 'result basis includes reviewed catalog and explicit selection version');
verifyUsecase(!array_key_exists('qualifies', $result) && !array_key_exists('score', $result) && !$result['hard_conditions_checked'], 'use case does not add qualification ranking or a hard-condition decision');
foreach ($f->candidates->requests as $request) { verifyUsecase($request->targetIds === ['2'] && $request->context->viewerId === 1 && $request->context->spaceId === 7, 'candidate reader only receives one explicit target and actual context'); }
verifyUsecase(Fingerprint::of($f->self->requests[0]) === Fingerprint::of($f->request->selfSelection), 'self reader only receives the exact selected references');

$empty = new F([]); $empty->self->projection = F::projection('1', ['unselected_private' => ['SYNTHETIC_PRIVATE_SENTINEL']]);
$emptyResult = $empty->run();
verifyUsecase($empty->self->reads === 0 && $empty->self->assertions === 2, 'empty selection invokes metadata validation only and never a self-value read');
verifyUsecase(!str_contains(json_encode($emptyResult, JSON_THROW_ON_ERROR), 'SYNTHETIC_PRIVATE_SENTINEL'), 'unselected self material never enters analysis output');
foreach ($emptyResult['dimensions'] as $row) { verifyUsecase($row['status'] === 'unknown', 'empty self selection keeps unsupported comparison unknown: ' . $row['dimension']); }
$empty->self->onAssert = static function(int $n): void { if ($n === 3) { throw new CooperationAnalysisException('selection_unavailable'); } };
rejectsUsecase(fn() => $empty->run(), 'empty selection still requires a current authoritative reference', 'selection_unavailable');

$f = new F(); rejectsUsecase(fn() => $f->usecase->execute(3, $f->request), 'server actor cannot be replaced by requested actor', 'invalid_request');
verifyUsecase($f->events->resolves === 0 && $f->candidates->reads === 0 && $f->self->reads === 0, 'wrong actor is rejected before dependency reads');
foreach ([new CurrentEventContext(2, 7, 'access-v1', 'event-policy-v1'), new CurrentEventContext(1, 8, 'access-v1', 'event-policy-v1'), new CurrentEventContext(1, 7, 'access-v2', 'event-policy-v1'), new CurrentEventContext(1, 7, 'access-v1', 'event-policy-v2')] as $i => $context) {
    $f = new F(); $f->events->current = $context;
    rejectsUsecase(fn() => $f->run(), 'resolved context must match actor activity access and policy snapshot ' . $i, 'context_changed');
    verifyUsecase($f->self->reads === 0 && $f->candidates->reads === 0, 'context mismatch prevents profile reads ' . $i);
}
foreach ([1, 2, 3] as $at) {
    $f = new F(); $f->events->onAssert = static function(int $n, $port) use ($at): void { if ($n === $at) { $port->current = new CurrentEventContext(1, 7, 'revoked-access', 'event-policy-v1'); } };
    rejectsUsecase(fn() => $f->run(), 'observed activity revocation prevents publishing at event check ' . $at, 'context_changed');
}

$f = new F(); $f->request = new CooperationAnalysisRequest($f->request->expectedContext, '2', $f->request->expectedCandidateVersions, $f->request->selfSelection, str_repeat('a', 64));
rejectsUsecase(fn() => $f->run(), 'wrong requested mapping fingerprint rejects before projection reads', 'mapping_changed');
verifyUsecase($f->self->reads === 0 && $f->candidates->reads === 0, 'wrong mapping never reads profile data');
foreach (['shape', 'scope', 'cardinality', 'schema', 'removed'] as $kind) {
    $f = new F();
    if ($kind === 'shape') { $f->catalog->value['fields']['reviewed_field']['value_schema']['maxLength'] = 65; }
    elseif ($kind === 'scope') { $f->catalog->value['fields']['reviewed_field']['scope'] = 'event'; }
    elseif ($kind === 'cardinality') { $f->catalog->value['fields']['reviewed_field']['cardinality'] = 'one'; }
    elseif ($kind === 'schema') { $f->catalog->value['schema_version'] = 3; }
    else { unset($f->catalog->value['fields']['reviewed_field']); }
    rejectsUsecase(fn() => $f->run(), 'pre-existing directory change must not self-approve: ' . $kind, 'mapping_changed');
    verifyUsecase($f->self->reads === 0, 'directory change stops before reading selected values: ' . $kind);
}
$f = new F(); $f->catalog->onRead = static function(int $n, $port): void { if ($n === 2) { $port->value['fields']['reviewed_field']['value_schema']['maxLength'] = 65; } };
rejectsUsecase(fn() => $f->run(), 'same-schema field-shape change during analysis rejects publication', 'mapping_changed');
$f = new F(); $f->catalog->value['fields']['reviewed_field']['label'] = 'Renamed display label';
verifyUsecase($f->run()['verification'] === 'internal_ports_rechecked', 'cosmetic directory label change does not invent a schema change');
$f = new F(); $f->catalog->onRead = static function(int $n): void { if ($n === 2) { throw new RuntimeException('synthetic internal catalog failure'); } };
rejectsUsecase(fn() => $f->run(), 'final directory dependency failure is not a successful result', 'dependency_unavailable');

foreach ([1, 2] as $at) {
    $f = new F(); $f->self->onAssert = static function(int $n) use ($at): void { if ($n === $at) { throw new CooperationAnalysisException('selection_unavailable'); } };
    rejectsUsecase(fn() => $f->run(), 'independent selection authority can reject at check ' . $at, 'selection_unavailable');
}
$f = new F(); $f->self->authority = F::selection($f->self->projection, 2);
rejectsUsecase(fn() => $f->run(), 'selection version cannot be forged by an old request', 'selection_unavailable');
$f = new F(); $f->self->authority = F::selection($f->self->projection, 1, [], 'selection-replacement');
rejectsUsecase(fn() => $f->run(), 'selection string is not accepted as consent for another authority', 'selection_unavailable');
$f = new F(); $f->self->onRead = static function(int $n, $port): void { if ($n === 2) { $port->authority = F::selection($port->projection, 2, []); } };
rejectsUsecase(fn() => $f->run(), 'withdrawal of the entire selection during analysis rejects old evidence', 'selection_unavailable');
$f = new F(); $f->self->onAssert = static function(int $n): void { if ($n === 2) { throw new RuntimeException('SYNTHETIC_PRIVATE_ERROR'); } };
try { $f->run(); throw new RuntimeException('Expected failure'); } catch (CooperationAnalysisException $e) {
    verifyUsecase($e->reason === 'dependency_unavailable' && !str_contains($e->getMessage(), 'SYNTHETIC_PRIVATE_ERROR') && $e->getPrevious() === null, 'final selection exception rejects safely without private upstream text');
}
$empty = new F([]); $empty->self->onAssert = static function(int $n): void { if ($n === 2) { throw new CooperationAnalysisException('selection_unavailable'); } };
rejectsUsecase(fn() => $empty->run(), 'metadata-only selection can be revoked at final check', 'selection_unavailable');
verifyUsecase($empty->self->reads === 0, 'revoked empty selection still never reads owner values');
$f = new F(); $f->events->onAssert = static function(int $n): void { if ($n === 3) { throw new RuntimeException('SYNTHETIC_EVENT_DEPENDENCY_ERROR'); } };
rejectsUsecase(fn() => $f->run(), 'final activity authority failure rejects instead of returning a cached result', 'dependency_unavailable');

// A newly authorized reduced selection is a new analysis basis, not reuse of the previous output.
$f = new F(); $oldRequest = $f->request; $oldResult = $f->run();
$reducedValues = F::values($f->self->projection); unset($reducedValues['topics']);
$reduced = F::projection('1', $reducedValues); $newSelection = F::selection($reduced, 2);
$f->self->projection = $reduced; $f->self->authority = $newSelection;
$f->request = new CooperationAnalysisRequest($oldRequest->expectedContext, '2', $oldRequest->expectedCandidateVersions, $newSelection, $f->mapping->fingerprint());
$newResult = $f->run();
verifyUsecase(usecaseDimension($newResult, 'project_direction')['status'] === 'unknown', 'withdrawn self direction cannot remain as an explanation in a replacement selection');
verifyUsecase(!str_contains(json_encode($newResult, JSON_THROW_ON_ERROR), 'synthetic-1-topics'), 'replacement result does not expose removed self attribute reference');
verifyUsecase($newResult['basis_version']['self_selection'] !== $oldResult['basis_version']['self_selection'], 'selection replacement changes basis even when profile revisions remain unchanged');
rejectsUsecase(fn() => $f->usecase->execute(1, $oldRequest), 'old selection cannot be replayed after a legitimate replacement', 'selection_unavailable');
$emptySelection = F::selection($reduced, 3, []); $f->self->authority = $emptySelection; $beforeReads = $f->self->reads;
$f->request = new CooperationAnalysisRequest($oldRequest->expectedContext, '2', $oldRequest->expectedCandidateVersions, $emptySelection, $f->mapping->fingerprint());
$withdrawnResult = $f->run();
verifyUsecase($f->self->reads === $beforeReads && usecaseDimension($withdrawnResult, 'role_complementarity')['status'] === 'unknown', 'new authoritative empty selection does not reread previous selected values');

foreach (['global_revision', 'global_permission', 'event_revision', 'event_permission', 'schema', 'policy', 'identity'] as $key) {
    foreach (['self', 'candidate'] as $subject) {
        $f = new F(); $change = [$key => $key === 'policy' ? 'changed-purpose' : 9];
        if ($subject === 'self') { $f->self->onRead = static function(int $n, $port) use ($change): void { if ($n === 2) { $port->projection = F::projection('1', F::values($port->projection), versionChanges: $change); } }; }
        else { $f->candidates->onRead = static function(int $n, $port) use ($change): void { if ($n === 2) { $port->rows = [F::projection('2', F::values($port->rows[0]), versionChanges: $change)]; } }; }
        rejectsUsecase(fn() => $f->run(), 'reject observed ' . $subject . ' ' . $key . ' change with unchanged values', 'projection_changed');
    }
}
foreach (['self', 'candidate'] as $subject) {
    $f = new F();
    if ($subject === 'self') { $f->self->onRead = static function(int $n, $port): void { if ($n === 2) { $v = F::values($port->projection); $v['topics'] = ['changed']; $port->projection = F::projection('1', $v); } }; }
    else { $f->candidates->onRead = static function(int $n, $port): void { if ($n === 2) { $v = F::values($port->rows[0]); $v['topics'] = ['changed']; $port->rows = [F::projection('2', $v)]; } }; }
    rejectsUsecase(fn() => $f->run(), 'full ' . $subject . ' values are compared even if references and revisions stay unchanged', 'projection_changed');
}
foreach ([1, 2] as $at) {
    $f = new F(); $f->candidates->onRead = static function(int $n, $port) use ($at): void { if ($n === $at) { $port->rows = []; } };
    rejectsUsecase(fn() => $f->run(), 'candidate missing or revoked at bounded read ' . $at, 'candidate_unavailable');
}
foreach ([F::projection('3', ['topics' => ['robotics']]), F::projection('2', ['topics' => ['robotics']], 8), F::projection('1', ['topics' => ['robotics']])] as $i => $wrong) {
    $f = new F(); $f->candidates->rows = [$wrong]; rejectsUsecase(fn() => $f->run(), 'reject wrong candidate subject or activity ' . $i, 'projection_changed');
}
foreach ([F::projection('3', ['topics' => ['robotics']]), F::projection('1', ['topics' => ['robotics']], 8)] as $i => $wrong) {
    $f = new F(); $f->self->projection = $wrong; rejectsUsecase(fn() => $f->run(), 'reject wrong self subject or activity ' . $i, 'projection_changed');
}
$f = new F(); $f->candidates->rows[] = $f->candidates->rows[0]; rejectsUsecase(fn() => $f->run(), 'duplicate returned candidate is not silently deduplicated', 'projection_changed');
$f = new F(); $f->candidates->rows = [1 => $f->candidates->rows[0]]; rejectsUsecase(fn() => $f->run(), 'associative candidate output is not accepted as documented list', 'projection_changed');

$f = new F(); $v = F::values($f->self->projection); $v['unmapped_private'] = ['SYNTHETIC_UNSELECTED']; $f->self->projection = F::projection('1', $v);
rejectsUsecase(fn() => $f->run(), 'reject additional unmapped self feature instead of filtering after reading', 'projection_changed');
$f = new F(); $v = F::values($f->candidates->rows[0]); $v['unmapped_overview'] = ['SYNTHETIC_FRIENDS']; $f->candidates->rows = [F::projection('2', $v)];
rejectsUsecase(fn() => $f->run(), 'reject extra overview-like candidate feature', 'projection_changed');
$f = new F(); $p = $f->self->projection; $features = $p->features;
$features['topics']['evidence'][] = new EvidenceRef('person', '1', 'profile_attribute', 'synthetic-unselected', 'global', 4, 2);
$f->self->projection = new CandidateProjection('person', '1', 7, $p->versions, $features);
rejectsUsecase(fn() => $f->run(), 'mixed selected and unselected evidence bundle is rejected', 'selection_unavailable');
$f = new F(); $v = F::values($f->self->projection); unset($v['topics']); $f->self->projection = F::projection('1', $v);
rejectsUsecase(fn() => $f->run(), 'missing explicitly selected item is not silently replaced or ignored', 'selection_unavailable');
$f = new F(); $p = $f->self->projection;
$f->self->projection = new CandidateProjection('person', '1', 7, $p->versions, $p->features, ['unknown_unmapped']);
rejectsUsecase(fn() => $f->run(), 'unmapped unknown metadata cannot leak hidden feature existence', 'projection_changed');
$f = new F(); $p = $f->candidates->rows[0];
$f->candidates->rows = [new CandidateProjection('person', '2', 7, $p->versions, $p->features, ['unknown_unmapped'])];
rejectsUsecase(fn() => $f->run(), 'unmapped candidate metadata is also rejected before it reaches the kernel', 'projection_changed');
$f = new F(); $f->candidates->onRead = static function(int $n, $port): void {
    if ($n === 2) { $p = $port->rows[0]; $port->rows = [new CandidateProjection('person', '2', 7, $p->versions, $p->features, ['communication'])]; }
};
rejectsUsecase(fn() => $f->run(), 'complete projection comparison includes changes in known-versus-unknown declarations', 'projection_changed');
$f = new F(); $f->candidates->onRead = static function(int $n): void { if ($n === 2) { throw new RuntimeException('synthetic dependency failure'); } };
rejectsUsecase(fn() => $f->run(), 'final candidate dependency exception never becomes empty successful analysis', 'dependency_unavailable');
$f = new F(); $f->self->onRead = static function(int $n): void { if ($n === 2) { throw new RuntimeException('synthetic private upstream exception'); } };
rejectsUsecase(fn() => $f->run(), 'final self dependency exception rejects without retry', 'dependency_unavailable');
verifyUsecase($f->self->reads === 2 && $f->candidates->reads === 2, 'failure path does not spin an unbounded reread loop');

$f = new F(); $selection = $f->request->selfSelection; $ref = $selection->references[0];
rejectsContract(fn() => new SelectedSelfAttributes(2, 7, 's', 1, $selection->expectedVersions, [$ref]), 'selection reference owner must match viewer');
rejectsContract(fn() => new SelectedSelfAttributes(1, 7, 's', 1, $selection->expectedVersions, [$ref, $ref]), 'selection cannot duplicate an attribute reference');
rejectsContract(fn() => new SelectedSelfAttributes(1, 7, 's', 1, $selection->expectedVersions, [new EvidenceRef('person', '1', 'profile_attribute', 'stale-reference', 'global', 3, 2)]), 'selection cannot request a stale content revision');
rejectsContract(fn() => new SelectedSelfAttributes(1, 7, 's', 1, $selection->expectedVersions, [new EvidenceRef('person', '1', 'profile_attribute', 'stale-reference', 'global', 4, 1)]), 'selection cannot request a stale permission version');
rejectsContract(fn() => new SelectedSelfAttributes(1, 7, 's', 0, $selection->expectedVersions, []), 'selection needs an authoritative positive version');
rejectsContract(fn() => new SelectedSelfAttributes(1, 7, 's', 1, new ProjectionVersions(['global' => ['revision' => 4, 'permission_version' => 2]], 2, 'purpose-v1', 1), []), 'selection needs global and current-activity versions');
rejectsContract(fn() => new SelectedSelfAttributes(1, 7, 's', 1, new ProjectionVersions($selection->expectedVersions->scopes, 2, 'purpose-v1'), []), 'selection requires identity version');
rejectsContract(fn() => new SelectedSelfAttributes(1, 8, 's', 1, $selection->expectedVersions, []), 'selection cannot mix other-activity versions');
rejectsContract(fn() => new CooperationAnalysisRequest($f->request->expectedContext, '1', $f->request->expectedCandidateVersions, $selection, $f->mapping->fingerprint()), 'request cannot select viewer as candidate');
rejectsContract(fn() => new CooperationAnalysisRequest($f->request->expectedContext, '02', $f->request->expectedCandidateVersions, $selection, $f->mapping->fingerprint()), 'request requires canonical candidate id');
rejectsContract(fn() => new AnalyzeCooperation($f->events, $f->candidates, $f->self, $f->catalog, $f->mapping, 'dynamic-unreviewed'), 'reviewed catalog fingerprint is required at construction');

// Selection is not arbitrarily limited by the 32 logical-feature budget.
$manyRefs = []; for ($i = 0; $i < 40; $i++) { $manyRefs[] = new EvidenceRef('person', '1', 'profile_attribute', 'synthetic-topic-' . $i, 'global', 4, 2); }
$manySelf = new CandidateProjection('person', '1', 7, F::versions(), ['topics' => ['value' => ['robotics'], 'evidence' => $manyRefs]]);
$many = new F(); $many->self->projection = $manySelf; $many->self->authority = F::selection($manySelf);
$many->request = new CooperationAnalysisRequest($many->request->expectedContext, '2', $many->request->expectedCandidateVersions, $many->self->authority, $many->mapping->fingerprint());
verifyUsecase(usecaseDimension($many->run(), 'project_direction')['status'] === 'supported', '40 explicit attributes can feed one logical feature without a fabricated 32-item limit');
$reverse = new SelectedSelfAttributes(1, 7, $many->self->authority->selectionId, 1, $manySelf->versions, array_reverse($manyRefs));
verifyUsecase(Fingerprint::of($reverse) === Fingerprint::of($many->self->authority), 'selection reference order canonicalizes without changing explicit membership');
$f = new F(); $before = Fingerprint::of([$f->request, $f->self->projection, $f->candidates->rows, $f->mapping]); $f->run();
verifyUsecase($before === Fingerprint::of([$f->request, $f->self->projection, $f->candidates->rows, $f->mapping]), 'orchestration does not mutate selected snapshots projections or mapping');

echo json_encode(['status' => 'passed', 'checks' => count($checks), 'scope' => 'Unwired application orchestration with synthetic in-memory authority and projection ports; no real P1/P8 authorization, database, HTTP or model calls.', 'labels' => $checks], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
