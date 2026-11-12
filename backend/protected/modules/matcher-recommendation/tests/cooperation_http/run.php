<?php
declare(strict_types=1);
require dirname(__DIR__) . '/support/autoload.php';
use humhub\modules\matcherRecommendation\adapters\analysis\{CooperationHttpInput, CooperationHttpView};
use humhub\modules\matcherRecommendation\adapters\composition\ReviewedCooperationConfiguration;
use humhub\modules\matcherRecommendation\adapters\profile\{P1CooperationPurposePolicy, P1FieldCatalogAdapter};
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CurrentEventContext, EvidenceRef, ProjectionVersions};
use humhub\modules\matcherRecommendation\domain\analysis\CooperationAnalyzer;
use humhub\modules\matcherRecommendation\domain\config\PolicyValidator;
$labels = [];
$check = static function (bool $ok, string $label) use (&$labels): void { if (!$ok) { throw new RuntimeException($label); } $labels[] = $label; };
$reject = static function (callable $run, string $label) use ($check): void { try { $run(); } catch (Throwable) { $check(true, $label); return; } $check(false, $label); };
$decode = static fn(array $value): stdClass => json_decode(json_encode($value, JSON_THROW_ON_ERROR), false, 12, JSON_THROW_ON_ERROR);
$context = ['selection_revision' => 'selection-' . str_repeat('a', 32), 'access_version' => 'synthetic-context'];
$valid = ['attribute_ids' => [], 'expected_selection_version' => 0, 'expected_current_event' => $context];
$check(CooperationHttpInput::selection($decode($valid)) === $valid, 'Explicit empty selection is a valid initial request');
$missingContext = $valid; unset($missingContext['expected_current_event']);
$reject(fn() => CooperationHttpInput::selection($decode($missingContext)), 'A selection write requires an explicit current-event precondition');
foreach ([[], ['selection_revision' => 'old', 'access_version' => 'a'], ['selection_revision' => $context['selection_revision'], 'access_version' => '']] as $badContext) {
    $bad = $valid; $bad['expected_current_event'] = $badContext;
    $reject(fn() => CooperationHttpInput::selection($decode($bad)), 'Reject malformed event precondition ' . count($labels));
}
foreach (['owner_id', 'space_id', 'consent', 'references', 'profile_versions'] as $field) {
    $reject(fn() => CooperationHttpInput::selection($decode($valid + [$field => 'injected'])), 'Reject client authority field ' . $field);
}
foreach ([-1, true, '0', 0.5] as $version) {
    $reject(fn() => CooperationHttpInput::selection($decode(['attribute_ids' => [], 'expected_selection_version' => $version, 'expected_current_event' => $context])), 'Reject non-integer selection version ' . json_encode($version));
}
foreach ([['same', 'same'], [''], [str_repeat('x', 129)], [12], ['id' . chr(10) . 'tail']] as $ids) {
    $reject(fn() => CooperationHttpInput::selection($decode(['attribute_ids' => $ids, 'expected_selection_version' => 0, 'expected_current_event' => $context])), 'Reject malformed selected identifier set ' . count($labels));
}
$reject(fn() => CooperationHttpInput::selection((object)['attribute_ids' => (object)[], 'expected_selection_version' => 0, 'expected_current_event' => (object)$context]), 'Empty object is not an ID list');
$ids = array_map(fn(int $n): string => 'synthetic-attribute-' . $n, range(1, 40));
$check(count(CooperationHttpInput::selection($decode(['attribute_ids' => $ids, 'expected_selection_version' => 4, 'expected_current_event' => $context]))['attribute_ids']) === 40, 'No artificial 32-attribute transport cap');
$expected = ['global' => ['revision' => 3, 'permission_version' => 4], 'space' => ['revision' => 5, 'permission_version' => 6],
    'identity_version' => 2, 'discovery_version' => 3, 'privacy_policy_version' => 's3-2026-11-11:discovery-fields-v2'];
$body = ['expected_selection_version' => 1, 'expected_candidate' => $expected, 'expected_current_event' => $context];
$check(CooperationHttpInput::analysis($decode($body)) === $body, 'Ordinary card snapshot has one strict public shape');
$reject(fn() => CooperationHttpInput::analysis($decode($body + ['owner_id' => 2])), 'Candidate is selected by the route, not a duplicate body owner');
foreach (['identity_version' => -1, 'discovery_version' => '3', 'privacy_policy_version' => ''] as $field => $bad) {
    $value = $body; $value['expected_candidate'][$field] = $bad;
    $reject(fn() => CooperationHttpInput::analysis($decode($value)), 'Reject malformed candidate snapshot ' . $field);
}
$value = $body; $value['expected_candidate']['global']['grant'] = true;
$reject(fn() => CooperationHttpInput::analysis($decode($value)), 'Reject nested grant injection');
$value = $body; unset($value['expected_candidate']['space']['permission_version']);
$reject(fn() => CooperationHttpInput::analysis($decode($value)), 'Require complete permission versions');
$mapping = ReviewedCooperationConfiguration::mapping();
(new P1CooperationPurposePolicy())->assertBindings($mapping, ReviewedCooperationConfiguration::bindings());
$check($mapping->features('topics') === ['directions'], 'Project direction configuration excludes hobbies and event goals');
$versions = new ProjectionVersions(['global' => ['revision' => 3, 'permission_version' => 4], 'space:7' => ['revision' => 5, 'permission_version' => 6]], 2, 'synthetic-analysis-policy', 2);
$ref = static fn(string $owner, string $id, string $scope): EvidenceRef => new EvidenceRef('person', $owner, 'profile_attribute', $id, $scope, $scope === 'global' ? 3 : 5, $scope === 'global' ? 4 : 6);
$self = new CandidateProjection('person', '1', 7, $versions, ['needed_skills' => ['value' => ['php'], 'evidence' => [$ref('1', 'self-need', 'space:7')]]]);
$candidate = new CandidateProjection('person', '2', 7, $versions, [
    'project_skills' => ['value' => ['php'], 'evidence' => [$ref('2', 'candidate-project', 'global')]],
    'offered_skills' => ['value' => ['php'], 'evidence' => [$ref('2', 'candidate-offer', 'space:7')]],
]);
$result = (new CooperationAnalyzer())->analyze(new CurrentEventContext(1, 7, 'synthetic-access', 'synthetic-policy'), $self, $candidate, $mapping);
$result['basis_version']['private_debug'] = 'must-never-leak';
$result['dimensions'][0]['facts']['capability']['private_debug'] = 'must-never-leak';
$public = CooperationHttpView::analysis($result, 4);
$check(count($public['dimensions']) === 5 && $public['candidate_id'] === 2, 'Public analysis uses exact five dimensions and numeric owner');
$check($public['dimensions'][0]['status'] === 'supported' && $public['dimensions'][0]['facts']['capability']['matched'] === ['php'], 'Actual matched facts survive the public projection');
$sides = array_values(array_unique(array_column($public['dimensions'][0]['evidence'], 'subject'))); sort($sides);
$check($sides === ['candidate', 'self'], 'Public evidence keeps which side supplied the fact');
$json = json_encode($public, JSON_THROW_ON_ERROR);
foreach (['must-never-leak', 'basis_version', 'authorization', 'mapping_fingerprint', 'selection_id', 'sourceKind', 'feature_bundle'] as $forbidden) {
    $check(!str_contains($json, $forbidden), 'Public response excludes internal ' . $forbidden);
}
$check($public['hard_conditions_checked'] === false && $public['explanation_source'] === 'rules', 'Rule explanation is not a hard eligibility or AI decision');
$bad = $result; $bad['dimensions'][0]['evidence'][0]['target_id'] = '999';
$reject(fn() => CooperationHttpView::analysis($bad, 4), 'Reject foreign subject evidence');
$bad = $result; $bad['dimensions'][0]['evidence'][0]['reference']['scope'] = 'space:999';
$reject(fn() => CooperationHttpView::analysis($bad, 4), 'Reject foreign activity evidence');
$bad = $result; $bad['dimensions'][0]['status'] = 'verified';
$reject(fn() => CooperationHttpView::analysis($bad, 4), 'Reject invented analysis status');
require dirname(__DIR__, 3) . '/matcher-user-profile/domain/FieldCatalog.php';
$catalog = (new P1FieldCatalogAdapter(static fn(): array => ['schema_version' => \humhub\modules\matcherProfile\domain\FieldCatalog::VERSION, 'fields' => \humhub\modules\matcherProfile\domain\FieldCatalog::definitions()]))->read();
$check(PolicyValidator::catalogFingerprint($catalog) === ReviewedCooperationConfiguration::CATALOG_FINGERPRINT, 'Pinned reviewed catalog matches the actual source definitions');
echo json_encode(['status' => 'passed', 'checks' => count($labels), 'labels' => $labels, 'http_requests' => 0, 'database_connections' => 0, 'model_calls' => 0], JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT), PHP_EOL;
