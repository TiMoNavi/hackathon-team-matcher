<?php
declare(strict_types=1);
// Isolated PHP/Yii classes and brand-new SQLite memory databases; no HumHub application/config.
$backend = dirname(__DIR__, 5);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
$moduleRoot = dirname(__DIR__, 2);
spl_autoload_register(static function (string $class) use ($moduleRoot): void {
    $prefix = 'humhub\modules\matcherProfile' . chr(92);
    if (str_starts_with($class, $prefix)) {
        $file = $moduleRoot . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php';
        if (is_file($file)) { require $file; }
    }
});
require __DIR__ . '/Fixtures.php';

use humhub\modules\matcherProfile\application\DiscoveryProfileBatchReader;
use humhub\modules\matcherProfile\adapters\persistence\SqlDiscoveryProfileBatchSource;
use humhub\modules\matcherProfile\domain\{DiscoveryProfileBatchRequest, ProfileException};
use humhub\modules\matcherProfile\domain\ports\DiscoveryProfileBatchSource;
use humhub\modules\matcherProfile\tests\discovery_batch\{CountingConnection, Fixtures as F};

$checks = [];
function verify(bool $condition, string $label): void { global $checks; if (!$condition) { throw new RuntimeException('FAIL: ' . $label); } $checks[] = $label; }
function rejects(callable $call, string $code, string $label): void {
    try { $call(); } catch (ProfileException $error) { verify($error->errorCode === $code && $error->getPrevious() === null, $label); return; }
    verify(false, $label);
}
function reader(CountingConnection $db): DiscoveryProfileBatchReader { return new DiscoveryProfileBatchReader(new SqlDiscoveryProfileBatchSource($db)); }
function attrs(array $result, int $owner = 1, string $scope = 'global'): array { return $result['profiles'][$owner]['scopes'][$scope]['attributes']; }

$db = F::database(); $r = reader($db);
$out = $r->read([2, 1], 7, ['skill', 'headline', 'event_role']);
verify($out['schema_version'] === 2 && array_keys($out['profiles']) === [2, 1], 'requested owner order is retained');
verify(array_keys($out['profiles'][1]['scopes']) === ['global', 'space:7'], 'global and current Space are distinct');
verify($out['profiles'][1]['scopes']['global']['revision'] === 3 && $out['profiles'][1]['scopes']['space:7']['revision'] === 5, 'content versions are not collapsed across scopes');
verify($out['profiles'][1]['scopes']['global']['permission_version'] === 2 && $out['profiles'][1]['scopes']['space:7']['permission_version'] === 4, 'permission versions are not collapsed across scopes');
verify($out['profiles'][1]['identity_version'] === 7, 'identity version is independent of profile revisions');
verify(array_column(attrs($out), 'value', 'key')['headline'] === 'Synthetic headline 1', 'confirmed native value is hydrated in a batch');
verify(array_column(attrs($out), 'value', 'key')['skill'] === ['code' => 'php', 'label' => 'PHP'], 'inline confirmed value is decoded');
verify(array_column(attrs($out, 1, 'space:7'), 'value', 'key')['event_role']['code'] === 'developer', 'current Space contribution stays scoped');
verify(count($db->selects) === 3, 'one batch executes three SELECTs');
$encoded = json_encode($out, JSON_THROW_ON_ERROR);
foreach (['SYNTHETIC_PRIVATE_PHONE', 'SYNTHETIC_IDENTITY', 'native_binding', 'storage_kind', 'value_json', 'current_revision_id', 'field_definitions'] as $forbidden) { verify(!str_contains($encoded, $forbidden), 'output omits ' . $forbidden); }

$db->selects = [];
verify($r->read([], 7, ['skill']) === ['schema_version' => 2, 'profiles' => []] && $db->selects === [], 'empty owner list is empty without queries');
foreach ([['1'], [0], [-1], [true], [1, 1], range(1, 201), ['a' => 1]] as $invalid) { rejects(fn() => $r->read($invalid, 7, ['skill']), 'INVALID_PROFILE_BATCH', 'invalid or excessive owner IDs rejected'); }
foreach ([['contact_phone'], ['nickname'], ['avatar_ref'], ['unknown_key'], ['skill', 'skill'], ['a' => 'skill'], [1]] as $invalid) { rejects(fn() => $r->read([1], 7, $invalid), 'INVALID_PROFILE_BATCH', 'invalid or nonordinary source keys rejected'); }
rejects(fn() => $r->read([1], 0, ['skill']), 'INVALID_PROFILE_BATCH', 'nonpositive Space rejected');
verify($db->selects === [], 'invalid input never reaches SQL');
$out = $r->read([1], 7, []);
verify(attrs($out) === [] && attrs($out, 1, 'space:7') === [] && $out['profiles'][1]['identity_version'] === 7, 'empty key selection returns versions only');

foreach ([['visibility' => 'private'], ['visibility' => 'friends'], ['confirmation' => 'draft'], ['confirmation' => 'pending'], ['last_confirmed_at' => null]] as $change) {
    $db = F::database(); $db->createCommand()->update('matcher_profile_attribute', $change, ['field_key' => 'headline'])->execute();
    $out = reader($db)->read([1], 7, ['headline']);
    verify(attrs($out) === [], 'native value without current public confirmed marker excluded');
}
$db = F::database(); F::state($db, 1, 'space:8'); F::attribute($db, 1, 'space:8', 'event_role', ['code' => 'hidden-space-role', 'label' => 'Other Space']);
verify(!str_contains(json_encode(reader($db)->read([1], 7, ['event_role'])), 'hidden-space-role'), 'another Space never supplies a contribution');
$out = reader($db)->read([199], 7, ['skill']);
verify($out['profiles'][199] === ['scopes' => ['global' => ['revision' => 0, 'permission_version' => 0, 'attributes' => []], 'space:7' => ['revision' => 0, 'permission_version' => 0, 'attributes' => []]], 'identity_version' => 0], 'missing states are explicit empty zero versions, not fabricated identity');
$db->createCommand()->delete('matcher_profile_state', ['user_id' => 1, 'scope_key' => 'space:7'])->execute();
$out = reader($db)->read([1], 7, ['skill', 'event_role']);
verify(attrs($out, 1, 'space:7') === [] && count(attrs($out)) === 1, 'missing activity profile does not suppress global optional data');

$db = F::database();
$db->createCommand()->update('matcher_profile_attribute', ['native_binding' => 'contact_phone'], ['field_key' => 'headline'])->execute();
rejects(fn() => reader($db)->read([1], 7, ['headline']), 'PROFILE_BATCH_UNAVAILABLE', 'stored binding cannot relabel private native data');
verify(!str_contains($db->selects[1]['sql'], 'mobile'), 'query never selects a native column from a stored unapproved binding');
$db = F::database();
$db->createCommand()->delete('profile', ['user_id' => 1])->execute();
verify(attrs(reader($db)->read([1], 7, ['headline'])) === [], 'missing native value stays unknown without fallback');
$db = F::database();
$db->createCommand('DROP TABLE profile')->execute();
$db->createCommand('DROP TABLE user')->execute();
verify(count(attrs(reader($db)->read([1], 7, ['skill']))) === 1, 'inline sources do not require unrelated native tables or optional columns');
$db = F::database();
verify(attrs(reader($db)->read([1], 7, ['mbti', 'seeking', 'bio'])) === [], 'native values alone never create confirmed public attributes');
F::attribute($db, 1, 'global', 'mbti', null, ['storage_kind' => 'native', 'native_binding' => 'mbti']);
F::attribute($db, 1, 'global', 'timezone', null, ['storage_kind' => 'native', 'native_binding' => 'timezone']);
F::attribute($db, 1, 'global', 'real_name', null, ['storage_kind' => 'native', 'native_binding' => 'real_name']);
F::attribute($db, 1, 'global', 'portfolio_link', null, ['storage_kind' => 'native', 'native_binding' => 'primary_portfolio_link', 'display_label' => 'Synthetic demo']);
$values = array_column(attrs(reader($db)->read([1], 7, ['mbti', 'timezone', 'real_name', 'portfolio_link'])), 'value', 'key');
verify($values['mbti'] === 'INTJ', 'reviewed native enum binding is read');
verify($values['timezone'] === 'Asia/Shanghai', 'reviewed native user-table binding is read');
verify($values['real_name'] === 'Synthetic Person', 'compound native name binding follows existing profile value semantics');
verify($values['portfolio_link'] === ['url' => 'https://example.org/demo', 'label' => 'Synthetic demo'], 'alternate native portfolio binding preserves its public value shape');
$db = F::database();
$db->createCommand()->update('matcher_profile_attribute', ['schema_version' => 1], ['field_key' => 'skill'])->execute();
verify(attrs(reader($db)->read([1], 7, ['skill'])) === [], 'older schema item is unknown until its shape is reviewed');
$db = F::database(); F::attribute($db, 1, 'global', 'event_goal', ['codes' => ['project']]);
rejects(fn() => reader($db)->read([1], 7, ['event_goal']), 'PROFILE_BATCH_UNAVAILABLE', 'activity field stored globally cannot cross scope');

foreach (['revision', 'permission_version', 'identity_version', 'current_revision_id', 'id'] as $column) {
    $db = F::database();
    $db->onSelect = static function (CountingConnection $db, int $n) use ($column): void {
        if ($n === 3) { $db->createCommand()->update('matcher_profile_state', [$column => in_array($column, ['id', 'current_revision_id'], true) ? 'replacement-state-or-revision' : 999], ['user_id' => 1, 'scope_key' => 'global'])->execute(); }
    };
    rejects(fn() => reader($db)->read([1], 7, ['skill']), 'PROFILE_BATCH_CHANGED', 'mid-read ' . $column . ' change rejects stale projection');
}
$db = F::database();
$db->onSelect = static function (CountingConnection $db, int $n): void { if ($n === 3) { $db->createCommand()->delete('matcher_profile_state', ['user_id' => 1, 'scope_key' => 'global'])->execute(); } };
rejects(fn() => reader($db)->read([1], 7, ['skill']), 'PROFILE_BATCH_CHANGED', 'mid-read state deletion rejects stale projection');
$db = F::database();
$db->onSelect = static function (CountingConnection $db, int $n): void { if ($n === 3) { F::state($db, 199, 'global'); } };
rejects(fn() => reader($db)->read([199], 7, ['skill']), 'PROFILE_BATCH_CHANGED', 'creation of a previously absent scope is detected');
$db = F::database();
$db->createCommand()->update('matcher_profile_attribute', ['visibility' => 'private'], ['field_key' => 'skill', 'state_id' => '1-global'])->execute();
$db->createCommand()->update('matcher_profile_state', ['permission_version' => 3], ['id' => '1-global'])->execute();
$out = reader($db)->read([1], 7, ['skill']);
verify(attrs($out) === [] && $out['profiles'][1]['scopes']['global']['permission_version'] === 3, 'later read respects committed privacy revocation');

$db = F::database(); $db->enableLogging = true; $db->enableProfiling = true;
$db->cache(fn() => reader($db)->read([1], 7, ['skill']));
foreach ($db->selects as $selected) { verify($selected['master'] && $selected['cache_disabled'] && !$selected['logging'] && !$selected['profiling'], 'SELECT uses master with cache and sensitive SQL logging disabled'); }
verify($db->enableLogging && $db->enableProfiling, 'logging flags restored after success');
$db->enableLogging = false; $db->enableProfiling = false;
$db->createCommand('DROP TABLE matcher_profile_attribute')->execute();
$db->enableLogging = true; $db->enableProfiling = true;
rejects(fn() => reader($db)->read([1], 7, ['skill']), 'PROFILE_BATCH_UNAVAILABLE', 'database failure is explicit and drops SQL exception chain');
verify($db->enableLogging && $db->enableProfiling, 'logging flags restored after failure');
$db = F::database(); $tx = $db->beginTransaction(); $db->selects = [];
rejects(fn() => reader($db)->read([1], 7, ['skill']), 'PROFILE_BATCH_TRANSACTION_UNSUPPORTED', 'pre-existing transaction cannot reuse an old authorization snapshot');
verify($tx->isActive && $db->selects === [], 'adapter never commits or rolls back caller transaction'); $tx->rollBack();
$db = F::database(); $db->createCommand()->update('matcher_profile_attribute', ['value_json' => '{not-json'], ['field_key' => 'skill'])->execute();
rejects(fn() => reader($db)->read([1], 7, ['skill']), 'PROFILE_BATCH_UNAVAILABLE', 'malformed JSON never becomes empty success');
$db = F::database(); $db->createCommand()->update('matcher_profile_state', ['revision' => -1], ['id' => '1-global'])->execute();
rejects(fn() => reader($db)->read([1], 7, ['skill']), 'PROFILE_BATCH_UNAVAILABLE', 'negative stored versions rejected');

// The application use case is independently testable without a database/framework in its port.
$memory = new class implements DiscoveryProfileBatchSource {
    public int $calls = 0; public array $result = [];
    public function read(DiscoveryProfileBatchRequest $request): array { $this->calls++; return $this->result; }
};
$db = F::database(); $memory->result = reader($db)->read([1], 7, ['skill']);
$memoryReader = new DiscoveryProfileBatchReader($memory);
verify($memoryReader->read([1], 7, ['skill']) === $memory->result && $memory->calls === 1, 'pure application reader runs through an injected memory source');
$memoryReader->read([], 7, ['skill']); verify($memory->calls === 1, 'empty request does not invoke source port');
$good = $memory->result;
$memory->result['profiles'][1]['scopes']['global']['attributes'][0]['visibility'] = 'private';
rejects(fn() => $memoryReader->read([1], 7, ['skill']), 'PROFILE_BATCH_UNAVAILABLE', 'unsafe source cannot export private attributes');
$memory->result = $good; $memory->result['profiles'][1]['scopes']['global']['attributes'][0]['key'] = 'contact_email';
rejects(fn() => $memoryReader->read([1], 7, ['skill']), 'PROFILE_BATCH_UNAVAILABLE', 'source cannot insert unrequested contacts');
$memory->result = $good; $memory->result['profiles'][2] = $good['profiles'][1];
rejects(fn() => $memoryReader->read([1], 7, ['skill']), 'PROFILE_BATCH_UNAVAILABLE', 'source cannot inject unrequested subjects');
$memory->result = ['schema_version' => 2, 'profiles' => []];
rejects(fn() => $memoryReader->read([1], 7, ['skill']), 'PROFILE_BATCH_UNAVAILABLE', 'partial dependency failure cannot masquerade as absent profile states');
$memory->result = $good;
$memory->result['profiles'][1]['scopes']['global']['attributes'][0]['raw_source'] = 'SYNTHETIC_PRIVATE_SOURCE';
$memory->result['profiles'][1]['scopes']['space:99'] = $good['profiles'][1]['scopes']['global'];
$memory->result['profiles'][1]['nickname'] = 'SYNTHETIC_PRIVATE_IDENTITY';
verify($memoryReader->read([1], 7, ['skill']) === $good, 'output allowlist strips internal metadata, other scopes and identity values');
$memory->result = $good;
$memory->result['profiles'][1]['scopes']['global']['attributes'][] = $good['profiles'][1]['scopes']['global']['attributes'][0];
rejects(fn() => $memoryReader->read([1], 7, ['skill']), 'PROFILE_BATCH_UNAVAILABLE', 'duplicate attribute identity is rejected rather than inflating features');

$queryCounts = [];
foreach ([1, 30, 200] as $size) {
    $db = F::database($size); $out = reader($db)->read(range(1, $size), 7, ['skill', 'headline', 'event_role']);
    $queryCounts[$size] = count($db->selects);
    verify(count($out['profiles']) === $size && count($db->selects) === 3, $size . ' owners use exactly three SELECTs');
    verify(count(attrs($out, $size)) === 2 && count(attrs($out, $size, 'space:7')) === 1, $size . ' owners include the last requested owner');
}
echo json_encode(['status' => 'passed', 'checks' => count($checks), 'checks_passed' => $checks, 'selects_by_owner_count' => $queryCounts, 'database' => 'new SQLite :memory: per fixture', 'existing_database_connected' => false, 'network_calls' => 0, 'model_calls' => 0], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
