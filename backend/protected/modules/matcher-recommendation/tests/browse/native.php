<?php
declare(strict_types=1);
// Fully synthetic SQLite memory. Never bootstrap application config or connect to an existing database.
$backend = dirname(__DIR__, 5);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
foreach (['matcherRecommendation' => 'matcher-recommendation', 'matcherProfile' => 'matcher-user-profile', 'matcherPrivacy' => 'matcher-profile-privacy'] as $ns => $directory) { Yii::setAlias('@humhub/modules/' . $ns, $backend . '/protected/modules/' . $directory); }
use humhub\modules\matcherRecommendation\tests\native_access\{Fixtures, MutableSelection};
use humhub\modules\matcherRecommendation\adapters\browse\{DiscoverySettingsSchema, SqlDiscoverySettingsStore, NativeOrdinaryDiscoverySource};
use humhub\modules\matcherRecommendation\application\ManageDiscoverySettings;
use humhub\modules\matcherRecommendation\domain\browse\DiscoveryException;
use humhub\modules\matcherProfile\application\{ConfirmedIdentityBatchReader, DiscoveryProfileBatchReader};
use humhub\modules\matcherProfile\adapters\identity\SqlConfirmedIdentityBatchSource;
use humhub\modules\matcherProfile\adapters\persistence\SqlDiscoveryProfileBatchSource;
use humhub\modules\matcherPrivacy\application\DiscoveryBatchService;
use humhub\modules\matcherPrivacy\adapters\native\NativeDiscoveryRelations;
require_once dirname(__DIR__) . '/native_access/Fixtures.php';
$checks = [];
function check(bool $condition, string $label): void { global $checks; if (!$condition) { throw new RuntimeException('FAIL: ' . $label); } $checks[] = $label; }
function rejects(callable $callback, string $code): void
{ try { $callback(); } catch (DiscoveryException $error) { check($error->errorCode === $code, 'rejects ' . $code); return; } check(false, 'Expected ' . $code); }
$db = Fixtures::database(201); $db->schemaCache = new yii\caching\ArrayCache(); DiscoverySettingsSchema::install($db);
$selection = new MutableSelection(); $events = Fixtures::events($db, $selection);
$settings = new ManageDiscoverySettings($events, new SqlDiscoverySettingsStore($db, $events));
check($settings->read(1, 7) === ['space_id' => 7, 'discoverable' => false, 'version' => 0], 'SQL settings are false without a row');
check($settings->change(1, 7, 0, true) === ['space_id' => 7, 'discoverable' => true, 'version' => 1], 'SQL opt-in requires an explicit versioned insert');
rejects(fn() => $settings->change(1, 7, 0, false), 'DISCOVERY_VERSION_CONFLICT');
check($settings->change(1, 7, 1, false)['version'] === 2 && !$settings->read(1, 7)['discoverable'], 'SQL opt-out increments version');
$selection->value['space_id'] = 8; check($settings->read(1, 8)['version'] === 0, 'SQL settings are independent across Spaces'); $selection->value['space_id'] = 7;
foreach ([
    'CREATE TABLE profile (user_id INTEGER PRIMARY KEY, matcher_nickname TEXT, title TEXT, about TEXT, matcher_mbti TEXT, matcher_seeking TEXT)',
    'CREATE TABLE matcher_profile_state (id TEXT PRIMARY KEY, user_id INTEGER, scope_key TEXT, space_id INTEGER, revision INTEGER, permission_version INTEGER, identity_version INTEGER, current_revision_id TEXT, confirmed_avatar_ref TEXT, UNIQUE(user_id,scope_key))',
    'CREATE TABLE matcher_profile_attribute (attribute_id TEXT PRIMARY KEY, state_id TEXT, scope_key TEXT, field_key TEXT, storage_kind TEXT, native_binding TEXT, value_json TEXT, visibility TEXT, confirmation TEXT, last_confirmed_at TEXT, display_label TEXT, sort_order INTEGER, schema_version INTEGER)',
    'CREATE TABLE matcher_profile_draft (id TEXT PRIMARY KEY, state_id TEXT, draft_kind TEXT, origin TEXT, status TEXT, created_at TEXT)',
] as $sql) { $db->createCommand($sql)->execute(); }
for ($id = 2; $id <= 202; $id++) {
    $db->createCommand()->insert(DiscoverySettingsSchema::TABLE, ['owner_id' => $id, 'space_id' => 7, 'discoverable' => true, 'version' => 1])->execute();
    $db->createCommand()->insert('profile', ['user_id' => $id, 'matcher_nickname' => '模拟人物' . $id])->execute();
    foreach (['global', 'space:7'] as $scope) { $db->createCommand()->insert('matcher_profile_state', ['id' => $id . '-' . $scope, 'user_id' => $id, 'scope_key' => $scope, 'space_id' => $scope === 'global' ? null : 7, 'revision' => 1, 'permission_version' => 1, 'identity_version' => $scope === 'global' ? 1 : 0])->execute(); }
    $base = ['state_id' => $id . '-global', 'scope_key' => 'global', 'visibility' => 'authenticated', 'confirmation' => 'confirmed', 'last_confirmed_at' => '2026-11-12 00:00:00', 'sort_order' => 0, 'schema_version' => 2];
    $db->createCommand()->insert('matcher_profile_attribute', $base + ['attribute_id' => $id . '-nickname', 'field_key' => 'nickname', 'storage_kind' => 'native', 'native_binding' => 'nickname'])->execute();
    $db->createCommand()->insert('matcher_profile_attribute', $base + ['attribute_id' => $id . '-skill', 'field_key' => 'skill', 'storage_kind' => 'inline', 'value_json' => json_encode(['code' => $id === 202 ? 'last-person' : 'php', 'label' => 'Synthetic'])])->execute();
    $db->createCommand()->insert('matcher_profile_attribute', array_replace($base, ['attribute_id' => $id . '-private-skill', 'field_key' => 'skill', 'storage_kind' => 'inline', 'visibility' => 'private', 'value_json' => json_encode(['code' => 'private-code', 'label' => 'Private sentinel']), 'last_confirmed_at' => '2099-01-01 00:00:00']))->execute();
    $db->createCommand()->insert('matcher_profile_draft', ['id' => $id . '-draft', 'state_id' => $id . '-global', 'draft_kind' => 'identity', 'origin' => 'avatar_upload', 'status' => 'editing', 'created_at' => '2099-01-01 00:00:00'])->execute();
}
Fixtures::friend($db, 1, 2); Fixtures::friend($db, 2, 1); Fixtures::friend($db, 1, 3); Fixtures::friend($db, 4, 1);
$identity = new ConfirmedIdentityBatchReader(new SqlConfirmedIdentityBatchSource($db));
foreach ([1, 30, 200] as $count) {
    $db->selects = []; $result = $identity->read(range(2, $count + 1));
    check(count($result) === $count && count($db->selects) === 2, $count . ' identities use exactly two batch SELECTs');
    check(array_reduce($db->selects, static fn(bool $ok, array $read): bool => $ok && $read['master'] && $read['cache_disabled'] && !$read['logging'] && !$read['profiling'], true), 'identity SELECTs use master without cache or SQL logging');
}
$p1 = new DiscoveryProfileBatchReader(new SqlDiscoveryProfileBatchSource($db)); $p8 = new DiscoveryBatchService(new NativeDiscoveryRelations($db), $p1->read(...));
$profileSizes = []; $identitySizes = [];
$source = new NativeOrdinaryDiscoverySource($db, $events,
    static function ($viewer, $space, $ids, $keys) use ($p8, &$profileSizes): array { $profileSizes[] = count($ids); return $p8->read($viewer, $space, $ids, $keys); },
    static function ($ids) use ($identity, &$identitySizes): array { $identitySizes[] = count($ids); return $identity->read($ids); });
$cards = $source->readCurrent($events->resolve(1, 7));
check(count($cards) === 201 && isset($cards[202]), 'native source projects all 201 opt-in candidates before filtering');
check($profileSizes === [200, 1] && $identitySizes === [200, 1], 'profiles and identities share real 200-owner chunk boundaries');
check($cards[2]['relationship']['friend'] && $cards[3]['relationship']['pending_out'] && $cards[4]['relationship']['pending_in'], 'native source retains every real friend and pending direction');
check(!str_contains(json_encode($cards), 'private-code') && !str_contains(json_encode($cards), '2099-01-01'), 'private fields and unconfirmed identity uploads affect neither output nor recent sort');
$db->createCommand()->update('matcher_profile_attribute', ['visibility' => 'friends'], ['attribute_id' => '2-skill'])->execute();
check($source->readCurrent($events->resolve(1, 7))[2]['global']['attributes'] === [], 'friend-only skill does not enter ordinary discovery even for a real friend');
$db->createCommand()->update(DiscoverySettingsSchema::TABLE, ['discoverable' => false, 'version' => 2], ['owner_id' => 202])->execute();
check(!isset($source->readCurrent($events->resolve(1, 7))[202]), 'opt-out immediately removes the final candidate');
$db->createCommand()->update('matcher_profile_attribute', ['confirmation' => 'pending'], ['attribute_id' => '3-nickname'])->execute();
check(!isset($source->readCurrent($events->resolve(1, 7))[3]), 'unconfirmed nickname cannot fall back to native username or real name');
$db->createCommand()->update('matcher_profile_state', ['confirmed_avatar_ref' => 'mpr_00000000-0000-4000-8000-000000000002'], ['id' => '2-global'])->execute();
check($identity->read([2])[2]['avatar_ref'] === 'mpr_00000000-0000-4000-8000-000000000002', 'only committed avatar reference is returned');
$db->selects = [];
$db->onSelect = static function ($connection, int $count): void {
    if ($count === 2) { $connection->createCommand()->update('matcher_profile_state', ['identity_version' => 2], ['id' => '2-global'])->execute(); }
};
try { $identity->read([2]); check(false, 'identity version race must fail'); }
catch (\humhub\modules\matcherProfile\domain\ProfileException $error) { check($error->errorCode === 'PROFILE_BATCH_CHANGED', 'identity second observation detects concurrent confirmation'); }
$db->onSelect = null;
$raceEvents = new class implements \humhub\modules\matcherRecommendation\contracts\ports\CurrentEventAccess {
    public int $checks = 0;
    public function resolve(int $viewerId, ?int $requestedSpaceId = null): \humhub\modules\matcherRecommendation\contracts\CurrentEventContext
    { return new \humhub\modules\matcherRecommendation\contracts\CurrentEventContext($viewerId, $requestedSpaceId ?? 7, 'test-access', 'test-policy'); }
    public function assertCurrent(\humhub\modules\matcherRecommendation\contracts\CurrentEventContext $context): void
    { if (++$this->checks === 3) { throw new DiscoveryException('CONTEXT_CHANGED', 'Synthetic switch.', 409); } }
};
$raceStore = new SqlDiscoverySettingsStore($db, $raceEvents);
rejects(fn() => $raceStore->change($raceEvents->resolve(1, 7), 2, true), 'CONTEXT_CHANGED');
check(!$settings->read(1, 7)['discoverable'] && $settings->read(1, 7)['version'] === 4, 'failed settings postcheck restores only its own write with a newer version');
$big = Fixtures::database(2001); $big->schemaCache = new yii\caching\ArrayCache(); DiscoverySettingsSchema::install($big);
for ($id = 2; $id <= 2002; $id++) { $big->createCommand()->insert(DiscoverySettingsSchema::TABLE, ['owner_id' => $id, 'space_id' => 7, 'discoverable' => true, 'version' => 1])->execute(); }
$bigEvents = Fixtures::events($big); $calls = 0;
$bounded = new NativeOrdinaryDiscoverySource($big, $bigEvents, static function () use (&$calls): array { ++$calls; return []; }, static function () use (&$calls): array { ++$calls; return []; });
rejects(fn() => $bounded->readCurrent($bigEvents->resolve(1, 7)), 'DISCOVERY_CAPACITY_EXCEEDED');
check($calls === 0, 'oversized current Space fails before reading profiles; no prefix truncation');
echo json_encode(['status' => 'passed', 'checks' => count($checks), 'passed' => $checks, 'database' => 'new sqlite::memory: only', 'llm_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
