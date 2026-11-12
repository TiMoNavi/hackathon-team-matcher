<?php
declare(strict_types=1);
namespace humhub\components { class Module { public bool $isEnabled = true; } }
namespace {
    // Independent process: these pure container fixtures must not replace native classes in other tests.
    class Yii { public static object $app; }
    require dirname(__DIR__) . '/Module.php';
    require dirname(__DIR__) . '/Events.php';
    $checks = 0;
    foreach ([\humhub\modules\user\controllers\AuthController::class, ['class' => \humhub\modules\user\controllers\AuthController::class], 'SyntheticForeignSecurityController'] as $configured) {
        $auth = new \humhub\modules\matcherAuth\Module();
        $user = (object)['controllerMap' => ['auth' => $configured]];
        $clients = new class {
            public array $clients = ['github' => 'legacy', 'email-code' => 'legacy'];
            public function removeClient($id): void { unset($this->clients[$id]); }
            public function setClient($id, $value): void { $this->clients[$id] = $value; }
        };
        Yii::$app = new class($auth, $user, $clients) {
            public function __construct(private object $auth, private object $user, public object $authClientCollection) {}
            public function getModule(string $id): ?object { return $id === 'matcher-auth' ? $this->auth : ($id === 'user' ? $this->user : null); }
        };
        \humhub\modules\matcherAuth\Events::beforeRequest();
        if ($configured === 'SyntheticForeignSecurityController') {
            if ($auth->integrationReady || isset($clients->clients['github']) || isset($clients->clients['email-code']) || $user->controllerMap['auth'] !== $configured) { throw new \LogicException('Foreign security map fail-closed regression.'); }
            $checks += 4;
        } else {
            if (!$auth->integrationReady || $user->controllerMap['auth'] !== \humhub\modules\matcherAuth\controllers\NativeAuthController::class
                || $user->controllerMap['registration'] !== \humhub\modules\matcherAuth\controllers\RegistrationController::class) { throw new \LogicException('Native map integration regression.'); }
            $checks += 3;
        }
    }
    echo json_encode(['status' => 'passed', 'checks' => $checks, 'foreign_map_clients_removed' => true, 'network_access' => false, 'database_access' => false]), PHP_EOL;
}
