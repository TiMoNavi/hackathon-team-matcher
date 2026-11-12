<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
Yii::setAlias('@humhub/modules/matcherProfile', dirname(__DIR__, 2) . '/matcher-user-profile');

use humhub\modules\matcherAuth\Module;
use humhub\modules\matcherAuth\adapters\native\GithubImportStatusReader;
use humhub\modules\matcherAuth\controllers\GithubImportStatusController;
use humhub\modules\matcherAuth\domain\AuthException;
use humhub\modules\matcherAuth\domain\GithubImportStatus;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileAccessPolicy;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileRepository;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileSourceRepository;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileWorkflow;
use humhub\modules\matcherProfile\application\ProfileService;
use humhub\modules\matcherProfile\application\ProfileSourceService;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ports\ProfileSourceReader;
use humhub\modules\user\models\User;

final class ImportTestUser extends yii\base\Component { public bool $isGuest = false; public int $id = 1; public ?User $identity = null; }
final class ImportTestRequest extends yii\web\Request {
    public string $testMethod = 'GET'; public array $testQuery = [];
    public function getMethod() { return $this->testMethod; }
    public function getQueryParams() { return $this->testQuery; }
}
class ImportTestModule extends yii\base\Module { public bool $isEnabled = true; }
final class ImportTestReader implements ProfileSourceReader {
    public int $calls = 0; public bool $fail = false; public ?Closure $hook = null;
    public function kind(): string { return 'github'; }
    public function status(int $ownerId): array { return ['available' => true, 'provider_user_id' => '101']; }
    public function read(int $ownerId, array $input): array {
        ++$this->calls;
        if ($this->hook) { $hook = $this->hook; $this->hook = null; $hook(); }
        if ($this->fail) { throw new ProfileException('GITHUB_READ_FAILED', 'Synthetic redaction canary.', 502); }
        return ['external_id' => 'github:101', 'label' => 'Synthetic public source', 'canonical_url' => null,
            'raw_text' => 'Synthetic candidate bio', 'sections' => [['id' => 'bio', 'label' => 'Bio', 'text' => 'Synthetic candidate bio', 'locator' => ['line' => 1]]],
            'candidates' => [['id' => 'bio', 'key' => 'bio', 'value' => 'Synthetic candidate bio', 'evidence' => ['bio']]], 'metadata' => ['llm_calls' => 0]];
    }
}
final class ImportTestProfile extends ImportTestModule {
    public InMemoryProfileSourceRepository $sources; public InMemoryProfileWorkflow $workflow;
    public ProfileService $profiles; public ProfileSourceService $service; public ImportTestReader $reader;
    public function getSourceRepository(): InMemoryProfileSourceRepository { return $this->sources; }
    public function getProfileWorkflow(): InMemoryProfileWorkflow { return $this->workflow; }
    public function getSourceService(): ProfileSourceService { return $this->service; }
}
new yii\console\Application(['id' => 'github-import-isolated', 'basePath' => __DIR__, 'components' => [
    'db' => ['class' => yii\db\Connection::class, 'dsn' => 'sqlite::memory:'],
    'user' => ImportTestUser::class, 'request' => ImportTestRequest::class,
    'response' => yii\web\Response::class, 'log' => ['class' => yii\log\Dispatcher::class, 'targets' => []],
]]);
$db = Yii::$app->db;
require dirname(__DIR__) . '/migrations/m261112_210000_authentication.php';
ob_start(); (new m261112_210000_authentication(['db' => $db]))->up(); ob_end_clean();
$db->createCommand('CREATE TABLE user_auth (id INTEGER PRIMARY KEY,user_id INTEGER,source TEXT,source_id TEXT)')->execute();
$db->createCommand('CREATE TABLE user (id INTEGER PRIMARY KEY,status INTEGER)')->execute();
$profile = new ImportTestProfile('matcher-user-profile');
$profile->sources = new InMemoryProfileSourceRepository(); $profiles = new InMemoryProfileRepository();
$access = new InMemoryProfileAccessPolicy(); $access->users = [1, 2, 3, 4, 5, 6];
$profile->profiles = new ProfileService($profiles, $access);
$profile->workflow = new InMemoryProfileWorkflow($profiles, $profile->profiles, $access);
$profile->workflow->participants = [$profile->sources]; $profile->reader = new ImportTestReader();
$profile->service = new ProfileSourceService($profile->sources, $profile->workflow, $access, fn($kind) => $kind === 'github' ? $profile->reader : null);
Yii::$app->setModule('matcher-user-profile', $profile);
Yii::$app->setModule('matcher-github-import', new ImportTestModule('matcher-github-import'));
Yii::$app->setModule('auth-github', new ImportTestModule('auth-github'));
$module = (new ReflectionClass(Module::class))->newInstanceWithoutConstructor();
$coordinator = $module->imports(); $reader = new GithubImportStatusReader(); $checks = [];
function verifyImport(string $name, bool $condition): void { global $checks; if (!$condition) { throw new LogicException($name); } $checks[] = $name; }
function owner(int $id): void {
    Yii::$app->user->id = $id; Yii::$app->user->isGuest = false;
    $user = (new ReflectionClass(User::class))->newInstanceWithoutConstructor(); $user->setAttribute('id', $id); $user->setAttribute('status', User::STATUS_ENABLED);
    Yii::$app->user->identity = $user;
    Yii::$app->db->createCommand()->insert('user_auth', ['id' => $id, 'user_id' => $id, 'source' => 'github', 'source_id' => '101'])->execute();
}
function intent(int $id): array { return Yii::$app->db->createCommand('SELECT * FROM matcher_auth_import WHERE owner_id=:id', [':id' => $id])->queryOne(); }
owner(1);
verifyImport('no_receipt_does_not_import', $reader->read(1) === ['state' => 'not_requested', 'source_id' => null] && $profile->reader->calls === 0);
$coordinator->schedule(1, '101', 'first_registration'); $first = intent(1);
$coordinator->schedule(1, '101', 'first_registration');
verifyImport('receipt_schedule_is_idempotent', intent(1)['request_key'] === $first['request_key']);
verifyImport('pending_is_visible_without_source_or_network', $reader->read(1)['state'] === 'pending' && $profile->reader->calls === 0);
$profile->reader->hook = fn() => $coordinator->attemptPending(1);
$coordinator->attemptPending(1);
verifyImport('first_import_uses_existing_p1_once_despite_reentry', intent(1)['state'] === 'succeeded' && $profile->reader->calls === 1);
$status = $reader->read(1); $id = $status['source_id'];
verifyImport('ready_receipt_exposes_only_compact_owner_reference', array_keys($status) === ['state', 'source_id'] && $status['state'] === 'succeeded' && is_string($id));
verifyImport('automatic_import_never_confirms_profile', $profile->profiles->getProfile(1, 1, ProfileScope::global())['attributes'] === []);
verifyImport('candidate_is_in_private_source', $profile->service->get(1, $id)['snapshot']['candidates'][0]['key'] === 'bio');
$coordinator->attemptPending(1); $reader->read(1); $reader->read(1);
verifyImport('repeat_login_and_status_reads_never_refetch', $profile->reader->calls === 1);
$draft = $profile->workflow->createDraft(1, null);
$applied = $profile->service->apply(1, $id, 1, $draft['id'], 1, ['bio'], 'synthetic-explicit-select');
verifyImport('explicit_candidate_selection_uses_existing_draft', count($applied['applied']) === 1 && $applied['draft']['status'] === 'editing');
verifyImport('draft_selection_still_does_not_publish', $profile->profiles->getProfile(1, 1, ProfileScope::global())['attributes'] === []);
$profile->service->delete(1, $id, 1);
verifyImport('deleted_source_overrides_old_success', $reader->read(1) === ['state' => 'revoked', 'source_id' => null]);
$coordinator->attemptPending(1); verifyImport('deleted_source_is_not_restored_on_login', $profile->reader->calls === 1);
owner(2); $coordinator->schedule(2, '101', 'first_registration'); $profile->reader->fail = true; $coordinator->attemptPending(2);
verifyImport('read_failure_is_durable_and_visible', $reader->read(2)['state'] === 'failed' && is_string($reader->read(2)['source_id']));
$calls = $profile->reader->calls; $coordinator->attemptPending(2);
verifyImport('failed_import_does_not_retry_on_login', $profile->reader->calls === $calls);
verifyImport('failure_does_not_change_session', !Yii::$app->user->isGuest && Yii::$app->user->id === 2);
verifyImport('status_never_contains_source_or_provider_diagnostics', array_keys($reader->read(2)) === ['state', 'source_id'] && !str_contains(json_encode($reader->read(2)), 'Synthetic'));
$profile->reader->fail = false;
owner(3); $existing = $profile->service->import(3, 'github', [], 'synthetic-existing-source'); $calls = $profile->reader->calls;
$coordinator->schedule(3, '101', 'explicit_bind'); $coordinator->attemptPending(3);
verifyImport('existing_history_is_preserved', $reader->read(3)['state'] === 'skipped_existing' && $profile->reader->calls === $calls);
$profile->service->delete(3, $existing['id'], 1); $coordinator->attemptPending(3);
verifyImport('deleted_history_still_prevents_implicit_import', $profile->reader->calls === $calls);
owner(4); $coordinator->schedule(4, '101', 'first_registration');
$db->createCommand()->delete('user_auth', ['user_id' => 4])->execute(); $coordinator->attemptPending(4);
verifyImport('unlink_before_attempt_revokes_receipt', $reader->read(4)['state'] === 'revoked' && $profile->reader->calls === $calls);
owner(5); $coordinator->schedule(5, '101', 'first_registration');
$db->createCommand()->update('user_auth', ['source_id' => '202'], ['user_id' => 5])->execute();
verifyImport('changed_stable_identity_revokes_old_receipt', $reader->read(5)['state'] === 'revoked');
owner(6); $coordinator->schedule(6, '101', 'first_registration');
$profile->isEnabled = false;
verifyImport('disabled_module_hides_source_reference', $reader->read(6) === ['state' => 'unavailable', 'source_id' => null]);
$profile->isEnabled = true;
try { $reader->read(1); throw new LogicException('Foreign owner accepted'); } catch (AuthException $error) { verifyImport('reader_rejects_foreign_owner', $error->httpStatus === 401); }
Yii::$app->user->isGuest = true;
$coordinator->attemptPending(6); verifyImport('guest_cannot_attempt_import', intent(6)['state'] === 'pending');
$controller = new GithubImportStatusController('github-import-status', $module);
$response = $controller->actionIndex(); verifyImport('endpoint_guest_401', Yii::$app->response->statusCode === 401 && $response['error']['code'] === 'AUTHENTICATION_REQUIRED');
Yii::$app->user->isGuest = false; Yii::$app->response->statusCode = 200;
Yii::$app->request->testQuery = ['owner_id' => 1]; $response = $controller->actionIndex();
verifyImport('endpoint_caller_supplied_owner_rejected', Yii::$app->response->statusCode === 400 && !isset($response['data']));
Yii::$app->request->testQuery = []; Yii::$app->request->testMethod = 'POST'; $response = $controller->actionIndex();
verifyImport('endpoint_post_405', Yii::$app->response->statusCode === 405 && Yii::$app->response->headers->get('Allow') === 'GET');
Yii::$app->request->testMethod = 'GET'; Yii::$app->response->statusCode = 200; $before = intent(6); $response = $controller->actionIndex();
verifyImport('endpoint_is_compact_and_no_store', $response['data']['state'] === 'pending' && Yii::$app->response->headers->get('Cache-Control') === 'private, no-store');
verifyImport('endpoint_read_has_no_durable_side_effects', intent(6) === $before && $profile->reader->calls === $calls);
Yii::$app->user->identity->setAttribute('status', User::STATUS_DISABLED); $response = $controller->actionIndex();
verifyImport('disabled_account_403', Yii::$app->response->statusCode === 403);
foreach ([[], ['101', '101'], ['202']] as $subjects) { verifyImport('missing_ambiguous_or_changed_subject_revokes', GithubImportStatus::receipt($first, $subjects, true)['state'] === 'revoked'); }
verifyImport('malformed_success_has_no_usable_reference', GithubImportStatus::receipt([...$first, 'state' => 'succeeded', 'source_id' => '../other'], ['101'], true) === ['state' => 'unavailable', 'source_id' => null]);
echo json_encode(['passed' => true, 'checks' => $checks, 'check_count' => count($checks), 'storage' => 'sqlite memory + existing P1 memory adapters', 'network_calls' => 0, 'model_calls' => 0, 'real_oauth_proven' => false], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), PHP_EOL;
