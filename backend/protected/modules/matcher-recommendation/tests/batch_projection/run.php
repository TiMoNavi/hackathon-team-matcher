<?php
declare(strict_types=1);
require dirname(__DIR__) . '/support/autoload.php';
require_once dirname(__DIR__, 3) . '/matcher-user-profile/domain/FieldCatalog.php';

use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherRecommendation\contracts\{CandidateRequest, CurrentEventContext};
use humhub\modules\matcherRecommendation\contracts\ports\CurrentEventAccess;
use humhub\modules\matcherRecommendation\adapters\profile\{P1CandidateProjectionReader, P1FieldCatalogAdapter, P1SourcePurposePolicy};
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\tests\policy\Fixtures;

set_error_handler(static function (int $severity, string $message, string $file, int $line): never { throw new ErrorException($message, 0, $severity, $file, $line); });
$passed = []; $failures = [];
function gapCheck(bool $value): void { if (!$value) { throw new RuntimeException('Assertion failed.'); } }
function gapReject(callable $run, string $class = Throwable::class): void {
    try { $run(); } catch (Throwable $e) { if (!$e instanceof $class) { throw $e; } return; }
    throw new RuntimeException('Expected failure.');
}
function gapTest(string $name, callable $run): void {
    global $passed, $failures;
    try { $run(); $passed[] = $name; } catch (Throwable $e) { $failures[] = ['test' => $name, 'error' => get_class($e) . ': ' . $e->getMessage()]; }
}
final class GapEvents implements CurrentEventAccess {
    public int $calls = 0;
    public int $failAt = 0;
    public function resolve(int $viewerId, ?int $requestedSpaceId = null): CurrentEventContext {
        if ($viewerId !== 1 || ($requestedSpaceId !== null && $requestedSpaceId !== 7)) { throw new RuntimeException('Invalid synthetic context.'); }
        return Fixtures::context();
    }
    public function assertCurrent(CurrentEventContext $context): void {
        $this->calls++;
        if ($context->viewerId !== 1 || $context->spaceId !== 7 || $this->calls === $this->failAt) { throw new RuntimeException('Synthetic context revoked.'); }
    }
}
function gapCatalog(): array { return ['schema_version' => FieldCatalog::VERSION, 'fields' => FieldCatalog::definitions()]; }
function gapPolicy(): RulePolicy {
    $grants = (new P1SourcePurposePolicy())->sourceGrants((new P1FieldCatalogAdapter(fn() => gapCatalog()))->read());
    $p = Fixtures::parameters();
    $p['bindings'] = ['topics' => $grants['interest'], 'skills' => $grants['skill'], 'offers' => $grants['event_contribution']];
    $p['rules'] = array_slice($p['rules'], 0, 3);
    return new RulePolicy('synthetic-batch-gap-policy-1', $p);
}
function gapBatch(array $ids, array $keys): array {
    $profiles = [];
    foreach ($ids as $id) {
        $scopes = ['global' => ['revision' => 4, 'permission_version' => 2, 'attributes' => []], 'space:7' => ['revision' => 6, 'permission_version' => 3, 'attributes' => []]];
        foreach (['interest' => ['code' => 'social', 'label' => 'Social'], 'skill' => ['code' => 'python', 'label' => 'Python'], 'event_contribution' => ['skill_codes' => ['backend']]] as $key => $value) {
            if (!in_array($key, $keys, true)) { continue; }
            $scope = $key === 'event_contribution' ? 'space:7' : 'global';
            $scopes[$scope]['attributes'][] = ['attribute_id' => 'synthetic-' . $id . '-' . $key, 'key' => $key, 'value' => $value, 'confirmation' => 'confirmed', 'visibility' => 'authenticated', 'schema_version' => 2];
        }
        $profiles[$id] = ['scopes' => $scopes, 'identity_version' => 8];
    }
    return ['schema_version' => 2, 'profiles' => $profiles, 'policy_version' => 'synthetic-discovery-batch-v1'];
}
function gapReader(callable $batch, ?GapEvents $events = null, ?callable $catalog = null, ?RulePolicy $policy = null): P1CandidateProjectionReader {
    return new P1CandidateProjectionReader($events ?? new GapEvents(), new P1FieldCatalogAdapter($catalog ?? fn() => gapCatalog()), $policy ?? gapPolicy(), $batch);
}
function gapRequest(array $ids = ['22']): CandidateRequest { return new CandidateRequest(Fixtures::context(), 'person', $ids); }

gapTest('One authorized batch becomes evidence-backed logical features with separate scope and identity versions', function (): void {
    $calls = 0; $events = new GapEvents();
    $r = gapReader(function (int $viewer, int $space, array $ids, array $keys) use (&$calls): array {
        $calls++; gapCheck($viewer === 1 && $space === 7 && $ids === [22]);
        gapCheck($keys === ['interest', 'skill', 'event_contribution']); return gapBatch($ids, $keys);
    }, $events)->read(gapRequest());
    gapCheck($calls === 1 && $events->calls === 2 && count($r) === 1);
    gapCheck($r[0]->features['topics']['value'] === ['social'] && $r[0]->features['offers']['value'] === ['backend']);
    gapCheck($r[0]->versions->scopes['global']['permission_version'] === 2 && $r[0]->versions->scopes['space:7']['permission_version'] === 3 && $r[0]->versions->identityVersion === 8);
    gapCheck($r[0]->features['offers']['evidence'][0]->scope === 'space:7');
});
gapTest('Empty and self-only requests never fetch subjects', function (): void {
    $calls = 0; $r = gapReader(function () use (&$calls): never { $calls++; throw new RuntimeException(); });
    gapCheck($r->read(gapRequest([])) === [] && $r->read(gapRequest(['1'])) === [] && $calls === 0);
});
gapTest('Requested order is preserved and omitted subjects are not fabricated', function (): void {
    $r = gapReader(function ($v, $s, $ids, $keys): array { $batch = gapBatch(array_reverse($ids), $keys); unset($batch['profiles'][3]); return $batch; })->read(gapRequest(['4', '3', '2']));
    gapCheck(array_map(fn($p) => $p->targetId, $r) === ['4', '2']);
});
foreach (['0', '-2', '02', '1e2', '214748364700000000000', 'person-2'] as $id) {
    gapTest('Reject noncanonical native ID ' . $id, fn() => gapReject(fn() => gapReader(fn() => [])->read(gapRequest([$id])), InvalidArgumentException::class));
}
gapTest('Idea requests cannot use a person reader', fn() => gapReject(fn() => gapReader(fn() => [])->read(new CandidateRequest(Fixtures::context(), 'idea', ['22'])), InvalidArgumentException::class));
gapTest('Invalid initial current activity fails before upstream reads', function (): void {
    $events = new GapEvents(); $events->failAt = 1; $calls = 0;
    gapReject(fn() => gapReader(function () use (&$calls): array { $calls++; return []; }, $events)->read(gapRequest())); gapCheck($calls === 0);
});
gapTest('Activity selection changes during source execution invalidate the whole result', function (): void {
    $events = new GapEvents(); $events->failAt = 2;
    gapReject(fn() => gapReader(fn($v, $s, $ids, $keys) => gapBatch($ids, $keys), $events)->read(gapRequest()), RuntimeException::class);
});
gapTest('Upstream failure is propagated and never converted to no candidates', fn() => gapReject(fn() => gapReader(fn() => throw new LogicException('Synthetic outage.'))->read(gapRequest()), LogicException::class));
gapTest('A removed field becomes unknown without discarding independent allowed features', function (): void {
    $catalog = gapCatalog(); unset($catalog['fields']['skill']); $calledKeys = [];
    $r = gapReader(function ($v, $s, $ids, $keys) use (&$calledKeys): array { $calledKeys = $keys; return gapBatch($ids, $keys); }, catalog: fn() => $catalog)->read(gapRequest());
    gapCheck(!in_array('skill', $calledKeys, true) && in_array('skills', $r[0]->unknownFeatures, true) && isset($r[0]->features['topics'], $r[0]->features['offers']));
});
gapTest('Changed schema revokes only that source without automatically trusting changed bindings', function (): void {
    $catalog = gapCatalog(); $catalog['fields']['skill']['value_schema']['properties']['code']['maxLength'] = 90;
    $r = gapReader(fn($v, $s, $ids, $keys) => gapBatch($ids, $keys), catalog: fn() => $catalog)->read(gapRequest());
    gapCheck($r[0]->unknownFeatures === ['skills'] && isset($r[0]->features['topics']));
});
gapTest('Unreviewed catalog version supplies no feature values', function (): void {
    $catalog = gapCatalog(); $catalog['schema_version'] = 3;
    $r = gapReader(function ($v, $s, $ids, $keys): array { gapCheck($keys === []); $b = gapBatch($ids, $keys); $b['schema_version'] = 3; return $b; }, catalog: fn() => $catalog)->read(gapRequest());
    gapCheck($r[0]->features === [] && count($r[0]->unknownFeatures) === 3);
});
gapTest('Directory mutation during read is rejected before return', function (): void {
    $catalog = gapCatalog();
    $reader = gapReader(function ($v, $s, $ids, $keys) use (&$catalog): array { unset($catalog['fields']['skill']); return gapBatch($ids, $keys); }, catalog: function () use (&$catalog): array { return $catalog; });
    gapReject(fn() => $reader->read(gapRequest()), RuntimeException::class);
});
gapTest('No original profile title or about field is required', function (): void {
    $c = gapCatalog(); $c['fields'] = array_intersect_key($c['fields'], array_flip(['interest', 'skill', 'event_contribution']));
    $r = gapReader(fn($v, $s, $ids, $keys) => gapBatch($ids, $keys), catalog: fn() => $c)->read(gapRequest()); gapCheck(count($r[0]->features) === 3);
});
gapTest('A valid-looking binding cannot relabel a source purpose', function (): void {
    $p = gapPolicy()->parameters; $p['bindings']['topics']['source_key'] = 'skill'; $p['bindings']['topics']['value_schema'] = $p['bindings']['skills']['value_schema'];
    gapReject(fn() => gapReader(fn() => [], policy: new RulePolicy('synthetic-invalid-purpose', $p)), InvalidArgumentException::class);
});
gapTest('A newly named but unreviewed source cannot be activated only by configuration', function (): void {
    $p = gapPolicy()->parameters; $p['bindings']['topics']['source_key'] = 'new_interest';
    gapReject(fn() => gapReader(fn() => [], policy: new RulePolicy('synthetic-unreviewed', $p)), InvalidArgumentException::class);
});
gapTest('Missing values remain unknown and no identity or native fallback is synthesized', function (): void {
    $r = gapReader(function ($v, $s, $ids): array { $b = gapBatch($ids, []); $b['profiles'][22]['identity_version'] = 0; return $b; })->read(gapRequest());
    gapCheck($r[0]->features === [] && count($r[0]->unknownFeatures) === 3 && $r[0]->versions->identityVersion === 0);
});
foreach (['unrequested_owner','foreign_scope','missing_scope','bad_revision','bad_identity','mismatched_schema','private_value','friends_value','pending_value','contact_key','unrequested_key','duplicate_attribute','wrong_field_scope','stale_attribute_schema','extra_profile_payload'] as $kind) {
    gapTest('Reject malformed or overbroad authorized envelope: ' . $kind, function () use ($kind): void {
        $reader = gapReader(function ($v, $s, $ids, $keys) use ($kind): array {
            $b = gapBatch($ids, $keys); $p =& $b['profiles'][22]; $a =& $p['scopes']['global']['attributes'][0];
            switch ($kind) {
                case 'unrequested_owner': $b['profiles'][23] = $p; break;
                case 'foreign_scope': $p['scopes']['space:8'] = $p['scopes']['space:7']; break;
                case 'missing_scope': unset($p['scopes']['space:7']); break;
                case 'bad_revision': $p['scopes']['global']['revision'] = '4'; break;
                case 'bad_identity': $p['identity_version'] = -1; break;
                case 'mismatched_schema': $b['schema_version'] = 3; break;
                case 'private_value': $a['visibility'] = 'private'; break;
                case 'friends_value': $a['visibility'] = 'friends'; break;
                case 'pending_value': $a['confirmation'] = 'pending'; break;
                case 'contact_key': $a['key'] = 'contact_email'; break;
                case 'unrequested_key': $a['key'] = 'bio'; break;
                case 'duplicate_attribute': $p['scopes']['global']['attributes'][] = $a; break;
                case 'wrong_field_scope': $p['scopes']['space:7']['attributes'][] = $a; unset($p['scopes']['global']['attributes'][0]); $p['scopes']['global']['attributes'] = array_values($p['scopes']['global']['attributes']); break;
                case 'stale_attribute_schema': $a['schema_version'] = 1; break;
                case 'extra_profile_payload': $p['raw_source'] = 'synthetic excluded raw material'; break;
            }
            return $b;
        });
        gapReject(fn() => $reader->read(gapRequest()), UnexpectedValueException::class);
    });
}
foreach ([1, 30, 200] as $size) {
    gapTest('Bounded single upstream invocation for ' . $size . ' subjects', function () use ($size): void {
        $calls = 0; $ids = array_map('strval', range(2, $size + 1));
        $r = gapReader(function ($v, $s, $ids, $keys) use (&$calls): array { $calls++; return gapBatch($ids, $keys); })->read(gapRequest($ids));
        gapCheck($calls === 1 && count($r) === $size);
    });
}
gapTest('201 subjects cannot be constructed as a bounded request', fn() => gapReject(fn() => gapRequest(array_map('strval', range(2, 202))), InvalidArgumentException::class));
restore_error_handler();
echo json_encode(['status' => $failures === [] ? 'passed' : 'failed', 'scope' => 'Recommendation batch bridge with actual P1 metadata and synthetic authorized provider; separate integration test verifies the SQL service chain.', 'passed' => count($passed), 'failed' => count($failures), 'checks' => $passed, 'failures' => $failures], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
exit($failures === [] ? 0 : 1);
