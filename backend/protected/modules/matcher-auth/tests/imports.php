<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

use humhub\modules\matcherAuth\Module;
use humhub\modules\matcherAuth\adapters\native\GithubImportCoordinator;
use yii\db\Connection;

final class ImportActor extends \yii\base\Component { public bool $isGuest = false; public ?int $id = 1; }
final class SyntheticSources
{
    public array $history = [];
    public function transaction(callable $operation): mixed { return Yii::$app->db->transaction($operation); }
    public function hasSourceHistory(int $owner, string $kind): bool { return isset($this->history[$owner]); }
}
final class SyntheticWorkflow
{
    public int $calls = 0;
    public function transaction(int $owner, ?int $space, callable $operation): mixed { $this->calls++; return Yii::$app->db->transaction($operation); }
}
final class SyntheticSourceService
{
    public int $calls = 0;
    public bool $throws = false;
    public string $status = 'ready';
    public function __construct(private SyntheticSources $sources) {}
    public function import(int $owner, string $kind, array $input, string $requestKey): array
    {
        if ($kind !== 'github' || $input !== [] || !str_starts_with($requestKey, 'matcher-auth-github-')) { throw new LogicException('Unexpected import authority.'); }
        $this->calls++; $this->sources->history[$owner] = true;
        if ($this->throws) { throw new RuntimeException('Synthetic source failure.'); }
        return ['id' => 'synthetic-source-' . $owner, 'status' => $this->status];
    }
}
final class SyntheticProfileModule extends \yii\base\Module
{
    public SyntheticSources $sources;
    public SyntheticWorkflow $workflow;
    public SyntheticSourceService $service;
    public function init() { parent::init(); $this->sources = new SyntheticSources(); $this->workflow = new SyntheticWorkflow(); $this->service = new SyntheticSourceService($this->sources); }
    public function getSourceRepository(): SyntheticSources { return $this->sources; }
    public function getSourceService(): SyntheticSourceService { return $this->service; }
    public function getProfileWorkflow(): SyntheticWorkflow { return $this->workflow; }
}
$temporary = sys_get_temp_dir() . '/matcher-auth-import-' . bin2hex(random_bytes(10)); mkdir($temporary, 0700);
new \yii\console\Application(['id' => 'matcher-auth-import-offline', 'basePath' => __DIR__,
    'components' => ['db' => ['class' => Connection::class, 'dsn' => 'sqlite:' . $temporary . '/imports.sqlite'],
        'user' => ['class' => ImportActor::class], 'log' => ['class' => \yii\log\Dispatcher::class, 'targets' => []]],
    'modules' => ['matcher-user-profile' => ['class' => SyntheticProfileModule::class]]]);
$db = Yii::$app->db;
require dirname(__DIR__) . '/migrations/m261112_210000_authentication.php';
ob_start(); (new m261112_210000_authentication(['db' => $db]))->up(); ob_end_clean();
$db->createCommand('CREATE TABLE user_auth (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,source TEXT,source_id TEXT)')->execute();
$module = (new ReflectionClass(Module::class))->newInstanceWithoutConstructor();
$coordinator = new GithubImportCoordinator($module);
$profile = Yii::$app->getModule('matcher-user-profile');
$checks = 0;
function importCheck(string $name, bool $ok): void { global $checks; if (!$ok) { throw new LogicException($name); } $checks++; }
function intentState(int $owner): string { return Yii::$app->db->createCommand('SELECT state FROM matcher_auth_import WHERE owner_id=:owner', [':owner' => $owner])->queryScalar(); }
function setupImport(int $owner, string $reason = 'first_registration'): void
{
    global $coordinator, $db;
    Yii::$app->user->id = $owner;
    $db->createCommand()->insert('user_auth', ['user_id' => $owner, 'source' => 'github', 'source_id' => (string)(1000 + $owner)])->execute();
    $coordinator->schedule($owner, (string)(1000 + $owner), $reason);
}
try {
    setupImport(1); $coordinator->attemptPending(1);
    importCheck('first confirmed native binding imports once', intentState(1) === 'succeeded' && $profile->service->calls === 1);
    $coordinator->attemptPending(1); $coordinator->schedule(1, '1001', 'first_registration'); $coordinator->attemptPending(1);
    importCheck('repeat login and registration receipt cannot reimport', $profile->service->calls === 1);
    setupImport(2); $profile->sources->history[2] = 'deleted'; $coordinator->attemptPending(2);
    importCheck('deleted source history never resurrects', intentState(2) === 'skipped_existing' && $profile->service->calls === 1);
    setupImport(3); $profile->service->throws = true; $coordinator->attemptPending(3);
    importCheck('source exception leaves failed receipt without undoing session', intentState(3) === 'failed' && Yii::$app->user->id === 3 && !Yii::$app->user->isGuest);
    $profile->service->throws = false; $coordinator->attemptPending(3);
    importCheck('failed import never auto retries', $profile->service->calls === 2);
    setupImport(4); $profile->service->status = 'failed'; $coordinator->attemptPending(4);
    importCheck('failed DTO is never recorded as succeeded', intentState(4) === 'failed');
    $profile->service->status = 'ready';
    setupImport(5); $db->createCommand()->delete('user_auth', ['user_id' => 5])->execute(); $calls = $profile->service->calls; $coordinator->attemptPending(5);
    importCheck('removed verified binding revokes unattempted import', intentState(5) === 'revoked' && $profile->service->calls === $calls);
    setupImport(6); $db->createCommand()->insert('user_auth', ['user_id' => 6, 'source' => 'github', 'source_id' => 'ambiguous'])->execute(); $coordinator->attemptPending(6);
    importCheck('ambiguous native binding prevents source read', intentState(6) === 'revoked' && $profile->service->calls === $calls);
    setupImport(7, 'explicit_bind'); $coordinator->attemptPending(7);
    importCheck('explicit owner binding authorizes one import', intentState(7) === 'succeeded' && $profile->service->calls === $calls + 1);
    setupImport(8); Yii::$app->user->id = 999; $coordinator->attemptPending(8);
    importCheck('different actor cannot start receipt', intentState(8) === 'pending');
    Yii::$app->user->id = 8; Yii::$app->user->isGuest = true; $coordinator->attemptPending(8);
    importCheck('guest cannot start receipt', intentState(8) === 'pending');
    importCheck('history check runs in existing owner workflow', $profile->workflow->calls === 5);
    echo json_encode(['status' => 'passed', 'checks' => $checks, 'temporary_sqlite' => true, 'real_database_access' => false, 'network_access' => false, 'real_source_reads' => 0]), PHP_EOL;
} finally { $db->close(); foreach (glob($temporary . '/*') as $path) { unlink($path); } rmdir($temporary); }
