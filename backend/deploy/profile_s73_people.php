<?php
/**
 * CLI-only synthetic fixtures. No reset/update mode, no model calls, no raw P1 JSON writes.
 * Each account + confirmed/draft profile is atomic. Discovery settings are a separate,
 * replayable ordinary owner use case because their adapter requires no open transaction.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/profile_s73_people_validate.php';

const S73_PEOPLE_TARGETS = ['humhub_profile_s73_test_root_4a70f3d1', 'humhub_profile_s73_test_audit_b7a2c940'];

function s73PeopleAssertTarget(string $target): void
{
    s73PeopleAssert(in_array($target, S73_PEOPLE_TARGETS, true), 'Only the two exact assigned S7.3 isolated databases are allowed; main and other targets are forbidden.');
}

function s73PeopleOptions(array $argv): array
{
    $action = $argv[1] ?? '';
    s73PeopleAssert(in_array($action, ['inspect', 'seed'], true), 'Use inspect|seed with explicit target, viewer-id and prefix.');
    $options = ['action' => $action];
    foreach (array_slice($argv, 2) as $argument) {
        s73PeopleAssert(preg_match('/^--([a-z-]+)=(.+)$/D', $argument, $match) === 1, 'Options must use explicit --key=value syntax.');
        s73PeopleAssert(in_array($match[1], ['target', 'viewer-id', 'prefix'], true) && !array_key_exists($match[1], $options), 'Unknown or duplicate option.');
        $options[$match[1]] = $match[2];
    }
    $target = $options['target'] ?? '';
    s73PeopleAssertTarget($target);
    s73PeopleAssert(getenv('MATCHER_S73_TEST_DB') === $target, 'MATCHER_S73_TEST_DB must exactly equal the explicit target before bootstrap.');
    s73PeopleAssert(($options['prefix'] ?? '') === 's73_sim_', 'Explicit --prefix=s73_sim_ is required; other namespaces are forbidden.');
    s73PeopleAssert(preg_match('/^[1-9][0-9]{0,9}$/D', $options['viewer-id'] ?? '') === 1, 'An explicit existing administrator viewer-id is required.');
    $options['viewer-id'] = (int)$options['viewer-id'];
    return $options;
}

/** Pure guard. Invalid targets are rejected before parsing or opening transport. */
function s73PeopleTargetDsn(string $dsn, string $target): string
{
    s73PeopleAssertTarget($target);
    s73PeopleAssert(str_starts_with($dsn, 'mysql:'), 'Only a local MySQL transport is supported.');
    $parts = [];
    foreach (explode(';', substr($dsn, 6)) as $part) {
        if ($part === '') { continue; }
        $pair = explode('=', $part, 2);
        s73PeopleAssert(count($pair) === 2 && !isset($parts[$pair[0]]) && in_array($pair[0], ['host', 'port', 'dbname', 'charset', 'unix_socket'], true), 'Database DSN must use reviewed unambiguous parameters.');
        $parts[$pair[0]] = $pair[1];
    }
    s73PeopleAssert(isset($parts['dbname']) && preg_match('/^[a-zA-Z0-9_]+$/D', $parts['dbname']) === 1, 'Database DSN must name a source database.');
    if (isset($parts['unix_socket'])) {
        s73PeopleAssert(str_starts_with($parts['unix_socket'], '/') && !isset($parts['host']) && !isset($parts['port']), 'Only an explicit local Unix socket is allowed.');
    } else { s73PeopleAssert(in_array($parts['host'] ?? '', ['127.0.0.1', 'localhost', '::1'], true), 'Only a loopback database host is allowed.'); }
    if (isset($parts['port'])) { s73PeopleAssert(ctype_digit($parts['port']) && (int)$parts['port'] >= 1 && (int)$parts['port'] <= 65535, 'Invalid local database port.'); }
    return preg_replace('/(?<=:|;)dbname=[^;]*/', 'dbname=' . $target, $dsn, 1);
}

function s73PeopleBootstrap(string $backend, string $target): object
{
    s73PeopleAssertTarget($target);
    s73PeopleAssert(getenv('MATCHER_S73_TEST_DB') === $target, 'Target environment mismatch before bootstrap.');
    defined('YII_DEBUG') || define('YII_DEBUG', false);
    defined('YII_ENV') || define('YII_ENV', 'prod');
    $loader = require $backend . '/protected/vendor/autoload.php';
    Dotenv\Dotenv::createMutable($backend, '.env')->safeLoad();
    require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
    Yii::setAlias('@humhub', $backend . '/protected/humhub');
    $loader->addClassMap([humhub\services\BootstrapService::class => $backend . '/protected/humhub/services/BootstrapService.php']);
    $bootstrap = new humhub\services\BootstrapService();
    $config = $bootstrap->getConfig('console');
    $dsn = s73PeopleTargetDsn($config['components']['db']['dsn'], $target);
    $config['components']['db']['dsn'] = $dsn;
    $_ENV['HUMHUB_CONFIG__COMPONENTS__DB__DSN'] = $dsn;
    $config['components']['db']['enableLogging'] = false;
    $config['components']['db']['enableProfiling'] = false;
    $config['components']['db']['enableSchemaCache'] = false;
    $config['components']['cache'] = ['class' => yii\caching\ArrayCache::class];
    $config['components']['runtimeCache'] = ['class' => yii\caching\ArrayCache::class, 'serializer' => false];
    $config['components']['log']['targets'] = [];
    $config['runtimePath'] = $backend . '/.runtime/profile-s73/' . $target . '/bootstrap-runtime';
    if (!is_dir($config['runtimePath'])) { s73PeopleAssert(mkdir($config['runtimePath'], 0700, true), 'Cannot create isolated runtime.'); }
    $app = new humhub\components\console\Application($config);
    s73PeopleAssert($app->db->createCommand('SELECT DATABASE()')->queryScalar() === $target, 'Database target verification failed.');
    s73PeopleAssert($app->mailer->useFileTransport === true, 'Configured local mailer must already use file transport.');
    if (($ai = $app->getModule('matcher-onboarding-ai')) !== null) { $ai->configPath = $config['runtimePath'] . '/disabled-ai-config.json'; }
    return $app;
}

function s73PeopleGuid(): string
{
    $bytes = random_bytes(16); $bytes[6] = chr((ord($bytes[6]) & 15) | 64); $bytes[8] = chr((ord($bytes[8]) & 63) | 128); $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
}

function s73PeopleSaveManifest(string $path, array $manifest): void
{
    $temporary = $path . '.tmp-' . bin2hex(random_bytes(5));
    s73PeopleAssert(file_put_contents($temporary, json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL, LOCK_EX) !== false, 'Cannot save installation journal.');
    chmod($temporary, 0600);
    s73PeopleAssert(rename($temporary, $path), 'Cannot atomically replace installation journal.');
}

function s73PeopleValidateJournalRecords(array $manifest, array $data): void
{
    $expected = array_column($data['people'], 'number', 'fixture_key');
    $seenIds = []; $seenGuids = [];
    s73PeopleAssert(is_array($manifest['people'] ?? null) && is_array($manifest['spaces'] ?? null), 'Installation journal collections are invalid.');
    foreach ($manifest['people'] as $key => $record) {
        s73PeopleAssert(isset($expected[$key]) && is_array($record) && ($record['number'] ?? null) === $expected[$key], 'Installation journal contains an account outside the fixed 400-person dataset.');
        s73PeopleAssert(in_array($record['status'] ?? null, ['reserved', 'profile_complete', 'complete'], true) && is_array($record['discovery'] ?? null), 'Installation journal has an invalid account phase.');
        s73PeopleAssert(array_diff(array_keys($record['discovery']), array_keys($data['people'][$expected[$key] - 1]['spaces'])) === [], 'Journal discovery settings refer to an unrelated Space.');
        if (isset($record['id'])) { s73PeopleAssert(is_int($record['id']) && $record['id'] > 0 && !isset($seenIds[$record['id']]), 'Journal account IDs must be unique positive integers.'); $seenIds[$record['id']] = true; }
        s73PeopleAssert(preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $record['guid'] ?? '') === 1 && !isset($seenGuids[$record['guid']]), 'Journal ownership GUIDs must be unique random v4 identifiers.'); $seenGuids[$record['guid']] = true;
    }
    foreach ($manifest['spaces'] as $alias => $record) {
        s73PeopleAssert(isset($data['spaces'][$alias]) && is_array($record) && in_array($record['status'] ?? null, ['reserved', 'complete'], true), 'Journal contains an unrelated Space or phase.');
        s73PeopleAssert(preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $record['guid'] ?? '') === 1 && !isset($seenGuids[$record['guid']]), 'Journal Space ownership GUID is invalid.'); $seenGuids[$record['guid']] = true;
        if (isset($record['id'])) { s73PeopleAssert(is_int($record['id']) && $record['id'] > 0, 'Journal Space ID must be positive.'); }
    }
}

function s73PeopleSaveModel(object $model): void
{
    s73PeopleAssert($model->save(), 'Native model validation failed (' . get_class($model) . ').');
}

/** Trusted synthetic owner selection, followed by ordinary native membership validation. */
function s73PeopleDiscoverySettings(object $db, int $ownerId, int $spaceId): object
{
    $selection = new class($ownerId, $spaceId) implements humhub\modules\matcherRecommendation\adapters\native\ServerSelectionSource {
        public function __construct(private int $ownerId, private int $spaceId) {}
        public function read(): array { return ['actor_id' => $this->ownerId, 'space_id' => $this->spaceId, 'selection_revision' => 'selection-' . substr(hash('sha256', 's73-fixture:' . $this->ownerId . ':' . $this->spaceId), 0, 32)]; }
    };
    $events = new humhub\modules\matcherRecommendation\adapters\native\NativeCurrentEventAccess($db, $selection, 'ordinary-activity-access-v1');
    return new humhub\modules\matcherRecommendation\application\ManageDiscoverySettings($events, new humhub\modules\matcherRecommendation\adapters\browse\SqlDiscoverySettingsStore($db, $events));
}

/** Anonymous counts and content hash only; all selected rows belong to journal-owned fixture IDs. */
function s73PeopleSnapshot(object $db, int $userId): string
{
    $states = (new yii\db\Query())->from('{{%matcher_profile_state}}')->where(['user_id' => $userId])->orderBy('scope_key')->all($db);
    $stateIds = array_column($states, 'id'); $rows = ['states' => $states];
    foreach (['matcher_profile_attribute', 'matcher_profile_draft'] as $table) {
        $rows[$table] = (new yii\db\Query())->from('{{%' . $table . '}}')->where(['state_id' => $stateIds])->orderBy($table === 'matcher_profile_attribute' ? 'attribute_id' : 'id')->all($db);
    }
    $rows['profile'] = (new yii\db\Query())->from('{{%profile}}')->where(['user_id' => $userId])->one($db);
    return hash('sha256', json_encode($rows, JSON_THROW_ON_ERROR));
}

function s73PeopleMain(array $argv): array
{
    $options = s73PeopleOptions($argv); $target = $options['target']; $backend = dirname(__DIR__);
    [$data, $summary] = s73PeopleReadDataset(dirname($backend) . '/docs/用户画像收集/examples/s73-people_2026-11-12.json');
    $app = s73PeopleBootstrap($backend, $target); $db = $app->db;
    $viewer = humhub\modules\user\models\User::findOne($options['viewer-id']);
    s73PeopleAssert($viewer !== null && $viewer->isActive() && $viewer->isSystemAdmin(false), 'Viewer must be an existing active native administrator.');
    foreach (['matcher-user-profile', 'matcher-profile-privacy', 'matcher-recommendation'] as $moduleId) {
        s73PeopleAssert($app->getModule($moduleId)?->isEnabled === true, 'Required S7.3 module is not enabled: ' . $moduleId);
    }
    foreach (['matcher_profile_state', 'matcher_profile_attribute', 'matcher_profile_draft', 'matcher_recommendation_discovery_settings'] as $table) { s73PeopleAssert($db->schema->getTableSchema('{{%' . $table . '}}') !== null, 'Required S7.3 table is missing. Run reviewed migrations first.'); }
    $p1 = $app->getModule('matcher-user-profile'); s73PeopleAssert(!$p1->isInMaintenance(), 'P1 is in maintenance.');
    $runtime = $backend . '/.runtime/profile-s73/' . $target;
    if (!is_dir($runtime)) { s73PeopleAssert(mkdir($runtime, 0700, true), 'Cannot create private S7 runtime directory.'); }
    $path = $runtime . '/people-manifest.json'; $lock = fopen($runtime . '/people-manifest.lock', 'c');
    s73PeopleAssert($lock !== false && flock($lock, LOCK_EX | LOCK_NB), 'Another synthetic installation is running.');
    chmod($runtime . '/people-manifest.lock', 0600);
    $manifest = is_file($path) ? json_decode(file_get_contents($path), true, 128, JSON_THROW_ON_ERROR) : ['version' => 1, 'target' => $target, 'dataset_id' => $data['dataset_id'], 'dataset_sha256' => $summary['sha256'], 'synthetic' => true, 'prefix' => $options['prefix'], 'viewer_id' => (int)$viewer->id, 'spaces' => [], 'people' => []];
    s73PeopleAssert(($manifest['version'] ?? null) === 1 && ($manifest['target'] ?? null) === $target && ($manifest['dataset_id'] ?? null) === $data['dataset_id'] && ($manifest['dataset_sha256'] ?? null) === $summary['sha256'] && ($manifest['synthetic'] ?? null) === true && ($manifest['prefix'] ?? null) === $options['prefix'] && ($manifest['viewer_id'] ?? null) === (int)$viewer->id, 'Installation journal belongs to a different dataset, target or viewer.');
    s73PeopleValidateJournalRecords($manifest, $data);
    $existingUsers = humhub\modules\user\models\User::find()->where(['or', ['username' => array_column($data['people'], 'username')], ['email' => array_column($data['people'], 'email')]])->all();
    foreach ($existingUsers as $user) {
        $owned = $manifest['people'][$user->username] ?? null;
        s73PeopleAssert($owned !== null && $owned['guid'] === $user->guid && (!isset($owned['id']) || $owned['id'] === (int)$user->id), 'Synthetic username/email collision with an account outside this installation journal.');
    }
    foreach ($manifest['people'] as $key => $record) {
        s73PeopleAssert(preg_match('/^s73_sim_[0-9]{3}$/D', $key) === 1, 'Unowned account name in installation journal.');
        $user = humhub\modules\user\models\User::findOne(['guid' => $record['guid']]);
        s73PeopleAssert($user === null ? $record['status'] === 'reserved' : $user->username === $key && (!isset($record['id']) || $record['id'] === (int)$user->id), 'An owned account was removed or its ownership no longer matches. No overwrite is permitted.');
    }
    foreach ($data['spaces'] as $alias => $definition) {
        $existing = humhub\modules\space\models\Space::findOne(['name' => $definition['name']]);
        $owned = $manifest['spaces'][$alias] ?? null;
        s73PeopleAssert($existing === null || ($owned !== null && $owned['guid'] === $existing->guid && (!isset($owned['id']) || $owned['id'] === (int)$existing->id)), 'A named simulation Space exists outside this installation journal.');
        if ($owned !== null) {
            $space = humhub\modules\space\models\Space::findOne(['guid' => $owned['guid']]);
            s73PeopleAssert($space === null ? $owned['status'] === 'reserved' : !isset($owned['id']) || $owned['id'] === (int)$space->id, 'Owned Space was removed or replaced; no recreation is permitted.');
        }
    }
    $created = 0; $preserved = 0; $recovered = 0; $suppressed = ['queue' => 0, 'activity' => 0, 'mail' => 0, 'notification' => 0];
    if ($options['action'] === 'seed') {
        s73PeopleAssert(!humhub\modules\space\models\Space::find()->where(['auto_add_new_members' => 1])->exists(), 'Native auto-add Space membership is enabled; stop to avoid joining unrelated activities.');
        s73PeopleAssert(!humhub\modules\user\models\Invite::find()->where(['email' => array_column($data['people'], 'email')])->exists(), 'A pending invite conflicts with the synthetic email namespace.');
        $app->queue->on(yii\queue\Queue::EVENT_BEFORE_PUSH, static function ($event) use (&$suppressed): void { $event->handled = true; ++$suppressed['queue']; }, null, false);
        yii\base\Event::on(humhub\modules\activity\services\ActivityManager::class, humhub\modules\activity\services\ActivityManager::EVENT_BEFORE_DISPATCH, static function ($event) use (&$suppressed): void { $event->isValid = false; $event->handled = true; ++$suppressed['activity']; }, null, false);
        $app->mailer->on(yii\mail\BaseMailer::EVENT_BEFORE_SEND, static function ($event) use (&$suppressed): void { $event->isValid = false; $event->handled = true; ++$suppressed['mail']; }, null, false);
        yii\base\Event::on(humhub\modules\notification\models\Notification::class, yii\db\ActiveRecord::EVENT_BEFORE_INSERT, static function ($event) use (&$suppressed): void { $event->isValid = false; $event->handled = true; ++$suppressed['notification']; }, null, false);
        $app->user->switchIdentity($viewer);
        foreach ($data['spaces'] as $alias => $definition) {
            if (!isset($manifest['spaces'][$alias])) {
                $manifest['spaces'][$alias] = ['guid' => s73PeopleGuid(), 'status' => 'reserved']; s73PeopleSaveManifest($path, $manifest);
            }
            $record = $manifest['spaces'][$alias]; $space = humhub\modules\space\models\Space::findOne(['guid' => $record['guid']]);
            if ($space === null) {
                $tx = $db->beginTransaction(yii\db\Transaction::READ_COMMITTED);
                try {
                    $space = new humhub\modules\space\models\Space(['guid' => $record['guid'], 'name' => $definition['name'], 'description' => $definition['description'], 'visibility' => humhub\modules\space\models\Space::VISIBILITY_NONE, 'join_policy' => humhub\modules\space\models\Space::JOIN_POLICY_NONE, 'status' => humhub\modules\space\models\Space::STATUS_ENABLED, 'auto_add_new_members' => 0]);
                    s73PeopleSaveModel($space);
                    s73PeopleAssert($space->addMember((int)$viewer->id, 1, true, humhub\modules\space\models\Space::USERGROUP_ADMIN), 'Cannot add administrator to simulation Space.');
                    $tx->commit();
                } catch (Throwable $error) { if ($tx->isActive) { $tx->rollBack(); } throw $error; }
            }
            $manifest['spaces'][$alias] = ['guid' => $record['guid'], 'id' => (int)$space->id, 'status' => 'complete']; s73PeopleSaveManifest($path, $manifest);
        }
        foreach ($data['people'] as $person) {
            $key = $person['fixture_key'];
            if (!isset($manifest['people'][$key])) { $manifest['people'][$key] = ['number' => $person['number'], 'guid' => s73PeopleGuid(), 'status' => 'reserved', 'discovery' => []]; s73PeopleSaveManifest($path, $manifest); }
            $record = $manifest['people'][$key]; $user = humhub\modules\user\models\User::findOne(['guid' => $record['guid']]);
            if ($user === null) {
                $tx = $db->beginTransaction(yii\db\Transaction::READ_COMMITTED);
                try {
                    $user = new humhub\modules\user\models\User(['guid' => $record['guid'], 'username' => $key, 'email' => $person['email'], 'status' => humhub\modules\user\models\User::STATUS_ENABLED, 'visibility' => humhub\modules\user\models\User::VISIBILITY_REGISTERED_ONLY, 'language' => 'zh-CN', 'time_zone' => 'Asia/Shanghai']);
                    $user->allowAssignDefaultGroup(false); s73PeopleSaveModel($user);
                    $user->profile->user_id = $user->id; s73PeopleSaveModel($user->profile);
                    $password = new humhub\modules\user\models\Password(['user_id' => $user->id]);
                    $secret = bin2hex(random_bytes(32)); $password->setPassword($secret); unset($secret); s73PeopleSaveModel($password); unset($password);
                    foreach ($person['spaces'] as $alias => $block) {
                        $space = humhub\modules\space\models\Space::findOne($manifest['spaces'][$alias]['id']);
                        s73PeopleAssert($space->addMember((int)$user->id, 1, true), 'Cannot add fixture member to simulation Space.');
                    }
                    $p1->getIdentityService()->update((int)$user->id, 0, ['nickname' => $person['nickname']]);
                    s73PeoplePopulateProfile($p1->getProfileService(), (int)$user->id, humhub\modules\matcherProfile\domain\ProfileScope::global(), $person['global']);
                    foreach ($person['spaces'] as $alias => $block) { s73PeoplePopulateProfile($p1->getProfileService(), (int)$user->id, humhub\modules\matcherProfile\domain\ProfileScope::event($manifest['spaces'][$alias]['id']), $block); }
                    $hash = s73PeopleSnapshot($db, (int)$user->id);
                    $tx->commit(); ++$created;
                } catch (Throwable $error) { if ($tx->isActive) { $tx->rollBack(); } throw $error; }
                $record['initial_profile_sha256'] = $hash;
            } else {
                if ($record['status'] === 'reserved') { ++$recovered; } else { ++$preserved; }
                $hash = s73PeopleSnapshot($db, (int)$user->id);
                // Legacy journals hash the initial profile before transaction commit.
                // Do not compare that representation with post-commit snapshots or
                // label a difference as a user edit. Replay preservation is evidenced
                // by skipped writes and the final current_content_sha256 comparison.
                // A committed account is proof that its complete P1 transaction committed.
                // Never replace current values, even when a user changed them after a crash.
                $record['initial_profile_sha256'] ??= $hash;
            }
            $record['id'] = (int)$user->id; $record['status'] = 'profile_complete'; $manifest['people'][$key] = $record; s73PeopleSaveManifest($path, $manifest);
            foreach ($person['spaces'] as $alias => $block) {
                if (($record['discovery'][$alias]['status'] ?? '') === 'complete') { continue; }
                $spaceId = $manifest['spaces'][$alias]['id']; $settings = s73PeopleDiscoverySettings($db, (int)$user->id, $spaceId);
                $current = $settings->read((int)$user->id, $spaceId);
                if ($current['version'] === 0) { $current = $settings->change((int)$user->id, $spaceId, 0, $block['discoverable']); }
                // version > 0 can be a completed write whose journal flush was interrupted,
                // or a subsequent owner edit. Preserve both; never force the fixture flag again.
                $record['discovery'][$alias] = ['status' => 'complete', 'initial_version' => $current['version'], 'initial_discoverable' => $current['discoverable']];
                $manifest['people'][$key] = $record; s73PeopleSaveManifest($path, $manifest);
            }
            $record['status'] = 'complete'; $manifest['people'][$key] = $record; s73PeopleSaveManifest($path, $manifest);
        }
    }
    $mapping = []; $hashes = []; $consent = ['primary' => 0, 'secondary' => 0]; $members = ['primary' => 0, 'secondary' => 0];
    foreach ($manifest['people'] as $key => $record) {
        $user = humhub\modules\user\models\User::findOne(['guid' => $record['guid']]);
        if ($user === null) { continue; }
        $mapping[(string)$record['number']] = (int)$user->id; $hashes[$key] = s73PeopleSnapshot($db, (int)$user->id);
        foreach ($manifest['spaces'] as $alias => $space) {
            if (!isset($space['id'])) { continue; }
            if (!humhub\modules\space\models\Membership::find()->where(['space_id' => $space['id'], 'user_id' => $user->id, 'status' => humhub\modules\space\models\Membership::STATUS_MEMBER])->exists()) { continue; }
            ++$members[$alias];
            $value = (new yii\db\Query())->select('discoverable')->from('{{%matcher_recommendation_discovery_settings}}')->where(['owner_id' => $user->id, 'space_id' => $space['id']])->scalar($db);
            $consent[$alias] += (int)(bool)$value;
        }
    }
    ksort($mapping, SORT_NUMERIC); ksort($hashes);
    return ['status' => 'passed', 'action' => $options['action'], 'target' => $target, 'synthetic' => true, 'dataset' => $summary, 'target_guard' => 'exact-assigned-clone-and-prefix', 'mailer_file_transport' => true, 'llm_calls' => 0, 'created_people' => $created, 'preserved_people' => $preserved, 'recovered_people' => $recovered, 'mapped_people' => count($mapping), 'current_space_members' => $members, 'current_discoverable' => $consent, 'primary_space_id' => $manifest['spaces']['primary']['id'] ?? null, 'secondary_space_id' => $manifest['spaces']['secondary']['id'] ?? null, 'people' => $mapping, 'current_content_sha256' => hash('sha256', json_encode($hashes, JSON_THROW_ON_ERROR)), 'suppressed_side_effects' => $suppressed];
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    try { echo json_encode(s73PeopleMain($argv), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), PHP_EOL; }
    catch (Throwable $error) {
        // Native/SQL exceptions may contain bound values; only our own fixed guard errors are printed.
        $reason = $error instanceof S73PeopleGuardException ? $error->getMessage() : 'Installation failed; no raw database or credential diagnostics are printed.';
        $diagnostics = ['file' => basename($error->getFile()), 'line' => $error->getLine(), 'trace' => array_map(static fn(array $frame): array => ['file' => basename($frame['file'] ?? ''), 'line' => $frame['line'] ?? null, 'function' => ($frame['class'] ?? '') . ($frame['type'] ?? '') . ($frame['function'] ?? '')], array_slice($error->getTrace(), 0, 8))];
        if ($error instanceof yii\db\Exception) {
            $info = $error->errorInfo ?? [];
            if (is_string($info[0] ?? null) && preg_match('/^[A-Z0-9]{5}$/D', $info[0])) { $diagnostics['sqlstate'] = $info[0]; }
            if (is_numeric($info[1] ?? null)) { $diagnostics['driver_code'] = (int)$info[1]; }
            if (preg_match("/Unknown column '([a-zA-Z0-9_.]+)'/", $error->getMessage(), $match)) { $diagnostics['unknown_column_identifier'] = $match[1]; }
            if (preg_match("/Table '([a-zA-Z0-9_]+)[.]([a-zA-Z0-9_]+)' doesn't exist/", $error->getMessage(), $match)) { $diagnostics['missing_table_identifier'] = $match[2]; }
        }
        fwrite(STDERR, json_encode(['status' => 'failed', 'type' => get_class($error), 'reason' => $reason, 'diagnostics' => $diagnostics], JSON_UNESCAPED_UNICODE) . PHP_EOL); exit(1);
    }
}
