<?php
declare(strict_types=1);
// Standalone synthetic legacy-module assembly: no Yii app, vendor bootstrap or database.
namespace humhub\components { class Module {} }
namespace humhub\services { class ModuleService {} }
namespace humhub\modules\matcherProfile {
    final class Module extends \humhub\components\Module
    {
        public bool $isEnabled = true;
        public string $version = '0.3.0';
        // The legacy P1 module intentionally has no discovery batch getter.
    }
}
namespace {
    final class Yii { public static object $app; }
    $privacy = dirname(__DIR__, 2);
    require dirname($privacy) . '/matcher-user-profile/domain/ProfileException.php';
    require $privacy . '/Module.php';
    $legacy = new \humhub\modules\matcherProfile\Module();
    Yii::$app = new class($legacy) {
        public function __construct(private object $profile) {}
        public function getModule(string $id): object { return $this->profile; }
        public function __get(string $key): never { throw new \RuntimeException('No database or other runtime service may be accessed.'); }
    };
    $module = new \humhub\modules\matcherPrivacy\Module();
    if ($module->profileModule() !== $legacy) { throw new \RuntimeException('Legacy ordinary-profile dependency was changed.'); }
    try {
        $module->getDiscoveryBatchService();
        throw new \RuntimeException('Missing batch capability was accepted.');
    } catch (\humhub\modules\matcherProfile\domain\ProfileException $error) {
        if ($error->errorCode !== 'PROFILE_DEPENDENCY_UNAVAILABLE' || $error->httpStatus !== 503 || $error->getPrevious() !== null) {
            throw new \RuntimeException('Legacy batch capability did not fail explicitly.');
        }
    }
    echo json_encode(['status' => 'passed', 'checks' => 2, 'database_calls' => 0, 'checks_passed' => ['Legacy P1 remains valid for existing ordinary privacy paths', 'Missing batch capability returns explicit 503 before database access']]) . PHP_EOL;
}
