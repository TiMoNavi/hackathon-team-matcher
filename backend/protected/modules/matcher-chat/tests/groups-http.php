<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
$backend = dirname(__DIR__, 4);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');

use humhub\modules\matcherChat\adapters\http\RequestBoundary;
use humhub\modules\matcherChat\controllers\GroupController;
use humhub\modules\matcherChat\domain\{ChatException, GroupCommand};
use humhub\modules\matcherChat\Module;
use humhub\modules\user\models\User;

$checks = 0;
function groupHttpCheck(bool $condition, string $label): void { global $checks; ++$checks; if (!$condition) { throw new RuntimeException($label); } }
function groupHttpError(callable $operation, string $code, int $status): void
{
    try { $operation(); } catch (ChatException $error) { groupHttpCheck($error->errorCode === $code && $error->httpStatus === $status, $code); return; }
    throw new RuntimeException('Expected failure ' . $code);
}
final class GroupHttpIdentity extends User { public function attributes() { return ['id', 'status']; } }
final class GroupHttpRequest extends \yii\web\Request
{
    public bool $csrfValid = true;
    public int $csrfChecks = 0;
    public function validateCsrfToken($clientSuppliedToken = null) { ++$this->csrfChecks; return $this->csrfValid; }
}
// Real controller and Yii action dispatch, with only session and CSRF result
// seams. No application bootstrap, database, HTTP listener or native data.
final class GroupHttpApplication extends \yii\web\Application
{
    public GroupHttpRequest $fixtureRequest;
    public \yii\web\Response $fixtureResponse;
    public \yii\web\User $fixtureUser;
    public function __construct() {}
    public function getRequest() { return $this->fixtureRequest; }
    public function getResponse() { return $this->fixtureResponse; }
    public function getUser() { return $this->fixtureUser; }
    public function getErrorHandler() { return new \yii\web\ErrorHandler(); }
    public function hasModule($id) { return false; }
    public function getI18n() { return new \yii\i18n\I18N(); }
}
$previous = Yii::$app;
$app = new GroupHttpApplication(); Yii::$app = $app;
$app->fixtureRequest = new GroupHttpRequest(['enableCookieValidation' => false]);
$app->fixtureRequest->setHostInfo('https://synthetic.invalid');
$app->fixtureRequest->setPathInfo('api/v1/conversations/groups');
$app->fixtureRequest->setQueryParams([]);
$app->fixtureResponse = new \yii\web\Response();
$app->fixtureUser = new \yii\web\User(['identityClass' => GroupHttpIdentity::class, 'enableSession' => true]);
$app->set('request', $app->fixtureRequest);
$app->set('response', $app->fixtureResponse);
$app->set('user', $app->fixtureUser);
$identity = (new ReflectionClass(GroupHttpIdentity::class))->newInstanceWithoutConstructor();
$identity->setAttribute('id', 1); $identity->setAttribute('status', User::STATUS_ENABLED);
$app->fixtureUser->setIdentity($identity);
$module = new Module('matcher-chat');
$settings = new class extends \yii\base\Component {
    public mixed $value = null;
    public int $reads = 0;
    public function getUncached($key) { ++$this->reads; if ($key !== 'groupsEnabled') { throw new LogicException('Unexpected setting'); } return $this->value; }
};
$module->set('settings', $settings);
$controller = new GroupController('group', $module);
groupHttpCheck(!$module->groupsEnabled && !$module->isGroupsEnabled() && $settings->reads === 0, 'config default off and no dependency query');
$module->groupsEnabled = true;
foreach ([null, '', '0', 'false', true, 1] as $value) { $settings->value = $value; groupHttpCheck(!$module->isGroupsEnabled(), 'strict persistent switch off'); }
$settings->value = '1'; groupHttpCheck(!$module->isGroupsEnabled(), 'mail dependency missing remains unavailable');
$module->groupsEnabled = false;

$key = '12345678-1234-4234-8234-123456789012';
$body = ['client_command_id' => $key, 'confirmation_intent' => 'create_group', 'title' => 'Synthetic group'];
$bodyMethod = new ReflectionMethod(GroupController::class, 'body');
$idMethod = new ReflectionMethod(GroupController::class, 'id');
$request = $app->fixtureRequest;
$request->headers->set('Content-Type', 'application/json');
$request->setRawBody(json_encode($body, JSON_THROW_ON_ERROR));
groupHttpCheck($bodyMethod->invoke($controller) === $body, 'exact flat JSON preserved');
foreach (['{', '[]', 'null', 'true', '{"a":{"b":{"c":{"d":1}}}}', '{"title":"a","title":"b"}', '{"title":"a","ti\u0074le":"b"}'] as $raw) {
    $request->setRawBody($raw); groupHttpError(fn () => $bodyMethod->invoke($controller), 'INVALID_GROUP_COMMAND', 422);
}
$request->setRawBody(json_encode([...$body, 'title' => 'quoted "title": value, \\ exact'], JSON_THROW_ON_ERROR));
groupHttpCheck($bodyMethod->invoke($controller)['title'] === 'quoted "title": value, \\ exact', 'quoted values cannot masquerade as duplicate keys');
$request->setRawBody(str_repeat(' ', 4097)); groupHttpError(fn () => $bodyMethod->invoke($controller), 'INVALID_REQUEST', 413);
$request->headers->set('Content-Type', 'text/plain'); groupHttpError(fn () => $bodyMethod->invoke($controller), 'INVALID_REQUEST', 415);
$request->headers->set('Content-Type', 'application/json');
foreach (['01', '0', '1 ', '+1', '-1', '1e0', '9007199254740992', ['1'], true, null, 1.5] as $value) { groupHttpError(fn () => $idMethod->invoke($controller, $value), 'INVALID_ARGUMENT', 422); }
groupHttpCheck($idMethod->invoke($controller, '9007199254740991') === 9007199254740991, 'safe boundary id accepted exactly');

$originalMethod = $_SERVER['REQUEST_METHOD'] ?? null;
function groupHttpRun(string $action, string $method, array $params = []): array
{
    global $app, $controller;
    $_SERVER['REQUEST_METHOD'] = $method;
    $app->fixtureResponse->statusCode = 200;
    $app->fixtureResponse->headers->removeAll();
    return $controller->runAction($action, $params);
}
function groupHttpFailure(string $action, string $method, int $status, string $code, array $params = []): void
{
    global $app;
    $result = groupHttpRun($action, $method, $params);
    groupHttpCheck($app->fixtureResponse->statusCode === $status && ($result['error']['code'] ?? null) === $code, 'controller ' . $action . ' ' . $code);
    groupHttpCheck($app->fixtureResponse->headers->get('Cache-Control') === 'private, no-store' && $app->fixtureResponse->headers->get('X-Content-Type-Options') === 'nosniff', 'private error headers');
    groupHttpCheck(preg_match('/^[a-f0-9]{24}$/D', $result['meta']['request_id']) === 1, 'opaque request id');
}
$request->setRawBody(json_encode($body, JSON_THROW_ON_ERROR));
groupHttpFailure('create', 'GET', 405, 'METHOD_NOT_ALLOWED');
groupHttpCheck($app->fixtureResponse->headers->get('Allow') === 'POST', 'correct method header');
groupHttpFailure('invitation', 'POST', 405, 'METHOD_NOT_ALLOWED', ['id' => '1']);
groupHttpFailure('unknown', 'POST', 404, 'NOT_FOUND');
$request->headers->set('Origin', 'https://other.invalid'); groupHttpFailure('create', 'POST', 403, 'CROSS_ORIGIN_DENIED'); $request->headers->remove('Origin');
$request->headers->set('Sec-Fetch-Site', 'same-site'); groupHttpFailure('create', 'POST', 403, 'CROSS_ORIGIN_DENIED'); $request->headers->remove('Sec-Fetch-Site');
$request->headers->set('X-Matcher-Chat-Actor', '2'); groupHttpFailure('create', 'POST', 401, 'SESSION_CHANGED'); $request->headers->remove('X-Matcher-Chat-Actor');
$app->fixtureUser->setIdentity(null); groupHttpFailure('create', 'POST', 401, 'AUTHENTICATION_REQUIRED'); $app->fixtureUser->setIdentity($identity);
$identity->setAttribute('status', 0); groupHttpFailure('create', 'POST', 403, 'ACCOUNT_UNAVAILABLE'); $identity->setAttribute('status', User::STATUS_ENABLED);
$request->setQueryParams(['actor_id' => 1]); groupHttpFailure('create', 'POST', 422, 'INVALID_ARGUMENT'); $request->setQueryParams([]);
$request->csrfValid = false; groupHttpFailure('create', 'POST', 400, 'INVALID_REQUEST'); $request->csrfValid = true;
groupHttpCheck($request->csrfChecks > 0 && $request->enableCsrfValidation && $controller->enableCsrfValidation, 'real Yii beforeAction invokes CSRF without disabling validation');
groupHttpFailure('create', 'POST', 503, 'CHAT_GROUPS_UNAVAILABLE');
foreach (['invite', 'accept', 'decline', 'withdraw', 'leave'] as $action) {
    $command = ['client_command_id' => $key, 'confirmation_intent' => GroupCommand::INTENTS[$action], $action === 'invite' ? 'target_user_id' : 'expected_version' => $action === 'invite' ? 2 : 1];
    $request->setRawBody(json_encode($command, JSON_THROW_ON_ERROR));
    groupHttpFailure($action, 'POST', 503, 'CHAT_GROUPS_UNAVAILABLE', ['id' => '10']);
}
$request->setRawBody(''); groupHttpFailure('invitation', 'GET', 503, 'CHAT_GROUPS_UNAVAILABLE', ['id' => '20']);
$request->setRawBody('{}'); groupHttpFailure('invitation', 'GET', 422, 'INVALID_ARGUMENT', ['id' => '20']);
$request->setRawBody(json_encode([...$body, 'actor_id' => 1], JSON_THROW_ON_ERROR)); groupHttpFailure('create', 'POST', 422, 'INVALID_GROUP_COMMAND');
$request->setRawBody(json_encode($body, JSON_THROW_ON_ERROR)); groupHttpFailure('invite', 'POST', 422, 'INVALID_ARGUMENT', ['id' => '01']);

$config = require dirname(__DIR__) . '/config.php';
$routes = array_filter($config['urlManagerRules'], static fn ($target) => str_starts_with($target, 'matcher-chat/group/'));
groupHttpCheck(count($routes) === 7, 'seven explicit group routes and no list or search surface');
$app->set('urlManager', new \yii\web\UrlManager(['enablePrettyUrl' => true, 'showScriptName' => false, 'cache' => false, 'rules' => $routes]));
$resolvedRequest = new \yii\web\Request(['enableCookieValidation' => false]);
$resolvedRequest->setScriptUrl('/index.php');
$resolvedRequest->setPathInfo('api/v1/group-invitations/20');
$resolvedRequest->setQueryParams(['id' => '21']);
[$resolvedRoute, $resolvedParams] = $resolvedRequest->resolve();
groupHttpCheck($resolvedRoute === 'matcher-chat/group/invitation' && $resolvedParams['id'] === '20'
    && $resolvedRequest->queryParams['id'] === '20', 'real Yii pretty path ID takes precedence over conflicting query ID');
$resolvedRequest->setPathInfo('api/v1/conversations/10/invitations');
$resolvedRequest->setQueryParams(['id' => ['99']]);
[$resolvedRoute, $resolvedParams] = $resolvedRequest->resolve();
groupHttpCheck($resolvedRoute === 'matcher-chat/group/invite' && $resolvedParams['id'] === '10', 'real Yii route ID cannot be overridden by query array');
foreach ($routes as $pattern => $target) {
    if (str_ends_with($target, '/invitation')) { continue; }
    foreach ([str_replace('<id:\d+>', '10', $pattern), $target] as $path) {
        $_SERVER['REQUEST_METHOD'] = 'POST';
        $boundary = new \yii\web\Request(['enableCookieValidation' => false]);
        $boundary->setPathInfo($path); $boundary->setQueryParams([]); $boundary->setRawBody('{invalid'); $boundary->headers->set('Content-Type', 'application/json');
        RequestBoundary::prepare($boundary);
        groupHttpCheck($boundary->bodyParams === [] && $boundary->rawBody === '{invalid' && $boundary->enableCsrfValidation, 'group JSON boundary retains raw body and CSRF');
    }
    $boundary = new \yii\web\Request(['enableCookieValidation' => false]); $boundary->setPathInfo(''); $boundary->setQueryParams(['r' => $target]);
    $boundary->setRawBody('{invalid'); $boundary->headers->set('Content-Type', 'application/json'); RequestBoundary::prepare($boundary);
    groupHttpCheck($boundary->bodyParams === [], 'front-controller JSON boundary');
}
if ($originalMethod === null) { unset($_SERVER['REQUEST_METHOD']); } else { $_SERVER['REQUEST_METHOD'] = $originalMethod; }
Yii::$app = $previous;
echo json_encode(['status' => 'passed', 'checks' => $checks, 'database_connections' => 0, 'http_requests' => 0,
    'scope' => 'real Yii controller dispatch with synthetic session/CSRF-result seams; not live HTTP or storage acceptance'], JSON_THROW_ON_ERROR), PHP_EOL;
