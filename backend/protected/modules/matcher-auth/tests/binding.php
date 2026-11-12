<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

use humhub\modules\matcherAuth\Module;
use humhub\modules\matcherAuth\adapters\native\NativeIdentityService;
use humhub\modules\matcherAuth\domain\AuthException;
use humhub\modules\user\models\User;
use yii\db\Connection;

// Adapted from the independent audit's executed synthetic regression; no real account/session.
$temporary = sys_get_temp_dir() . '/matcher-auth-bind-' . bin2hex(random_bytes(10));
mkdir($temporary, 0700); $file = $temporary . '/bind.sqlite';
new yii\console\Application(['id' => 'matcher-auth-bind-offline', 'basePath' => __DIR__,
    'components' => ['db' => ['class' => Connection::class, 'dsn' => 'sqlite:' . $file], 'log' => ['class' => yii\log\Dispatcher::class, 'targets' => []]]]);
$db = Yii::$app->db; $db->open(); $db->createCommand('PRAGMA busy_timeout=10000')->execute();
require dirname(__DIR__) . '/migrations/m261112_210000_authentication.php';
ob_start(); (new m261112_210000_authentication(['db' => $db]))->up(); ob_end_clean();
$db->createCommand('CREATE TABLE user (id INTEGER PRIMARY KEY,email TEXT NOT NULL,status INTEGER NOT NULL,user_source TEXT,username TEXT)')->execute();
$db->createCommand('CREATE TABLE user_auth (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,source TEXT,source_id TEXT)')->execute();
for ($id = 1; $id <= 6; $id++) { $db->createCommand()->insert('user', ['id' => $id, 'email' => 'person' . $id . '@example.invalid', 'status' => 1, 'user_source' => 'local', 'username' => 'synthetic_' . $id])->execute(); }
$checks = 0;
function checkBind(string $name, bool $ok): void { global $checks; if (!$ok) { throw new LogicException($name); } $checks++; }
function bindIdentity(int $owner, string $subject, string $email = 'verified@example.invalid'): void
{
    $module = (new ReflectionClass(Module::class))->newInstanceWithoutConstructor();
    $service = new NativeIdentityService($module);
    $user = (new ReflectionClass(User::class))->newInstanceWithoutConstructor(); $user->setAttribute('id', $owner);
    $bind = new ReflectionMethod($service, 'bind'); $keys = new ReflectionMethod($service, 'keys');
    $module->store()->transaction(function () use ($module, $service, $user, $owner, $subject, $email, $bind, $keys): void {
        $module->store()->lockMany($keys->invoke($service, 'github', $subject, $email, $owner));
        $bind->invoke($service, 'github', $subject, $email, $user);
    });
}
function conflictBind(string $name, callable $operation): void
{
    try { $operation(); } catch (AuthException $error) { checkBind($name, $error->errorCode === 'IDENTITY_CONFLICT'); return; }
    throw new LogicException($name . ' was accepted.');
}
try {
    bindIdentity(1, '101'); checkBind('first bind writes native identity', (int)$db->createCommand("SELECT user_id FROM user_auth WHERE source_id='101'")->queryScalar() === 1);
    bindIdentity(1, '101'); checkBind('same owner bind is idempotent', (int)$db->createCommand('SELECT COUNT(*) FROM user_auth')->queryScalar() === 1);
    conflictBind('different owner cannot move identity', fn() => bindIdentity(2, '101'));
    checkBind('conflict preserves original identity', (int)$db->createCommand("SELECT user_id FROM user_auth WHERE source_id='101'")->queryScalar() === 1);
    conflictBind('second provider identity cannot overwrite first', fn() => bindIdentity(1, '202'));
    conflictBind('other native mailbox owner prevents binding', fn() => bindIdentity(1, '202', 'person2@example.invalid'));
    $db->createCommand()->delete('user_auth', ['source_id' => '101'])->execute();
    conflictBind('native deletion cannot transfer durable ownership claim', fn() => bindIdentity(2, '101'));
    checkBind('conflicting claim creates no replacement mapping', (int)$db->createCommand('SELECT COUNT(*) FROM user_auth')->queryScalar() === 0);
    bindIdentity(1, '101'); checkBind('same owner may explicitly restore own mapping', (int)$db->createCommand('SELECT COUNT(*) FROM user_auth')->queryScalar() === 1);
    foreach ([2, 3] as $owner) { $db->createCommand()->insert('user_auth', ['user_id' => $owner, 'source' => 'github', 'source_id' => '303'])->execute(); }
    conflictBind('ambiguous native mappings fail closed', fn() => bindIdentity(2, '303'));
    checkBind('ambiguous native rows are never rewritten', (int)$db->createCommand("SELECT COUNT(*) FROM user_auth WHERE source_id='303'")->queryScalar() === 2);
    $children = [];
    foreach ([4, 5] as $owner) {
        $pid = pcntl_fork();
        if ($pid === 0) {
            try {
                Yii::$app->db->close(); $connection = new Connection(['dsn' => 'sqlite:' . $file]); $connection->open();
                $connection->createCommand('PRAGMA busy_timeout=10000')->execute(); Yii::$app->set('db', $connection);
                bindIdentity($owner, '404', 'race@example.invalid'); $result = 'bound';
            } catch (AuthException $error) { $result = $error->errorCode; }
            catch (Throwable $error) { $result = get_class($error); }
            file_put_contents($temporary . '/race-' . $owner, $result); exit(0);
        }
        if ($pid < 0) { throw new RuntimeException('Offline fork failed.'); } $children[] = $pid;
    }
    foreach ($children as $pid) { pcntl_waitpid($pid, $status); checkBind('binding race process exits', pcntl_wexitstatus($status) === 0); }
    $outcomes = [file_get_contents($temporary . '/race-4'), file_get_contents($temporary . '/race-5')]; sort($outcomes);
    checkBind('only one competing native bind succeeds', $outcomes === ['IDENTITY_CONFLICT', 'bound']);
    checkBind('race leaves one native mapping', (int)$db->createCommand("SELECT COUNT(*) FROM user_auth WHERE source_id='404'")->queryScalar() === 1);
    checkBind('claim and native owner agree', (int)$db->createCommand("SELECT user_id FROM user_auth WHERE source_id='404'")->queryScalar() === (int)$db->createCommand('SELECT user_id FROM matcher_auth_identity_claim WHERE subject_hash=:hash', [':hash' => hash('sha256', '404')])->queryScalar());
    echo json_encode(['status' => 'passed', 'checks' => $checks, 'temporary_sqlite' => true, 'concurrent_processes' => 2,
        'real_database_access' => false, 'network_access' => false, 'real_login_proven' => false]), PHP_EOL;
} finally {
    $db->close(); foreach (glob($temporary . '/*') as $path) { unlink($path); } rmdir($temporary);
}
