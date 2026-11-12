<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/support/autoload.php';

use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CurrentEventContext, EvidenceRef, ProjectionVersions};
use humhub\modules\matcherRecommendation\domain\analysis\{AnalysisMapping, CooperationAnalyzer};

$checks = [];
function checkAnalysis(bool $ok, string $label): void
{
    global $checks; if (!$ok) { throw new RuntimeException('FAIL: ' . $label); } $checks[] = $label;
}
function rejectsAnalysis(callable $operation, string $label): void
{
    try { $operation(); } catch (InvalidArgumentException) { checkAnalysis(true, $label); return; }
    throw new RuntimeException('FAIL: did not reject ' . $label);
}
function analysisProjection(string $id, array $values = [], int $space = 7, array $scopeOverrides = [], int $schema = 2, bool $withEventVersion = true): CandidateProjection
{
    $scopes = ['global' => ['revision' => 4, 'permission_version' => 2]];
    if ($withEventVersion) { $scopes['space:' . $space] = ['revision' => 6, 'permission_version' => 3]; }
    $versions = new ProjectionVersions($scopes, $schema, 'synthetic-analysis-purpose-v1', 1);
    $eventKeys = ['offer_skills', 'need_skills', 'offer_roles', 'need_roles', 'times', 'modes'];
    $features = [];
    foreach ($values as $feature => $value) {
        $scope = $scopeOverrides[$feature] ?? (in_array($feature, $eventKeys, true) ? 'space:' . $space : 'global');
        $version = $scopes[$scope];
        $features[$feature] = ['value' => $value, 'evidence' => [new EvidenceRef('person', $id, 'profile_attribute', 'synthetic-' . $id . '-' . $feature, $scope, $version['revision'], $version['permission_version'])]];
    }
    return new CandidateProjection('person', $id, $space, $versions, $features);
}
function analysisMapping(array $changes = []): AnalysisMapping
{
    return new AnalysisMapping('analysis-fixture-v1', 2, array_replace([
        'topics' => ['directions'], 'capability_skills' => ['skills'],
        'offered_skills' => ['offer_skills'], 'needed_skills' => ['need_skills'],
        'offered_roles' => ['offer_roles'], 'needed_roles' => ['need_roles'],
        'availability' => ['times'], 'collaboration_modes' => ['modes'],
        'communication_preferences' => ['communication'],
    ], $changes));
}
function analysisWindow(string $start = '2026-11-14T14:00:00+08:00', string $end = '2026-11-14T18:00:00+08:00'): array
{ return ['starts_at' => $start, 'ends_at' => $end]; }
function analyzePair(array $self, array $candidate, ?AnalysisMapping $mapping = null): array
{
    return (new CooperationAnalyzer())->analyze(new CurrentEventContext(1, 7, 'synthetic-membership-v1', 'event-policy-v1'), analysisProjection('1', $self), analysisProjection('2', $candidate), $mapping ?? analysisMapping());
}
function dimension(array $view, string $name): array
{
    foreach ($view['dimensions'] as $row) { if ($row['dimension'] === $name) { return $row; } }
    throw new RuntimeException('Missing dimension: ' . $name);
}

$analyzer = new CooperationAnalyzer(); $context = new CurrentEventContext(1, 7, 'synthetic-membership-v1', 'event-policy-v1'); $mapping = analysisMapping();
$empty = analyzePair([], []);
checkAnalysis(count($empty['dimensions']) === 5, 'empty profiles retain exactly five explanation dimensions');
foreach ($empty['dimensions'] as $row) {
    checkAnalysis($row['status'] === 'unknown' && $row['evidence'] === [], 'missing evidence stays unknown: ' . $row['dimension']);
    checkAnalysis($row['explanation_source'] === 'rules' && !$row['eligibility_decision'], 'explanation is not a decision: ' . $row['dimension']);
}
checkAnalysis(!array_key_exists('score', $empty) && !array_key_exists('qualifies', $empty) && $empty['hard_conditions_checked'] === false, 'analysis cannot replace the ranking or hard-condition evaluator');
checkAnalysis($empty['usage'] === 'internal_explanation_only' && $empty['authorization'] === 'caller_must_revalidate', 'internal output explicitly is not authorization');
checkAnalysis($empty['basis_version']['mapping_version'] === $mapping->version && $empty['basis_version']['self']['scopes']['space:7']['permission_version'] === 3, 'mapping and scope revisions are retained');

$needs = ['need_skills' => ['backend']];
$skillOnly = dimension(analyzePair($needs, ['skills' => ['backend']]), 'contribution_capability');
checkAnalysis($skillOnly['status'] === 'partial' && $skillOnly['facts']['current_contribution']['status'] === 'unknown', 'capability alone does not assert this-event willingness');
$offerOnly = dimension(analyzePair($needs, ['offer_skills' => ['backend']]), 'contribution_capability');
checkAnalysis($offerOnly['status'] === 'partial' && $offerOnly['facts']['capability']['status'] === 'unknown', 'willingness alone does not invent experience');
$full = dimension(analyzePair($needs, ['skills' => ['backend'], 'offer_skills' => ['backend']]), 'contribution_capability');
checkAnalysis($full['status'] === 'supported' && count($full['evidence']) === 3, 'capability plus current offer supports a recorded need');
$subjects = array_values(array_unique(array_column($full['evidence'], 'subject'))); sort($subjects);
checkAnalysis($subjects === ['candidate', 'self'], 'both subjects appear in the explanation evidence');
foreach ($full['evidence'] as $row) {
    checkAnalysis($row['target_id'] === ($row['subject'] === 'self' ? '1' : '2'), 'evidence subject remains bound to its owner');
    checkAnalysis(isset($row['reference']['contentRevision'], $row['reference']['permissionVersion']) && $row['attribution'] === 'feature_bundle', 'reference versions retained without pretending bundle is atom-level proof');
}
$partial = dimension(analyzePair(['need_skills' => ['backend', 'deployment']], ['skills' => ['backend'], 'offer_skills' => ['backend']]), 'contribution_capability');
checkAnalysis($partial['status'] === 'partial' && $partial['facts']['capability']['uncovered_recorded_needs'] === ['deployment'], 'partial capability is not complete need coverage');
$different = dimension(analyzePair($needs, ['skills' => ['design'], 'offer_skills' => ['design']]), 'contribution_capability');
checkAnalysis($different['status'] === 'conflict', 'known disjoint skills and offers differ from missing facts');
checkAnalysis(dimension(analyzePair([], ['skills' => ['backend'], 'offer_skills' => ['backend']]), 'contribution_capability')['status'] === 'unknown', 'no self need means no invented fit');

$role = dimension(analyzePair(['need_roles' => ['technical']], ['offer_roles' => ['technical']]), 'role_complementarity');
checkAnalysis($role['status'] === 'partial' && $role['facts']['self_to_candidate']['status'] === 'unknown', 'one-way role coverage is not bilateral complementarity');
$reciprocal = dimension(analyzePair(['offer_roles' => ['product'], 'need_roles' => ['technical']], ['offer_roles' => ['technical'], 'need_roles' => ['product']]), 'role_complementarity');
checkAnalysis($reciprocal['status'] === 'supported', 'explicit reciprocal offered and needed roles support complementarity');
$duplicate = dimension(analyzePair(['offer_roles' => ['product'], 'need_roles' => ['technical']], ['offer_roles' => ['product'], 'need_roles' => ['technical']]), 'role_complementarity');
checkAnalysis($duplicate['status'] === 'conflict', 'duplicate offers do not fill either stated role gap');
checkAnalysis(dimension(analyzePair(['offer_roles' => ['product']], ['offer_roles' => ['technical']]), 'role_complementarity')['status'] === 'unknown', 'different roles alone do not earn compatibility');
$rolePartial = dimension(analyzePair(['offer_roles' => ['product'], 'need_roles' => ['technical', 'business']], ['offer_roles' => ['technical'], 'need_roles' => ['product']]), 'role_complementarity');
checkAnalysis($rolePartial['status'] === 'partial', 'partially covered reciprocal needs remain partial');

checkAnalysis(dimension(analyzePair(['directions' => ['climate']], ['directions' => ['climate']]), 'project_direction')['status'] === 'supported', 'same declared direction codes can be explained');
checkAnalysis(dimension(analyzePair(['directions' => ['climate', 'education']], ['directions' => ['climate']]), 'project_direction')['status'] === 'partial', 'one common direction does not imply identical project goals');
checkAnalysis(dimension(analyzePair(['directions' => ['climate']], ['directions' => ['finance']]), 'project_direction')['status'] === 'conflict', 'disjoint codes have an explicit no-shared-code result');
checkAnalysis(dimension(analyzePair(['directions' => ['ML']], ['directions' => ['machine_learning']]), 'project_direction')['facts']['shared_codes'] === [], 'unconfigured semantic synonyms are not inferred');
checkAnalysis(dimension(analyzePair(['directions' => ['2026', '2026']], ['directions' => ['2026']]), 'project_direction')['facts']['shared_codes'] === ['2026'], 'numeric-looking codes stay strings and duplicates do not count twice');
checkAnalysis(dimension(analyzePair(['directions' => [' BACKEND ']], ['directions' => ['backend']]), 'project_direction')['status'] === 'supported', 'literal codes normalize case and outer whitespace only');

$windows = ['times' => [analysisWindow()]];
$utc = ['times' => [analysisWindow('2026-11-14T06:00:00Z', '2026-11-14T10:00:00Z')]];
$sameTime = dimension(analyzePair($windows, $utc), 'availability');
checkAnalysis($sameTime['status'] === 'supported' && $sameTime['facts']['shared_windows'][0]['starts_at'] === '2026-11-14T06:00:00.000000Z', 'equivalent offsets yield the same UTC availability');
checkAnalysis($sameTime['facts']['hard_condition_check'] === 'not_performed', 'even equal windows do not claim hard-condition qualification');
$partialTime = dimension(analyzePair($windows, ['times' => [analysisWindow('2026-11-14T16:00:00+08:00', '2026-11-14T20:00:00+08:00')]]), 'availability');
checkAnalysis($partialTime['status'] === 'partial' && $partialTime['facts']['shared_windows'][0]['ends_at'] === '2026-11-14T10:00:00.000000Z', 'partial overlap is represented without full-coverage claim');
$adjacent = ['times' => [analysisWindow('2026-11-14T14:00:00+08:00', '2026-11-14T16:00:00+08:00'), analysisWindow('2026-11-14T16:00:00+08:00', '2026-11-14T18:00:00+08:00')]];
checkAnalysis(dimension(analyzePair($windows, $adjacent), 'availability')['status'] === 'supported', 'adjacent windows are merged before comparison');
checkAnalysis(dimension(analyzePair($windows, ['times' => [analysisWindow('2026-11-14T18:00:00+08:00', '2026-11-14T19:00:00+08:00')]]), 'availability')['status'] === 'conflict', 'touching endpoints alone have no usable overlap');
$micro = ['times' => [analysisWindow('2026-11-14T00:00:00.000001Z', '2026-11-14T00:00:00.000002Z')]];
checkAnalysis(dimension(analyzePair($micro, $micro), 'availability')['facts']['shared_windows'][0]['ends_at'] === '2026-11-14T00:00:00.000002Z', 'microseconds are not rounded into zero-length intervals');
$dst = ['times' => [analysisWindow('2026-03-08T01:30:00-05:00', '2026-03-08T03:30:00-04:00') + ['timezone' => 'America/New_York']]];
$dstUtc = ['times' => [analysisWindow('2026-03-08T06:30:00Z', '2026-03-08T07:30:00Z')]];
checkAnalysis(dimension(analyzePair($dst, $dstUtc), 'availability')['status'] === 'supported', 'DST interval honors both explicit offsets and named zone');
$namedUtc = ['times' => [analysisWindow('2026-11-14T06:00:00Z', '2026-11-14T10:00:00Z') + ['timezone' => 'UTC']]];
checkAnalysis(dimension(analyzePair($windows, $namedUtc), 'availability')['status'] === 'supported', 'a named UTC zone agrees with explicit UTC offsets');
$splitGap = ['times' => [analysisWindow('2026-11-14T14:00:00+08:00', '2026-11-14T15:00:00+08:00'), analysisWindow('2026-11-14T17:00:00+08:00', '2026-11-14T18:00:00+08:00')]];
$gapRow = dimension(analyzePair($windows, $splitGap), 'availability');
checkAnalysis($gapRow['status'] === 'partial' && count($gapRow['facts']['shared_windows']) === 2, 'a real gap between available windows is never filled');
$historical = ['times' => [analysisWindow('1969-12-31T23:59:59.999998Z', '1969-12-31T23:59:59.999999Z')]];
checkAnalysis(dimension(analyzePair($historical, $historical), 'availability')['facts']['shared_windows'][0]['starts_at'] === '1969-12-31T23:59:59.999998Z', 'UTC serialization preserves negative epoch microseconds');

$arrangements = ['modes' => ['online'], 'communication' => ['async']];
checkAnalysis(dimension(analyzePair($arrangements, $arrangements), 'collaboration_arrangements')['status'] === 'supported', 'mode and communication overlap support an arrangement');
checkAnalysis(dimension(analyzePair(['modes' => ['online']], ['modes' => ['online']]), 'collaboration_arrangements')['status'] === 'partial', 'matching mode with unknown communication stays partial');
$differentMode = dimension(analyzePair($arrangements, ['modes' => ['onsite'], 'communication' => ['async']]), 'collaboration_arrangements');
checkAnalysis($differentMode['status'] === 'conflict' && $differentMode['facts']['collaboration_modes']['shared_codes'] === [], 'different modes remain a point to discuss, not a rank decision');
$ignored = analyzePair(['self_type' => ['INTJ']], ['self_type' => ['ENFP'], 'activity_count' => [999], 'music' => ['rock'], 'hiking' => ['weekends']]);
checkAnalysis($ignored['dimensions'] === $empty['dimensions'], 'unmapped personality activity and hobbies do not create fit');
$emptyCodes = dimension(analyzePair(['directions' => []], ['directions' => []]), 'project_direction');
checkAnalysis($emptyCodes['status'] === 'unknown' && $emptyCodes['evidence'] === [], 'empty collections do not become positive or negative evidence');

$customMap = new AnalysisMapping('custom-meaning-v1', 2, ['topics' => ['custom_direction']]);
$custom = analyzePair(['custom_direction' => ['robotics']], ['custom_direction' => ['robotics']], $customMap);
checkAnalysis(dimension($custom, 'project_direction')['status'] === 'supported', 'feature remapping works without P1 field names');
checkAnalysis(dimension($custom, 'role_complementarity')['status'] === 'unknown', 'unconfigured semantics stay unknown');
checkAnalysis(analyzePair(['custom_direction' => ['robotics']], ['custom_direction' => ['robotics']], new AnalysisMapping('none-v1', 2, []))['dimensions'] === $empty['dimensions'], 'removed mappings do not fall back to assumed field names');
$reordered = new AnalysisMapping($mapping->version, 2, array_reverse($mapping->bindings, true));
checkAnalysis($mapping->fingerprint() === $reordered->fingerprint(), 'mapping fingerprint ignores object key order');
checkAnalysis($mapping->fingerprint() !== (new AnalysisMapping('new-version', 2, $mapping->bindings))->fingerprint(), 'mapping changes alter the analysis basis');
$customRoles = new AnalysisMapping('custom-roles-v1', 2, ['offered_roles' => ['new_offer'], 'needed_roles' => ['new_need']]);
$customSelf = analysisProjection('1', ['new_offer' => ['product'], 'new_need' => ['technical']], scopeOverrides: ['new_offer' => 'space:7', 'new_need' => 'space:7']);
$customCandidate = analysisProjection('2', ['new_offer' => ['technical'], 'new_need' => ['product']], scopeOverrides: ['new_offer' => 'space:7', 'new_need' => 'space:7']);
checkAnalysis(dimension($analyzer->analyze($context, $customSelf, $customCandidate, $customRoles), 'role_complementarity')['status'] === 'supported', 'event semantics also support reviewed logical renaming');
$changedVersion = new CandidateProjection('person', '2', 7, new ProjectionVersions(['global' => ['revision' => 4, 'permission_version' => 2], 'space:7' => ['revision' => 6, 'permission_version' => 3]], 2, 'synthetic-analysis-purpose-v1', 2), []);
checkAnalysis($analyzer->analyze($context, analysisProjection('1'), $changedVersion, $mapping)['basis_version']['candidate']['identityVersion'] === 2, 'basis retains changed candidate identity version');

rejectsAnalysis(fn() => $analyzer->analyze($context, analysisProjection('3'), analysisProjection('2'), $mapping), 'reject wrong self identity');
rejectsAnalysis(fn() => $analyzer->analyze($context, analysisProjection('1'), analysisProjection('1'), $mapping), 'reject self as candidate');
rejectsAnalysis(fn() => $analyzer->analyze($context, analysisProjection('1'), analysisProjection('02'), $mapping), 'reject noncanonical candidate identity');
rejectsAnalysis(fn() => $analyzer->analyze($context, analysisProjection('1'), new CandidateProjection('idea', '2', 7, analysisProjection('2')->versions, []), $mapping), 'reject idea projection in person cooperation analysis');
rejectsAnalysis(fn() => $analyzer->analyze($context, analysisProjection('1', space: 8), analysisProjection('2'), $mapping), 'reject self in another activity');
rejectsAnalysis(fn() => $analyzer->analyze($context, analysisProjection('1'), analysisProjection('2', space: 8), $mapping), 'reject candidate in another activity');
rejectsAnalysis(fn() => $analyzer->analyze($context, analysisProjection('1', withEventVersion: false), analysisProjection('2'), $mapping), 'require self current-activity revision');
rejectsAnalysis(fn() => $analyzer->analyze($context, analysisProjection('1'), analysisProjection('2', withEventVersion: false), $mapping), 'require candidate current-activity revision');
rejectsAnalysis(fn() => $analyzer->analyze($context, analysisProjection('1'), analysisProjection('2', schema: 3), $mapping), 'changed candidate schema requires review');
rejectsAnalysis(fn() => $analyzer->analyze($context, analysisProjection('1', schema: 3), analysisProjection('2'), $mapping), 'changed self schema requires review');
rejectsAnalysis(fn() => $analyzer->analyze($context, analysisProjection('1'), analysisProjection('2', ['offer_skills' => ['backend']], scopeOverrides: ['offer_skills' => 'global']), $mapping), 'global skill cannot become a current-event offer');
rejectsAnalysis(fn() => $analyzer->analyze($context, analysisProjection('1', ['need_roles' => ['technical']], scopeOverrides: ['need_roles' => 'global']), analysisProjection('2'), $mapping), 'global preference cannot become this-event need');
$badVersions = new ProjectionVersions(['global' => ['revision' => 4, 'permission_version' => 2], 'space:8' => ['revision' => 6, 'permission_version' => 3]], 2, 'synthetic-v1');
rejectsAnalysis(fn() => new CandidateProjection('person', '2', 7, $badVersions, []), 'reject embedded other-activity versions');
$goodVersions = analysisProjection('2')->versions;
rejectsAnalysis(fn() => new CandidateProjection('person', '2', 7, $goodVersions, ['skills' => ['value' => ['backend'], 'evidence' => [new EvidenceRef('person', '3', 'profile_attribute', 'synthetic-wrong', 'global', 4, 2)]]]), 'reject wrong evidence owner');
rejectsAnalysis(fn() => new CandidateProjection('person', '2', 7, $goodVersions, ['skills' => ['value' => ['backend'], 'evidence' => [new EvidenceRef('person', '2', 'profile_attribute', 'synthetic-old', 'global', 3, 2)]]]), 'reject stale evidence revision');
rejectsAnalysis(fn() => new CandidateProjection('person', '2', 7, $goodVersions, ['skills' => ['value' => ['backend'], 'evidence' => [new EvidenceRef('person', '2', 'profile_attribute', 'synthetic-old', 'global', 4, 1)]]]), 'reject stale evidence permission version');

foreach ([['mbti' => ['personality']], ['topics' => []], ['topics' => 'directions'],
    ['topics' => ['same'], 'capability_skills' => ['same']], ['topics' => ['same', 'same']],
    ['topics' => [1]], ['topics' => ['not a stable feature']], ['topics' => array_fill(0, 9, 'x')],
] as $index => $badMap) { rejectsAnalysis(fn() => new AnalysisMapping('test-v1', 2, $badMap), 'invalid semantic mapping ' . $index); }
rejectsAnalysis(fn() => new AnalysisMapping('test-v1', 0, []), 'reject unreviewed schema');
rejectsAnalysis(fn() => new AnalysisMapping('', 2, []), 'reject absent mapping version');
foreach (['free text', [['code' => 'backend']], [42], [''], ["bad\ncode"], [str_repeat('a', 65)], array_fill(0, 65, 'x')] as $index => $badValue) {
    rejectsAnalysis(fn() => analyzePair([], ['skills' => $badValue]), 'invalid known feature value ' . $index);
}
foreach ([
    analysisWindow('2026-11-14T14:00:00', '2026-11-14T18:00:00'),
    analysisWindow('2026-02-30T14:00:00Z', '2026-03-01T18:00:00Z'),
    analysisWindow('2026-11-14T14:00:00+15:00', '2026-11-14T18:00:00+15:00'),
    analysisWindow('2026-11-14T14:00:00-00:00', '2026-11-14T18:00:00Z'),
    analysisWindow('2026-11-14T24:00:00Z', '2026-11-15T02:00:00Z'),
    analysisWindow('2026-11-14T14:00:60Z', '2026-11-14T18:00:00Z'),
    analysisWindow('2026-11-14T18:00:00Z', '2026-11-14T14:00:00Z'),
    analysisWindow('2026-11-14T14:00:00Z', '2026-11-14T14:00:00Z'),
    analysisWindow() + ['timezone' => 'UTC'], analysisWindow() + ['timezone' => 'not-a-zone'],
    analysisWindow() + ['timezone' => null], analysisWindow() + ['hard' => true],
] as $index => $badInterval) { rejectsAnalysis(fn() => analyzePair(['times' => [$badInterval]], []), 'invalid interval or hidden constraint ' . $index); }
rejectsAnalysis(fn() => analyzePair(['times' => array_fill(0, 33, analysisWindow())], []), 'bound availability input count');

$self = analysisProjection('1', ['need_roles' => ['technical']]); $candidate = analysisProjection('2', ['offer_roles' => ['technical']]);
$before = serialize([$self, $candidate, $mapping]); $analyzer->analyze($context, $self, $candidate, $mapping);
checkAnalysis(serialize([$self, $candidate, $mapping]) === $before, 'analysis does not mutate projections or mapping');
checkAnalysis($analyzer->analyze($context, $self, $candidate, $mapping) === $analyzer->analyze($context, $self, $candidate, $mapping), 'analysis is deterministic without clock or external state');
$base = $analyzer->analyze($context, $self, $candidate, $mapping);
checkAnalysis($base['basis_version']['context'] === get_object_vars($context), 'internal basis includes viewer activity access and policy context');
$changedAccess = $analyzer->analyze(new CurrentEventContext(1, 7, 'synthetic-membership-v2', 'event-policy-v1'), $self, $candidate, $mapping);
checkAnalysis($changedAccess['basis_version'] !== $base['basis_version'] && $changedAccess['dimensions'] === $base['dimensions'], 'access-version change alters basis even when all profile facts remain unchanged');
$changedPolicy = $analyzer->analyze(new CurrentEventContext(1, 7, 'synthetic-membership-v1', 'event-policy-v2'), $self, $candidate, $mapping);
checkAnalysis($changedPolicy['basis_version'] !== $base['basis_version'] && $changedPolicy['dimensions'] === $base['dimensions'], 'event-policy change alters basis without inventing a new profile fact');
checkAnalysis($changedAccess['authorization'] === 'caller_must_revalidate' && $changedPolicy['usage'] === 'internal_explanation_only', 'versioned context is neither live authorization nor a public DTO');

echo json_encode(['status' => 'passed', 'checks' => count($checks), 'scope' => 'Unwired pure internal explanation kernel; synthetic memory only; no database, HTTP, provider or authorization validation.', 'labels' => $checks], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
