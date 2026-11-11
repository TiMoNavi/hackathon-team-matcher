<?php
declare(strict_types=1);
// Synthetic SQLite memory only. Never load app config, .env, credentials or an existing database.
$backend = dirname(__DIR__, 5);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
foreach (['matcherRecommendation' => 'matcher-recommendation', 'matcherProfile' => 'matcher-user-profile', 'matcherPrivacy' => 'matcher-profile-privacy'] as $ns => $directory) { Yii::setAlias('@humhub/modules/' . $ns, $backend . '/protected/modules/' . $directory); }
require_once dirname(__DIR__, 3) . '/matcher-recommendation/tests/native_access/Fixtures.php';
use humhub\modules\matcherRecommendation\tests\native_access\{Fixtures, MutableSelection};
use humhub\modules\matcherRecommendation\adapters\browse\DiscoverySettingsSchema;
use humhub\modules\matcherProfile\adapters\persistence\SqlProfilePresentationRepository;
use humhub\modules\matcherPrivacy\adapters\persistence\SqlRelationSharingRepository;
use humhub\modules\matcherPrivacy\adapters\native\{NativeCurrentProfileEntry, NativeRelationCandidateSource};
use humhub\modules\matcherPrivacy\application\ProfileRelationService;
use humhub\modules\matcherPrivacy\domain\RelationCursor;
use humhub\modules\matcherProfile\domain\{ProfileException, RelationAccessContext};
$checks = [];
function ok(bool $test, string $label): void { global $checks; if (!$test) { throw new RuntimeException('FAILED: ' . $label); } $checks[] = $label; }
function deny(callable $action, int $status, string $label): void { try { $action(); } catch (ProfileException $error) { ok($error->httpStatus === $status, $label . ' status=' . $error->httpStatus); return; } throw new RuntimeException('FAILED: ' . $label); }
$db = Fixtures::database(3); $db->schemaCache = new yii\caching\ArrayCache(); DiscoverySettingsSchema::install($db);
foreach ([
    'CREATE TABLE setting (module_id TEXT,name TEXT,value TEXT)',
    'CREATE TABLE contentcontainer_setting (contentcontainer_id INTEGER,module_id TEXT,name TEXT,value TEXT)',
    'CREATE TABLE matcher_profile_presentation (id INTEGER PRIMARY KEY,version INTEGER NOT NULL,education_attribute_id TEXT,primary_portfolio_attribute_id TEXT)',
    'CREATE TABLE matcher_profile_relation_sharing (id TEXT PRIMARY KEY,owner_id INTEGER,space_id INTEGER,kind TEXT,object_id TEXT,version INTEGER,visibility TEXT,UNIQUE(owner_id,space_id,kind,object_id))',
    'CREATE TABLE matcher_profile_state (id TEXT PRIMARY KEY,user_id INTEGER,scope_key TEXT,identity_version INTEGER,confirmed_avatar_ref TEXT)',
    'CREATE TABLE matcher_profile_attribute (attribute_id TEXT PRIMARY KEY,state_id TEXT,scope_key TEXT DEFAULT global,field_key TEXT,native_binding TEXT,storage_kind TEXT DEFAULT native,schema_version INTEGER DEFAULT 2,confirmation TEXT,visibility TEXT,last_confirmed_at TEXT)',
    'CREATE TABLE matcher_profile_draft (id TEXT PRIMARY KEY,state_id TEXT,draft_kind TEXT,origin TEXT,status TEXT,created_at TEXT)',
    'CREATE TABLE profile (user_id INTEGER PRIMARY KEY,matcher_nickname TEXT)',
    'ALTER TABLE space ADD COLUMN guid TEXT',
    'ALTER TABLE space ADD COLUMN name TEXT',
    'ALTER TABLE space ADD COLUMN description TEXT',
] as $sql) { $db->createCommand($sql)->execute(); }
$db->createCommand()->insert('setting', ['module_id' => 'friendship', 'name' => 'enable', 'value' => '1'])->execute();
$db->createCommand()->update('space', ['guid' => 'synthetic-space-seven', 'name' => 'Synthetic Space Seven', 'description' => 'Formal synthetic Space description'], ['id' => 7])->execute();
$db->createCommand()->insert('matcher_profile_state', ['id' => 'state2', 'user_id' => 2, 'scope_key' => 'global', 'identity_version' => 1])->execute();
$db->createCommand()->insert('matcher_profile_attribute', ['attribute_id' => 'native-link', 'state_id' => 'state2', 'field_key' => 'portfolio_link', 'native_binding' => 'primary_portfolio_link', 'confirmation' => 'confirmed', 'visibility' => 'private'])->execute();
$db->createCommand()->insert('matcher_profile_attribute', ['attribute_id' => 'nickname2', 'state_id' => 'state2', 'field_key' => 'nickname', 'native_binding' => 'nickname', 'confirmation' => 'confirmed', 'visibility' => 'authenticated', 'last_confirmed_at' => '2026-11-12 00:00:00'])->execute();
$db->createCommand()->insert('profile', ['user_id' => 2, 'matcher_nickname' => 'Synthetic Two'])->execute();
$present = new SqlProfilePresentationRepository($db);
ok($present->read(2) === ['version' => 0, 'education_attribute_id' => null, 'primary_portfolio_attribute_id' => 'native-link'], 'SQL initial primary uses exact hidden native binding');
ok($db->createCommand('SELECT COUNT(*) FROM matcher_profile_presentation')->queryScalar() === '0', 'reading initial settings creates no rows');
$present->save(2, 0, 'education-choice', null);
ok((new SqlProfilePresentationRepository($db))->read(2)['primary_portfolio_attribute_id'] === null, 'explicit null persists across repository reload');
deny(fn() => $present->save(2, 0, null, null), 409, 'SQL simultaneous first-save conflict');
deny(fn() => $present->save(2, 99, null, null), 409, 'SQL stale update conflict');
ok($present->save(2, 1, 'education-choice', 'native-link')['version'] === 2, 'SQL presentation CAS advances version');
$db->createCommand()->delete('matcher_profile_attribute', ['attribute_id' => 'native-link'])->execute();
ok($present->read(2)['primary_portfolio_attribute_id'] === 'native-link', 'deleted choice remains exact reference');
$sharing = new SqlRelationSharingRepository($db);
ok($sharing->read(2, 7, 'activities') === [], 'SQL missing relation settings remain private defaults');
ok($sharing->save(2, 7, 'activities', '7', 0, 'authenticated')['version'] === 1, 'SQL relation sharing insert');
deny(fn() => $sharing->save(2, 7, 'activities', '7', 0, 'private'), 409, 'SQL relation first-save conflict');
ok($sharing->read(2, 8, 'activities') === [] && $sharing->read(3, 7, 'activities') === [], 'sharing settings isolated by owner and Space');
$selection = new MutableSelection(); $events = Fixtures::events($db, $selection);
$entry = new NativeCurrentProfileEntry($db, static function(int $viewerId, int $spaceId) use ($events): array { $c = $events->resolve($viewerId, $spaceId); return ['viewer_id' => $c->viewerId, 'space_id' => $c->spaceId, 'access_version' => $c->accessVersion, 'policy_version' => $c->policyVersion]; });
$db->createCommand()->insert(DiscoverySettingsSchema::TABLE, ['owner_id' => 2, 'space_id' => 7, 'discoverable' => 1, 'version' => 1])->execute();
$stamp = $entry->resolve(1, 2, 7);
ok($stamp['friend'] === false, 'opted-out viewer with real server selection reads opted-in owner');
deny(fn() => $entry->resolve(2, 2, 7), 403, 'caller viewer cannot substitute authenticated server actor');
deny(fn() => $entry->resolve(1, 2, 8), 403, 'requested Space cannot override server selection');
$db->createCommand()->update('matcher_profile_attribute', ['confirmation' => 'pending'], ['attribute_id' => 'nickname2'])->execute();
deny(fn() => $entry->resolve(1, 2, 7), 403, 'unconfirmed nickname removes actual card entrance');
$db->createCommand()->update('matcher_profile_attribute', ['confirmation' => 'confirmed', 'visibility' => 'private'], ['attribute_id' => 'nickname2'])->execute();
deny(fn() => $entry->resolve(1, 2, 7), 403, 'private nickname cannot use native name fallback');
$db->createCommand()->update('matcher_profile_attribute', ['visibility' => 'authenticated'], ['attribute_id' => 'nickname2'])->execute();
Fixtures::friend($db, 1, 2); Fixtures::friend($db, 2, 1);
ok($entry->resolve(1, 2, 7)['friend'] && $entry->resolve(1, 2, 7)['version'] !== $stamp['version'], 'real friendship dynamically enters entry fingerprint');
$source = new NativeRelationCandidateSource($db, static fn() => null);
$reader = new ProfileRelationService($entry, $source, $sharing, new RelationCursor(str_repeat('s', 32)));
$context = new RelationAccessContext(2, 1, 'event_card', '7', 7);
$items = $reader->read($context, 'activities')['items'];
ok(count($items) === 1 && $items[0]['title'] === 'Synthetic Space Seven' && $items[0]['event_id'] === '7', 'native current Space activity uses formal name and description');
ok(!str_contains(json_encode($items), 'membership_id') && !str_contains(json_encode($items), 'contentcontainer_id'), 'native internal IDs omitted');
deny(fn() => $reader->read($context, 'idea_groups'), 503, 'missing optional ideas source explicit availability failure');
$db->createCommand()->insert('contentcontainer_setting', ['contentcontainer_id' => 1007, 'module_id' => 'space', 'name' => 'hideMembers', 'value' => '1'])->execute();
ok($reader->read($context, 'activities')['items'] === [], 'Space hideMembers revokes activity relationship metadata');
$db->createCommand()->delete('contentcontainer_setting')->execute();
$db->createCommand()->insert('setting', ['module_id' => 'space', 'name' => 'defaultHideMembers', 'value' => '1'])->execute();
ok($reader->read($context, 'activities')['items'] === [], 'global default hideMembers applies when Space has no override');
$db->createCommand()->insert('contentcontainer_setting', ['contentcontainer_id' => 1007, 'module_id' => 'space', 'name' => 'hideMembers', 'value' => '0'])->execute();
ok(count($reader->read($context, 'activities')['items']) === 1, 'Space explicit showMembers overrides default');
$db->createCommand()->update(DiscoverySettingsSchema::TABLE, ['discoverable' => 0, 'version' => 2], ['owner_id' => 2])->execute();
deny(fn() => $reader->read($context, 'activities'), 403, 'live SQL owner optout revokes detail entrance');
$selection->value['actor_id'] = 2;
ok(count($reader->read(new RelationAccessContext(2, 2, 'self', '2', 7), 'activities')['items']) === 1, 'self with real server actor still reads own relation while opted-out');
$db->createCommand()->update('space_membership', ['status' => 2], ['user_id' => 2, 'space_id' => 7])->execute();
deny(fn() => $reader->read(new RelationAccessContext(2, 2, 'self', '2', 7), 'activities'), 403, 'self applicant cannot pose as formal member');
echo json_encode(['status' => 'passed', 'checks' => count($checks), 'passed' => $checks, 'database' => 'new sqlite::memory: only', 'llm_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
