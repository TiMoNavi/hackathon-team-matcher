<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

use humhub\modules\matcherAuth\application\ChallengeService;
use humhub\modules\matcherAuth\adapters\persistence\SqlChallengeStore;
use humhub\modules\matcherAuth\adapters\native\ReceiptService;
use humhub\modules\matcherAuth\domain\AuthException;
use humhub\modules\matcherAuth\domain\ports\OtpMailer;
use yii\db\Connection;

final class SyntheticMailer implements OtpMailer
{
    public bool $enabled = true;
    public bool $success = true;
    public array $sent = [];
    public $duringSend = null;
    public function available(): bool { return $this->enabled; }
    public function send(string $email, string $code, int $expiresIn): bool
    {
        $this->sent[] = [$email, $code, $expiresIn];
        if ($this->duringSend !== null) { ($this->duringSend)(); }
        return $this->success;
    }
}
final class SyntheticSession extends \yii\base\Component
{
    private array $data = [];
    public function get($key, $default = null) { return $this->data[$key] ?? $default; }
    public function set($key, $value): void { $this->data[$key] = $value; }
    public function remove($key): void { unset($this->data[$key]); }
    public function has($key): bool { return isset($this->data[$key]); }
}
final class SyntheticActor extends \yii\base\Component { public bool $isGuest = true; public ?int $id = null; }

$checks = 0;
function check(string $name, bool $value): void { global $checks; if (!$value) { throw new LogicException($name); } $checks++; }
function rejects(string $name, string $code, callable $operation): void
{
    try { $operation(); } catch (AuthException $error) { check($name, $error->errorCode === $code); return; }
    throw new LogicException($name . ' was accepted.');
}
$temporary = sys_get_temp_dir() . '/matcher-auth-offline-' . bin2hex(random_bytes(10));
mkdir($temporary, 0700);
$database = $temporary . '/auth.sqlite';
new \yii\console\Application(['id' => 'matcher-auth-offline', 'basePath' => __DIR__, 'vendorPath' => dirname(__DIR__, 4) . '/protected/vendor',
    'components' => ['db' => ['class' => Connection::class, 'dsn' => 'sqlite:' . $database],
        'session' => ['class' => SyntheticSession::class], 'user' => ['class' => SyntheticActor::class],
        'log' => ['class' => \yii\log\Dispatcher::class, 'targets' => []]]]);
$db = Yii::$app->db;
$db->open(); $db->createCommand('PRAGMA busy_timeout=10000')->execute();
require dirname(__DIR__) . '/migrations/m261112_210000_authentication.php';
ob_start(); (new m261112_210000_authentication(['db' => $db]))->up(); ob_end_clean();
$store = new SqlChallengeStore($db);
$now = 1000000;
$clock = static function () use (&$now): int { return $now; };
$mailer = new SyntheticMailer();
$service = new ChallengeService($store, $mailer, str_repeat('a', 64), ['person@example.invalid', 'other@example.invalid'], $clock, static fn() => '128903');
$browser = str_repeat('b', 64);
try {
    foreach ([\humhub\modules\matcherAuth\Module::class, \humhub\modules\matcherAuth\controllers\ApiController::class,
        \humhub\modules\matcherAuth\controllers\NativeAuthController::class, \humhub\modules\matcherAuth\controllers\RegistrationController::class,
        \humhub\modules\matcherAuth\controllers\GithubAuthAction::class, \humhub\modules\matcherAuth\adapters\native\EmailCodeClient::class,
        \humhub\modules\matcherAuth\adapters\native\VerifiedGithubClient::class, \humhub\modules\matcherAuth\adapters\http\RedactedHttpClient::class] as $class) {
        check('load real native inheritance ' . $class, class_exists($class));
    }
    check('six authentication tables migrate in temporary SQLite', count(array_filter($db->schema->getTableNames(), static fn($name) => str_starts_with($name, 'matcher_auth_'))) === 6);
    $first = $service->request('Person@example.invalid', 'login', '/matcher/app', $browser, null);
    check('fixed challenge shape', preg_match('/^challenge-[a-f0-9]{48}$/D', $first['challenge_id']) === 1 && $first['expires_in'] === 600 && $first['resend_after'] === 60);
    $saved = $store->find($first['challenge_id']);
    check('no plaintext OTP is persisted', $saved['code_hash'] !== '128903' && strlen($saved['code_hash']) === 64 && !isset($saved['code']));
    check('normalized email and browser HMAC are persisted', $saved['email'] === 'person@example.invalid' && $saved['browser_hash'] !== $browser);
    rejects('immediate resend denied', 'RATE_LIMITED', fn() => $service->request('person@example.invalid', 'login', '/matcher/app', $browser, null));
    rejects('external return refused', 'INVALID_REQUEST', fn() => $service->request('person@example.invalid', 'login', '//example.invalid', $browser, null));
    rejects('unapproved destination never sends', 'AUTH_UNAVAILABLE', fn() => $service->request('unlisted@example.invalid', 'login', '/matcher/app', $browser, null));
    rejects('bind requires actor', 'AUTHENTICATION_REQUIRED', fn() => $service->request('other@example.invalid', 'bind', '/matcher/app', $browser, null));
    rejects('login refuses signed in actor', 'INVALID_REQUEST', fn() => $service->request('other@example.invalid', 'login', '/matcher/app', $browser, 11));
    rejects('another browser cannot consume', 'CHALLENGE_INVALID', fn() => $service->verify($first['challenge_id'], '128903', 'another-browser', null));
    check('foreign browser leaves attempt budget intact', $store->attempts($saved['email_hash'], 0) === []);
    rejects('wrong code persists failure', 'INVALID_CODE', fn() => $service->verify($first['challenge_id'], '000000', $browser, null));
    check('failure count committed', $store->find($first['challenge_id'])['failed_attempts'] === 1);
    $proof = $service->verify($first['challenge_id'], '128903', $browser, null);
    check('verified proof stays server side and purpose bound', $proof['email'] === 'person@example.invalid' && $proof['purpose'] === 'login' && $proof['actor_id'] === null);
    rejects('duplicate consumption refused', 'CHALLENGE_USED', fn() => $service->verify($first['challenge_id'], '128903', $browser, null));
    $now += 60;
    $second = $service->request('person@example.invalid', 'login', '/matcher/app', $browser, null);
    $now += 60;
    $third = $service->request('person@example.invalid', 'login', '/matcher/app', $browser, null);
    rejects('resend invalidates old code', 'CHALLENGE_INVALID', fn() => $service->verify($second['challenge_id'], '128903', $browser, null));
    $now += 60;
    rejects('three requests per ten minutes', 'RATE_LIMITED', fn() => $service->request('person@example.invalid', 'login', '/matcher/app', $browser, null));
    for ($i = 0; $i < 3; $i++) { rejects('wrong verification counts across codes', 'INVALID_CODE', fn() => $service->verify($third['challenge_id'], '000000', $browser, null)); }
    rejects('total five login attempts per fifteen minutes', 'RATE_LIMITED', fn() => $service->verify($third['challenge_id'], '128903', $browser, null));
    $now += 900;
    rejects('expiry refused', 'CHALLENGE_EXPIRED', fn() => $service->verify($third['challenge_id'], '128903', $browser, null));
    $bind = $service->request('other@example.invalid', 'bind', '/matcher/app', $browser, 11);
    rejects('changed actor cannot use bind code', 'CHALLENGE_INVALID', fn() => $service->verify($bind['challenge_id'], '128903', $browser, 12));
    check('bound actor can consume', $service->verify($bind['challenge_id'], '128903', $browser, 11)['purpose'] === 'bind');
    $now += 900; $mailer->success = false;
    rejects('mail failure cannot return success', 'MAIL_DELIVERY_FAILED', fn() => $service->request('person@example.invalid', 'login', '/matcher/app', $browser, null));
    check('mail failure stored and throttled', $store->recent($saved['email_hash'], $now - 1)[0]['status'] === 'delivery_failed');
    rejects('mail failure still consumes send budget', 'RATE_LIMITED', fn() => $service->request('person@example.invalid', 'login', '/matcher/app', $browser, null));
    $mailer->success = true; $now += 900;
    $mailer->duringSend = function () use (&$now, $mailer, $service, $browser): void { $mailer->duringSend = null; $now += 60; $service->request('person@example.invalid', 'login', '/matcher/app', $browser, null); };
    rejects('late delivery cannot revive superseded code', 'MAIL_DELIVERY_FAILED', fn() => $service->request('person@example.invalid', 'login', '/matcher/app', $browser, null));
    $now += 900;
    $race = $service->request('person@example.invalid', 'login', '/matcher/app', $browser, null);
    // Independent SQLite connections/processes race on the same persisted code; exactly one may consume.
    $children = [];
    for ($index = 0; $index < 2; $index++) {
        $pid = pcntl_fork();
        if ($pid === 0) {
            try {
                $connection = new Connection(['dsn' => 'sqlite:' . $database]); $connection->open(); $connection->createCommand('PRAGMA busy_timeout=10000')->execute();
                $concurrent = new ChallengeService(new SqlChallengeStore($connection), new SyntheticMailer(), str_repeat('a', 64), ['person@example.invalid'], $clock);
                $concurrent->verify($race['challenge_id'], '128903', $browser, null); $outcome = 'consumed';
            } catch (AuthException $error) { $outcome = $error->errorCode; }
            catch (Throwable $error) { $outcome = get_class($error); }
            file_put_contents($temporary . '/race-' . $index, $outcome); exit(0);
        }
        if ($pid < 0) { throw new RuntimeException('Could not start offline race process.'); }
        $children[] = $pid;
    }
    foreach ($children as $pid) { pcntl_waitpid($pid, $status); check('offline race child exits', pcntl_wexitstatus($status) === 0); }
    $outcomes = [file_get_contents($temporary . '/race-0'), file_get_contents($temporary . '/race-1')]; sort($outcomes);
    check('exactly one concurrent consume succeeds (' . implode(', ', $outcomes) . ')', $outcomes === ['CHALLENGE_USED', 'consumed']);
    $receipts = new ReceiptService($store, str_repeat('a', 64));
    $receipt = $receipts->issue(ReceiptService::REGISTRATION, 'github', 'registration', '123456', 'person@example.invalid', null);
    check('registration receipt contains only normalized verified identity', $receipts->read(ReceiptService::REGISTRATION)['subject'] === '123456');
    Yii::$app->user->isGuest = false; Yii::$app->user->id = 99;
    rejects('registration receipt refuses changed actor', 'CHALLENGE_INVALID', fn() => $receipts->read(ReceiptService::REGISTRATION));
    Yii::$app->user->isGuest = true; Yii::$app->user->id = null;
    $store->transaction(function () use ($store, $receipts, $receipt): void { $store->lock('receipt:' . $receipt['id']); $receipts->consume($receipts->locked($receipt['id']), 7); });
    rejects('registration receipt cannot replay', 'CHALLENGE_INVALID', fn() => $receipts->read(ReceiptService::REGISTRATION));
    $next = $receipts->issue(ReceiptService::OAUTH, 'github', 'login', '', '', null);
    $db->createCommand()->update('matcher_auth_receipt', ['expires_at' => time() - 1], ['id' => $next['id']])->execute();
    rejects('OAuth receipt expiry enforced', 'CHALLENGE_INVALID', fn() => $receipts->read(ReceiptService::OAUTH));
    $log = new \humhub\modules\matcherAuth\adapters\http\RedactedHttpClient();
    check('OAuth HTTP logs do not expose secrets', !str_contains($log->createRequestLogToken('POST', 'https://github.com?code=synthetic-secret', ['Authorization' => 'synthetic-secret'], 'client_secret=synthetic-secret'), 'synthetic-secret'));
    $priorMethod = $_SERVER['REQUEST_METHOD'] ?? null;
    foreach ([['api/v1/auth/email-codes', 'POST', 'application/json', true], ['api/v1/auth/email/verify', 'POST', 'application/json; charset=UTF-8', true],
        ['api/v1/auth/logout', 'POST', 'application/json', true], ['user/auth/login', 'POST', 'application/json', false],
        ['api/v1/me/profile', 'POST', 'application/json', false], ['api/v1/auth/email-codes/extra', 'POST', 'application/json', false],
        ['api/v1/auth/email-codes', 'GET', 'application/json', false], ['api/v1/auth/email-codes', 'POST', 'text/plain', false]] as [$path, $method, $type, $prepared]) {
        $_SERVER['REQUEST_METHOD'] = $method;
        $request = new \yii\web\Request(['cookieValidationKey' => 'synthetic-only', 'parsers' => ['application/json' => \yii\web\JsonParser::class]]);
        $request->setPathInfo($path); $request->setRawBody('{'); $request->headers->set('Content-Type', $type);
        \humhub\modules\matcherAuth\adapters\http\RequestBoundary::prepare($request);
        check('early body boundary never changes raw JSON', $request->getRawBody() === '{');
        if ($prepared) { check('auth POST defers early language parsing', $request->getBodyParams() === []); }
        elseif (str_starts_with($type, 'application/json')) {
            try { $request->getBodyParams(); throw new LogicException('Unrelated native JSON behavior changed.'); }
            catch (\yii\web\BadRequestHttpException) { check('other path or method retains native parser failure', true); }
        }
    }
    if ($priorMethod === null) { unset($_SERVER['REQUEST_METHOD']); } else { $_SERVER['REQUEST_METHOD'] = $priorMethod; }
    echo json_encode(['status' => 'passed', 'checks' => $checks, 'temporary_sqlite' => true, 'concurrent_processes' => 2,
        'real_database_access' => false, 'network_access' => false, 'real_mail_sent' => 0, 'secrets_read' => false], JSON_THROW_ON_ERROR), PHP_EOL;
} finally {
    $db->close();
    foreach (glob($temporary . '/*') as $file) { unlink($file); }
    rmdir($temporary);
}
