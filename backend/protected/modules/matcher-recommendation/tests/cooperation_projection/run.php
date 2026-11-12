<?php
declare(strict_types=1);
require dirname(__DIR__) . '/support/autoload.php';
$modules = dirname(__DIR__, 3);
spl_autoload_register(static function (string $class) use ($modules): void {
    foreach (['matcherProfile' => 'matcher-user-profile', 'matcherPrivacy' => 'matcher-profile-privacy'] as $namespace => $directory) {
        $prefix = 'humhub\\modules\\' . $namespace . '\\';
        if (str_starts_with($class, $prefix)) { $file = $modules . '/' . $directory . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php'; if (is_file($file)) { require_once $file; } }
    }
});

use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherPrivacy\application\DiscoveryBatchService;
use humhub\modules\matcherPrivacy\domain\ports\DiscoveryRelations;
use humhub\modules\matcherRecommendation\adapters\profile\{P1CooperationProjectionReader, P1CooperationPurposePolicy, P1FieldCatalogAdapter, P1SourcePurposePolicy};
use humhub\modules\matcherRecommendation\application\analysis\AnalyzeCooperation;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CandidateRequest, CurrentEventContext, EvidenceRef, ProjectionVersions};
use humhub\modules\matcherRecommendation\contracts\analysis\{CooperationAnalysisRequest, SelectedSelfAttributes};
use humhub\modules\matcherRecommendation\contracts\ports\{CurrentEventAccess, SelectedSelfProjectionReader};
use humhub\modules\matcherRecommendation\domain\analysis\{AnalysisMapping, CooperationAnalyzer};
use humhub\modules\matcherRecommendation\domain\config\PolicyValidator;

set_error_handler(static function (int $severity, string $message, string $file, int $line): never { throw new ErrorException($message, 0, $severity, $file, $line); });
$passed = []; $failed = [];
function cpCheck(bool $condition): void { if (!$condition) { throw new RuntimeException('Assertion failed.'); } }
function cpReject(callable $run): void { try { $run(); } catch (Throwable) { return; } throw new RuntimeException('Expected rejection.'); }
function cpTest(string $name, callable $run): void { global $passed, $failed; try { $run(); $passed[] = $name; } catch (Throwable $e) { $failed[] = ['test' => $name, 'error' => get_class($e) . ': ' . $e->getMessage()]; } }
final class CpEvents implements CurrentEventAccess {
    public int $assertions = 0; public int $failAt = 0;
    public function resolve(int $viewerId, ?int $requestedSpaceId = null): CurrentEventContext { return new CurrentEventContext(1, 7, 'access-v1', 'event-v1'); }
    public function assertCurrent(CurrentEventContext $context): void { $this->assertions++; if ($context->viewerId !== 1 || $context->spaceId !== 7 || $this->failAt === $this->assertions) { throw new RuntimeException('Synthetic context revoked.'); } }
}
function cpContext(): CurrentEventContext { return (new CpEvents())->resolve(1); }
function cpCatalog(): array { return ['schema_version' => FieldCatalog::VERSION, 'fields' => FieldCatalog::definitions()]; }
function cpBindings(): array { return ['topics' => 'project_directions', 'skills' => 'declared_skills', 'projects' => 'project_technologies', 'offers' => 'event_offered_skills', 'needs' => 'event_needed_skills', 'offer_roles' => 'event_offered_roles', 'need_roles' => 'event_needed_roles', 'time' => 'event_availability', 'modes' => 'event_collaboration_modes', 'communication' => 'communication_preferences']; }
function cpMapping(): AnalysisMapping { return new AnalysisMapping('cooperation-source-test-v1', 2, ['topics' => ['topics'], 'capability_skills' => ['skills', 'projects'], 'offered_skills' => ['offers'], 'needed_skills' => ['needs'], 'offered_roles' => ['offer_roles'], 'needed_roles' => ['need_roles'], 'availability' => ['time'], 'collaboration_modes' => ['modes'], 'communication_preferences' => ['communication']]); }
function cpBatch(array $ids, array $keys): array {
    $catalog = FieldCatalog::definitions(); $profiles = [];
    $values = ['direction' => ['code' => 'robotics', 'label' => 'Synthetic direction'], 'skill' => ['code' => 'Backend', 'label' => 'Synthetic skill'],
        'project' => ['title' => 'Synthetic project title', 'tech_codes' => ['Rust'], 'role' => 'Synthetic past role', 'contribution' => 'Synthetic project contribution'],
        'event_seeking' => ['role_codes' => ['product'], 'skill_codes' => ['design'], 'free_text' => 'Synthetic excluded free text'],
        'event_contribution' => ['skill_codes' => ['backend']], 'event_role' => ['code' => 'technical', 'label' => 'Synthetic technical role'],
        'event_availability' => ['starts_at' => '2026-11-13T09:00:00+08:00', 'ends_at' => '2026-11-13T11:00:00+08:00', 'timezone' => 'Asia/Shanghai'],
        'event_collaboration_mode' => ['mode' => 'online'], 'communication_preference' => ['codes' => ['async']]];
    foreach ($ids as $id) {
        $scopes = ['global' => ['revision' => 4, 'permission_version' => 2, 'attributes' => []], 'space:7' => ['revision' => 6, 'permission_version' => 3, 'attributes' => []]];
        foreach ($values as $key => $value) {
            if (!in_array($key, $keys, true)) { continue; }
            $scope = $catalog[$key]['scope'] === 'global' ? 'global' : 'space:7';
            $scopes[$scope]['attributes'][] = ['attribute_id' => 'synthetic-' . $id . '-' . $key, 'key' => $key, 'value' => $value, 'confirmation' => 'confirmed', 'visibility' => 'authenticated', 'schema_version' => 2];
        }
        $profiles[$id] = ['identity_version' => 8, 'scopes' => $scopes];
    }
    return ['schema_version' => 2, 'policy_version' => DiscoveryBatchService::POLICY_VERSION, 'profiles' => $profiles];
}
function cpReader(?callable $batch = null, ?CpEvents $events = null, ?callable $catalog = null, ?AnalysisMapping $mapping = null, ?array $bindings = null): P1CooperationProjectionReader {
    return new P1CooperationProjectionReader($events ?? new CpEvents(), new P1FieldCatalogAdapter($catalog ?? fn() => cpCatalog()), $mapping ?? cpMapping(), $bindings ?? cpBindings(), $batch ?? fn($v, $s, $ids, $keys) => cpBatch($ids, $keys));
}
function cpRead(?P1CooperationProjectionReader $reader = null, array $ids = ['2']): array { return ($reader ?? cpReader())->read(new CandidateRequest(cpContext(), 'person', $ids)); }
function cpAttribute(array &$batch, string $key, int $id = 2): array { foreach ($batch['profiles'][$id]['scopes'] as $scope => $state) { foreach ($state['attributes'] as $i => $attribute) { if ($attribute['key'] === $key) { return [$scope, $i]; } } } throw new RuntimeException('Missing synthetic attribute.'); }

cpTest('Actual P1 catalog approves ten explicit analysis uses without widening the ranking policy', function (): void {
    $catalog = (new P1FieldCatalogAdapter(fn() => cpCatalog()))->read(); $grants = (new P1CooperationPurposePolicy())->sourceGrants($catalog);
    cpCheck(count($grants) === 10 && !isset((new P1SourcePurposePolicy())->sourceGrants($catalog)['event_seeking']));
    cpCheck($grants['event_needed_skills']['purpose'] === 'cooperation_analysis' && $grants['event_needed_roles']['semantic'] === 'needed_roles');
});
cpTest('Demand and offers stay distinct; project contributes only explicit technical evidence', function (): void {
    $p = cpRead()[0]; cpCheck($p->features['needs']['value'] === ['design'] && $p->features['offers']['value'] === ['backend']);
    cpCheck($p->features['need_roles']['value'] === ['product'] && $p->features['offer_roles']['value'] === ['technical']);
    cpCheck($p->features['projects']['value'] === ['rust'] && $p->features['skills']['value'] === ['backend']);
    cpCheck($p->features['projects']['evidence'][0]->sourceId === 'synthetic-2-project' && $p->features['needs']['evidence'][0]->scope === 'space:7');
    $json = json_encode($p); cpCheck(!str_contains($json, 'Synthetic project') && !str_contains($json, 'excluded free text'));
});
cpTest('Single mode is a list and time-zone evidence survives projection', function (): void { $p = cpRead()[0]; cpCheck($p->features['modes']['value'] === ['online'] && $p->features['time']['value'][0]['timezone'] === 'Asia/Shanghai'); });
cpTest('Same source demand fields are requested once in one upstream batch', function (): void { $calls = 0; cpRead(cpReader(function ($v, $s, $ids, $keys) use (&$calls): array { $calls++; cpCheck(count($keys) === 9 && count(array_keys($keys, 'event_seeking', true)) === 1); return cpBatch($ids, $keys); })); cpCheck($calls === 1); });
cpTest('Policy basis changes when analysis source binding or upstream visibility policy changes', function (): void {
    $p = new P1CooperationPurposePolicy(); $a = cpBindings(); $b = $a; [$b['skills'], $b['projects']] = [$b['projects'], $b['skills']];
    cpCheck($p->projectionPolicyVersion('a', cpMapping(), $a) !== $p->projectionPolicyVersion('a', cpMapping(), $b));
    cpCheck($p->projectionPolicyVersion('a', cpMapping(), $a) !== $p->projectionPolicyVersion('b', cpMapping(), $a));
});
foreach (['interest', 'mbti', 'project_prose', 'contact_email', 'raw_resume', 'global_role', 'event_goal'] as $unapproved) {
    cpTest('Configuration cannot automatically approve source use ' . $unapproved, function () use ($unapproved): void { $b = cpBindings(); $b['topics'] = $unapproved; cpReject(fn() => cpReader(bindings: $b)); });
}
cpTest('Config cannot relabel a demand as an offer', function (): void { $b = cpBindings(); $b['offers'] = 'event_needed_skills'; cpReject(fn() => cpReader(bindings: $b)); });
cpTest('Duplicate, missing or extra bindings are rejected', function (): void {
    $b = cpBindings(); $b['projects'] = $b['skills']; cpReject(fn() => cpReader(bindings: $b));
    $b = cpBindings(); unset($b['needs']); cpReject(fn() => cpReader(bindings: $b)); $b = cpBindings(); $b['extra'] = 'project_directions'; cpReject(fn() => cpReader(bindings: $b));
});
cpTest('Custom logical names and a minimal optional mapping remain supported', function (): void { $m = new AnalysisMapping('custom-v1', 2, ['needed_skills' => ['help_wanted']]); $p = cpRead(cpReader(mapping: $m, bindings: ['help_wanted' => 'event_needed_skills']))[0]; cpCheck(array_keys($p->features) === ['help_wanted']); });
cpTest('Empty and self-only reads perform no candidate source reads', function (): void { $calls = 0; $r = cpReader(function () use (&$calls): array { $calls++; return []; }); cpCheck(cpRead($r, []) === [] && cpRead($r, ['1']) === [] && $calls === 0); });
cpTest('Omitted or reordered candidate output never invents missing people', function (): void { $p = cpRead(cpReader(function ($v, $s, $ids, $keys): array { $b = cpBatch(array_reverse($ids), $keys); unset($b['profiles'][3]); return $b; }), ['4', '3', '2']); cpCheck(array_map(fn($x) => $x->targetId, $p) === ['4', '2']); });
foreach (['0', '02', '1e2', '-2', 'person-2'] as $id) { cpTest('Canonical person IDs required ' . $id, fn() => cpReject(fn() => cpRead(ids: [$id]))); }
cpTest('Initial and late current-activity revocation prevent output', function (): void { foreach ([1, 2] as $at) { $events = new CpEvents(); $events->failAt = $at; cpReject(fn() => cpRead(cpReader(events: $events))); } });
cpTest('Field removal or schema drift stays unknown without requiring original profile columns', function (): void {
    foreach (['remove', 'change'] as $kind) { $catalog = cpCatalog(); if ($kind === 'remove') { unset($catalog['fields']['event_seeking']); } else { $catalog['fields']['event_seeking']['value_schema']['properties']['free_text']['maxLength'] = 2000; }
        $p = cpRead(cpReader(catalog: fn() => $catalog))[0]; cpCheck(in_array('needs', $p->unknownFeatures, true) && in_array('need_roles', $p->unknownFeatures, true) && isset($p->features['offers'])); }
});
cpTest('Catalog change during batch is rejected', function (): void { $catalog = cpCatalog(); $r = cpReader(function ($v, $s, $ids, $keys) use (&$catalog): array { unset($catalog['fields']['event_seeking']); return cpBatch($ids, $keys); }, catalog: function () use (&$catalog): array { return $catalog; }); cpReject(fn() => cpRead($r)); });
foreach (['private', 'friends', 'pending', 'other_owner', 'other_space', 'extra_raw', 'null_identity', 'wrong_scope', 'unrequested_field', 'schema', 'duplicate', 'bad_value', 'cardinality', 'timezone'] as $kind) {
    cpTest('Reject malformed or unauthorized purpose projection ' . $kind, function () use ($kind): void {
        cpReject(fn() => cpRead(cpReader(function ($v, $s, $ids, $keys) use ($kind): array {
            $b = cpBatch($ids, $keys); [$scope, $i] = cpAttribute($b, 'event_seeking'); $a =& $b['profiles'][2]['scopes'][$scope]['attributes'][$i];
            switch ($kind) {
                case 'private': case 'friends': $a['visibility'] = $kind; break;
                case 'pending': $a['confirmation'] = 'pending'; break;
                case 'other_owner': $b['profiles'][9] = $b['profiles'][2]; break;
                case 'other_space': $b['profiles'][2]['scopes']['space:8'] = $b['profiles'][2]['scopes']['space:7']; break;
                case 'extra_raw': $a['raw_source'] = 'synthetic'; break;
                case 'null_identity': $b['profiles'][2]['identity_version'] = null; break;
                case 'wrong_scope': $b['profiles'][2]['scopes']['global']['attributes'][] = $a; array_splice($b['profiles'][2]['scopes'][$scope]['attributes'], $i, 1); break;
                case 'unrequested_field': $a['key'] = 'bio'; break;
                case 'schema': $a['schema_version'] = 3; break;
                case 'duplicate': $b['profiles'][2]['scopes'][$scope]['attributes'][] = $a; break;
                case 'bad_value': $a['value']['skill_codes'] = 'design'; break;
                case 'cardinality': $copy = $a; $copy['attribute_id'] .= '-second'; $b['profiles'][2]['scopes'][$scope]['attributes'][] = $copy; break;
                case 'timezone': [$ts, $ti] = cpAttribute($b, 'event_availability'); $b['profiles'][2]['scopes'][$ts]['attributes'][$ti]['value']['timezone'] = 'UTC'; break;
            } return $b;
        })));
    });
}
cpTest('An empty optional demand or project without codes remains unknown', function (): void { $p = cpRead(cpReader(function ($v, $s, $ids, $keys): array { $b = cpBatch($ids, $keys); foreach (['event_seeking', 'project'] as $key) { [$sc, $i] = cpAttribute($b, $key); $b['profiles'][2]['scopes'][$sc]['attributes'][$i]['value'] = $key === 'project' ? ['title' => 'Synthetic title only'] : []; } return $b; }))[0]; cpCheck(in_array('needs', $p->unknownFeatures, true) && in_array('projects', $p->unknownFeatures, true)); });
cpTest('Over-budget optional feature stays wholly unknown instead of silently claiming partial evidence', function (): void {
    $p = cpRead(cpReader(function ($v, $s, $ids, $keys): array { $b = cpBatch($ids, $keys); [$sc, $i] = cpAttribute($b, 'skill'); $a = $b['profiles'][2]['scopes'][$sc]['attributes'][$i]; array_splice($b['profiles'][2]['scopes'][$sc]['attributes'], $i, 1); for ($n = 0; $n < 65; $n++) { $a['attribute_id'] = 'synthetic-skill-' . $n; $a['value']['code'] = 'skill' . $n; $b['profiles'][2]['scopes'][$sc]['attributes'][] = $a; } return $b; }))[0];
    cpCheck(in_array('skills', $p->unknownFeatures, true) && isset($p->features['projects']));
});
cpTest('Actual P8 service filters fake private input and revalidates relations before purpose reduction', function (): void {
    $relations = new class implements DiscoveryRelations { public int $calls = 0; public function eligibleOwnerIds(int $viewerId, int $spaceId, array $ownerIds): array { $this->calls++; cpCheck($viewerId === 1 && $spaceId === 7); return $ownerIds; } };
    $sourceCalls = 0;
    $service = new DiscoveryBatchService($relations, function ($ids, $space, $keys) use (&$sourceCalls): array { $sourceCalls++; $b = cpBatch($ids, $keys); unset($b['policy_version']); [$sc, $i] = cpAttribute($b, 'event_seeking'); $b['profiles'][2]['scopes'][$sc]['attributes'][$i]['visibility'] = 'private'; return $b; });
    $p = cpRead(cpReader($service->read(...)))[0]; cpCheck($relations->calls === 3 && $sourceCalls === 2 && in_array('needs', $p->unknownFeatures, true) && isset($p->features['offers']));
});
cpTest('Actual P8 relationship loss omits the candidate without cross-activity fallback', function (): void {
    $relations = new class implements DiscoveryRelations { public int $calls = 0; public function eligibleOwnerIds(int $v, int $s, array $ids): array { return ++$this->calls === 1 ? $ids : []; } };
    $service = new DiscoveryBatchService($relations, function ($ids, $space, $keys): array { $b = cpBatch($ids, $keys); unset($b['policy_version']); return $b; }); cpCheck(cpRead(cpReader($service->read(...))) === []);
});
cpTest('Existing AnalyzeCooperation consumes the real candidate adapter without changing its kernel', function (): void {
    $events = new CpEvents(); $reader = cpReader(events: $events); $candidate = cpRead($reader)[0]; $versions = new ProjectionVersions(['global' => ['revision' => 1, 'permission_version' => 1], 'space:7' => ['revision' => 1, 'permission_version' => 1]], 2, 'synthetic-self-authority-v1', 1);
    $ref = new EvidenceRef('person', '1', 'profile_attribute', 'synthetic-self-demand', 'space:7', 1, 1);
    $self = new CandidateProjection('person', '1', 7, $versions, ['needs' => ['value' => ['backend'], 'evidence' => [$ref]]]);
    $selection = new SelectedSelfAttributes(1, 7, 'synthetic-selection', 1, $versions, [$ref]);
    $authority = new class($self, $selection) implements SelectedSelfProjectionReader {
        public function __construct(private CandidateProjection $p, private SelectedSelfAttributes $selected) {}
        public function assertCurrent(CurrentEventContext $c, SelectedSelfAttributes $s): void { cpCheck($s === $this->selected && $c->viewerId === 1); }
        public function read(CurrentEventContext $c, SelectedSelfAttributes $s): CandidateProjection { $this->assertCurrent($c, $s); return $this->p; }
    };
    $catalog = new P1FieldCatalogAdapter(fn() => cpCatalog()); $usecase = new AnalyzeCooperation($events, $reader, $authority, $catalog, cpMapping(), PolicyValidator::catalogFingerprint($catalog->read()));
    $result = $usecase->execute(1, new CooperationAnalysisRequest(cpContext(), '2', $candidate->versions, $selection, cpMapping()->fingerprint()));
    cpCheck($result['dimensions'][0]['status'] === 'supported' && $result['verification'] === 'internal_ports_rechecked');
});
foreach ([1, 30, 200] as $count) { cpTest('One adapter batch supports ' . $count . ' candidates', function () use ($count): void { cpCheck(count(cpRead(ids: array_map('strval', range(2, $count + 1)))) === $count); }); }
restore_error_handler();
echo json_encode(['status' => $failed === [] ? 'passed' : 'failed', 'scope' => 'Actual pure P1 catalog and P8 service with synthetic profile source/relations; no database, HTTP or model.', 'passed' => count($passed), 'failed' => count($failed), 'checks' => $passed, 'failures' => $failed], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
exit($failed === [] ? 0 : 1);
