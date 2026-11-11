<?php
declare(strict_types=1);
// Real P1 public metadata, synthetic configuration only. No P1 Module init or profile storage reads.
require dirname(__DIR__) . '/support/autoload.php';
$modules = dirname(__DIR__, 3);
require_once $modules . '/matcher-user-profile/domain/FieldCatalog.php';
use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherRecommendation\adapters\profile\{P1FieldCatalogAdapter, P1SourcePurposePolicy};
use humhub\modules\matcherRecommendation\domain\config\{Fingerprint, PolicyValidator};
use humhub\modules\matcherRecommendation\tests\policy\Fixtures;

set_error_handler(static function (int $severity, string $message, string $file, int $line): never { throw new ErrorException($message, 0, $severity, $file, $line); });
$passed = []; $failures = [];
function r3Check(bool $condition, string $message = 'Assertion failed'): void { if (!$condition) { throw new RuntimeException($message); } }
function r3Reject(callable $call, string $class = InvalidArgumentException::class): void { try { $call(); } catch (Throwable $error) { if (!$error instanceof $class) { throw $error; } return; } throw new RuntimeException('Expected a rejection.'); }
function r3Test(string $name, callable $call): void { global $passed, $failures; try { $call(); $passed[] = $name; } catch (Throwable $error) { $failures[] = ['test' => $name, 'error' => get_class($error) . ': ' . $error->getMessage()]; } }
function r3RawCatalog(): array { return ['schema_version' => FieldCatalog::VERSION, 'fields' => FieldCatalog::definitions(), 'identities' => FieldCatalog::identities(), 'relations' => FieldCatalog::relations()]; }
function r3Catalog(?array $source = null): array { return (new P1FieldCatalogAdapter(static fn(): array => $source ?? r3RawCatalog()))->read(); }
function r3Parameters(array $grant): array
{
    $p = Fixtures::parameters();
    $operator = match ($grant['semantic']) { 'topic', 'capability', 'confirmed_text' => 'similarity', 'declared_contribution' => 'supply_demand', 'availability' => 'interval_overlap', default => 'explicit_preference' };
    $p['bindings'] = ['tested_feature' => $grant];
    $p['rules'] = [['id' => 'tested_rule', 'dimension' => $grant['purpose'], 'operator' => $operator, 'query_feature' => 'tested_query', 'candidate_features' => ['tested_feature'], 'aliases' => []]];
    return $p;
}

r3Test('Reads actual P1 schema2 public metadata', static function (): void { $c = r3Catalog(); r3Check($c['schema_version'] === 2 && count($c['fields']) === 37); r3Check($c['fields']['role']['value_schema'] === FieldCatalog::definitions()['role']['value_schema']); });
r3Test('Only R0 directory shape crosses boundary', static function (): void { $c = r3Catalog(); r3Check(array_keys($c) === ['schema_version', 'fields']); foreach ($c['fields'] as $field) { r3Check(array_keys($field) === ['key', 'scope', 'cardinality', 'value_schema']); } r3Check(!isset($c['fields']['nickname'], $c['fields']['avatar_ref'])); });
r3Test('Construction is lazy and each read makes exactly one public call', static function (): void { $calls = 0; $adapter = new P1FieldCatalogAdapter(static function () use (&$calls): array { $calls++; return r3RawCatalog(); }); r3Check($calls === 0); $adapter->read(); r3Check($calls === 1); $adapter->read(); r3Check($calls === 2); });
r3Test('Native storage details and unrelated payload never propagate', static function (): void { $raw = r3RawCatalog(); $raw['attributes'] = [['value' => 'synthetic excluded data']]; $raw['fields']['role']['native_binding'] = ['table' => 'synthetic_table', 'columns' => ['synthetic_column']]; $raw['fields']['role']['storage_kind'] = 'native'; $raw['fields']['role']['value'] = 'synthetic excluded value'; r3Check(r3Catalog($raw) === r3Catalog()); });
r3Test('Identity or relation entries accidentally mixed into fields are excluded', static function (): void { $raw = r3RawCatalog(); $raw['fields']['nickname'] = FieldCatalog::identities()['nickname']; $raw['fields']['idea_groups'] = FieldCatalog::relations()['idea_groups']; r3Check(r3Catalog($raw) === r3Catalog()); });
r3Test('Does not cache a stale field directory', static function (): void { $raw = r3RawCatalog(); $adapter = new P1FieldCatalogAdapter(static function () use (&$raw): array { return $raw; }); $first = $adapter->read(); unset($raw['fields']['skill']); $second = $adapter->read(); r3Check(isset($first['fields']['skill']) && !isset($second['fields']['skill'])); });
r3Test('Unavailable source throws and is not converted to empty success', static function (): void { $adapter = new P1FieldCatalogAdapter(static function (): never { throw new RuntimeException('Synthetic directory unavailable'); }); r3Reject(fn() => $adapter->read(), RuntimeException::class); });
foreach (['root_type', 'version_type', 'missing_fields', 'bad_key', 'key_mismatch', 'scope', 'cardinality', 'schema_type'] as $invalid) { r3Test('Reject malformed P1 metadata: ' . $invalid, static function () use ($invalid): void {
    $raw = r3RawCatalog();
    switch ($invalid) {
        case 'root_type': $raw = false; break;
        case 'version_type': $raw['schema_version'] = '2'; break;
        case 'missing_fields': unset($raw['fields']); break;
        case 'bad_key': $raw['fields'][42] = []; break;
        case 'key_mismatch': $raw['fields']['role']['key'] = 'other'; break;
        case 'scope': $raw['fields']['role']['scope'] = 'space:7'; break;
        case 'cardinality': $raw['fields']['role']['cardinality'] = 'unlimited'; break;
        case 'schema_type': $raw['fields']['role']['value_schema'] = 'string'; break;
    }
    r3Reject(fn() => (new P1FieldCatalogAdapter(static fn() => $raw))->read(), UnexpectedValueException::class);
}); }
r3Test('New unbound schema dialect does not break approved unrelated fields', static function (): void { $raw = r3RawCatalog(); $raw['fields']['new_schema'] = ['key' => 'new_schema', 'scope' => 'global', 'cardinality' => 'one', 'kind' => 'profile', 'value_schema' => ['oneOf' => [['type' => 'string'], ['type' => 'number']]]]; $c = r3Catalog($raw); $policy = new P1SourcePurposePolicy(); r3Check(isset($c['fields']['new_schema']) && !isset($policy->sourceGrants($c)['new_schema'])); $policy->assertBindings(r3Parameters($policy->sourceGrants($c)['role']), $c); });

$purpose = new P1SourcePurposePolicy(); $catalog = r3Catalog(); $grants = $purpose->sourceGrants($catalog);
r3Test('Source-purpose policy has an independent version and 18 reviewed sources', static function () use ($grants): void { r3Check(P1SourcePurposePolicy::VERSION === 'p1-discovery-purpose-v1' && count($grants) === 18); });
foreach ($grants as $key => $grant) { r3Test('Reviewed source validates against real P1 schema: ' . $key, static function () use ($purpose, $catalog, $grant): void { $purpose->assertBindings(r3Parameters($grant), $catalog); }); }
r3Test('Global skill role and project prove capability only', static function () use ($grants): void { foreach (['skill', 'role', 'project'] as $key) { r3Check($grants[$key]['scope'] === 'global' && $grants[$key]['semantic'] === 'capability'); } r3Check($grants['project']['transform'] === 'tech_codes'); });
r3Test('Only reviewed event offers prove current willingness', static function () use ($grants): void { foreach (['event_role', 'event_contribution'] as $key) { r3Check($grants[$key]['scope'] === 'event' && $grants[$key]['semantic'] === 'declared_contribution'); } r3Check(!isset($grants['event_seeking'])); });
r3Test('Personality source grants stay in explicit collaboration preferences', static function () use ($grants): void { foreach (['mbti', 'personality'] as $key) { r3Check($grants[$key]['purpose'] === 'collaboration_style' && $grants[$key]['semantic'] === 'self_reported_type'); } });
r3Test('Event communication preference is distinguished from contact data', static function () use ($grants): void { r3Check(isset($grants['event_contact_preference'])); foreach (array_keys(FieldCatalog::definitions()) as $key) { if (str_starts_with($key, 'contact_')) { r3Check(!isset($grants[$key])); } } });
foreach (['real_name', 'age_range', 'city', 'timezone', 'education', 'work_experience', 'award', 'portfolio_link', 'event_seeking', 'event_time_commitment', 'event_presence', 'event_constraint', 'nickname', 'avatar_ref'] as $key) { r3Test('Unreviewed or unsuitable source is absent: ' . $key, static function () use ($grants, $key): void { r3Check(!isset($grants[$key])); }); }
r3Test('Admin cannot relabel MBTI as positive capability evidence', static function () use ($purpose, $catalog, $grants): void { $g = $grants['mbti']; $g['purpose'] = 'contribution'; $g['semantic'] = 'capability'; $p = r3Parameters($g); PolicyValidator::validate($p, $catalog); r3Reject(fn() => $purpose->assertBindings($p, $catalog)); });
r3Test('Admin cannot relabel traits as topic evidence', static function () use ($purpose, $catalog, $grants): void { $g = $grants['personality']; $g['purpose'] = 'topic'; $g['semantic'] = 'topic'; $p = r3Parameters($g); PolicyValidator::validate($p, $catalog); r3Reject(fn() => $purpose->assertBindings($p, $catalog)); });
r3Test('Demand source cannot be configured as a current offer', static function () use ($purpose, $catalog, $grants): void { $g = $grants['event_contribution']; $g['source_key'] = 'event_seeking'; $g['value_schema'] = $catalog['fields']['event_seeking']['value_schema']; $p = r3Parameters($g); PolicyValidator::validate($p, $catalog); r3Reject(fn() => $purpose->assertBindings($p, $catalog)); });
r3Test('Metadata semantic declarations do not expand reviewed grants', static function () use ($purpose, $grants): void { $raw = r3RawCatalog(); $raw['fields']['mbti']['semantic'] = 'capability'; $raw['fields']['mbti']['allowed_purposes'] = ['contribution']; $c = r3Catalog($raw); r3Check($purpose->sourceGrants($c)['mbti'] === $grants['mbti']); });
r3Test('New key cloned from an allowed schema remains unapproved', static function () use ($purpose, $grants): void { $raw = r3RawCatalog(); $raw['fields']['new_interest'] = $raw['fields']['interest']; $raw['fields']['new_interest']['key'] = 'new_interest'; $c = r3Catalog($raw); $g = $grants['interest']; $g['source_key'] = 'new_interest'; $p = r3Parameters($g); PolicyValidator::validate($p, $c); r3Reject(fn() => $purpose->assertBindings($p, $c)); });
r3Test('Display rename and removed native columns do not affect semantic grants', static function () use ($purpose, $grants): void { $raw = r3RawCatalog(); foreach ($raw['fields'] as &$field) { $field['label'] = 'Renamed'; unset($field['native_binding'], $field['storage_kind']); } unset($field); r3Check($purpose->sourceGrants(r3Catalog($raw)) === $grants); });
r3Test('Missing optional old fields do not require restoring them', static function () use ($purpose, $grants): void { $raw = r3RawCatalog(); $raw['fields'] = ['skill' => $raw['fields']['skill']]; $c = r3Catalog($raw); r3Check(array_keys($purpose->sourceGrants($c)) === ['skill']); $purpose->assertBindings(r3Parameters($grants['skill']), $c); });
foreach (['scope', 'cardinality', 'type', 'enum', 'length'] as $change) { r3Test('Changed source ' . $change . ' invalidates only that grant', static function () use ($purpose, $grants, $change): void {
    $raw = r3RawCatalog(); $key = $change === 'enum' ? 'mbti' : 'role';
    if ($change === 'scope') { $raw['fields'][$key]['scope'] = 'event'; }
    elseif ($change === 'cardinality') { $raw['fields'][$key]['cardinality'] = 'one'; }
    elseif ($change === 'type') { $raw['fields'][$key]['value_schema'] = ['type' => 'string']; }
    elseif ($change === 'enum') { $raw['fields'][$key]['value_schema']['enum'][] = 'OTHER'; }
    else { $raw['fields'][$key]['value_schema']['properties']['code']['maxLength'] = 80; }
    $current = $purpose->sourceGrants(r3Catalog($raw)); r3Check(!isset($current[$key]) && $current['skill'] === $grants['skill']);
}); }
r3Test('Updating binding snapshot to changed source does not auto-approve it', static function () use ($purpose, $grants): void { $raw = r3RawCatalog(); $raw['fields']['role']['value_schema']['properties']['code']['maxLength'] = 80; $c = r3Catalog($raw); $g = $grants['role']; $g['value_schema'] = $c['fields']['role']['value_schema']; $p = r3Parameters($g); PolicyValidator::validate($p, $c); r3Reject(fn() => $purpose->assertBindings($p, $c)); });
r3Test('New catalog version requires source-purpose review', static function () use ($purpose, $grants): void { $raw = r3RawCatalog(); $raw['schema_version'] = 3; $c = r3Catalog($raw); r3Check($purpose->sourceGrants($c) === []); $p = r3Parameters($grants['role']); $p['catalog_version'] = 3; PolicyValidator::validate($p, $c); r3Reject(fn() => $purpose->assertBindings($p, $c)); });
r3Test('Schema property order is not a false incompatibility', static function () use ($purpose, $grants): void { $raw = r3RawCatalog(); $raw['fields']['role']['value_schema']['properties'] = array_reverse($raw['fields']['role']['value_schema']['properties'], true); r3Check(Fingerprint::of($purpose->sourceGrants(r3Catalog($raw))['role']) === Fingerprint::of($grants['role'])); });
r3Test('Source-purpose checks do not claim subject authorization or read values', static function (): void { $methods = get_class_methods(P1SourcePurposePolicy::class); sort($methods); r3Check($methods === ['assertBindings', 'sourceGrants']); r3Check(!class_exists('humhub\modules\matcherProfile\application\ProfileService', false)); r3Check(!class_exists('humhub\modules\matcherProfile\Module', false)); });

restore_error_handler();
echo json_encode(['status' => $failures === [] ? 'passed' : 'failed', 'scope' => 'Actual P1 public metadata with synthetic source-purpose policies; no profile values, P1 Module initialization, database, network or credentials.', 'passed' => count($passed), 'failed' => count($failures), 'checks' => $passed, 'failures' => $failures, 'authorized_batch_reader_executed' => false], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
exit($failures === [] ? 0 : 1);
