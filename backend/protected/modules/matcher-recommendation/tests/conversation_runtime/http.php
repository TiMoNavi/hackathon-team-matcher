<?php
declare(strict_types=1);
defined('YII_ENABLE_ERROR_HANDLER') || define('YII_ENABLE_ERROR_HANDLER', false);
$backend = dirname(__DIR__, 5); require $backend . '/protected/vendor/autoload.php'; require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub'); Yii::setAlias('@humhub/modules/matcherRecommendation', dirname(__DIR__, 2));
require_once __DIR__ . '/Fixtures.php'; require_once dirname(__DIR__) . '/native_access/Fixtures.php';
use humhub\modules\matcherRecommendation\tests\conversation_runtime\Harness;
use humhub\modules\matcherRecommendation\tests\native_access\Fixtures as N;
use humhub\modules\matcherRecommendation\controllers\ConversationController;
use humhub\modules\matcherRecommendation\adapters\conversation\ConversationReadinessException;
use humhub\modules\user\models\User;

/** Test-only transport host; uses actual Yii CSRF/Controller and production conversation service/store. */
final class HttpRuntimeRequest extends yii\web\Request
{
    public string $verb = 'GET'; public string $rawQuery = '';
    public function getMethod() { return $this->verb; }
    public function getQueryString() { return $this->rawQuery; }
}
final class HttpRuntimeModule extends yii\base\Module
{
    public Harness $harness; public ?string $unavailable = null;
    public function getConversationFactory(): object
    {
        return new class($this) {
            public function __construct(private readonly HttpRuntimeModule $module) {}
            public function store(): object { return $this->module->harness->store; }
            public function create(int $viewer, ?int $space = null): object
            {
                $this->module->harness->ports->events->resolve($viewer, $space);
                if ($this->module->unavailable !== null) { throw new ConversationReadinessException($this->module->unavailable); }
                return $this->module->harness->service();
            }
        };
    }
}
$checks = [];
function checkHttpRuntime(bool $ok, string $label): void { global $checks; if (!$ok) { throw new RuntimeException($label); } $checks[] = $label; }
$nativeDb = N::database();
$app = new yii\web\Application(['id' => 'conversation-http-isolated', 'basePath' => __DIR__, 'vendorPath' => $backend . '/protected/vendor',
    'components' => ['db' => $nativeDb, 'cache' => yii\caching\ArrayCache::class, 'runtimeCache' => yii\caching\ArrayCache::class, 'log' => ['targets' => []],
        'request' => ['class' => HttpRuntimeRequest::class, 'cookieValidationKey' => 'synthetic-test-signature-only', 'scriptUrl' => '/index.php', 'hostInfo' => 'https://synthetic.invalid'],
        'user' => ['class' => yii\web\User::class, 'identityClass' => User::class, 'enableSession' => false],
        'urlManager' => ['class' => yii\web\UrlManager::class, 'enablePrettyUrl' => true, 'showScriptName' => false, 'cache' => false]]]);
$h = new Harness(new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]));
$module = new HttpRuntimeModule('matcher-recommendation', $app); $module->harness = $h;
$user = new User(); $user->setAttributes(['id' => 1, 'status' => User::STATUS_ENABLED], false); $app->user->setIdentity($user);
function requestRuntime(string $action, array $params, string $method = 'GET', array $body = [], ?string $key = null, bool $csrf = true, string $query = ''): array
{
    global $app, $module;
    $request = new HttpRuntimeRequest(['cookieValidationKey' => 'synthetic-test-signature-only', 'scriptUrl' => '/index.php', 'hostInfo' => 'https://synthetic.invalid', 'parsers' => ['application/json' => yii\web\JsonParser::class]]);
    $request->verb = $method; $request->rawQuery = $query; $request->headers->set('Content-Type', 'application/json');
    $request->setRawBody($body === [] ? '{}' : json_encode($body, JSON_THROW_ON_ERROR));
    $app->set('request', $request); $app->set('response', new yii\web\Response());
    if ($key !== null) { $request->headers->set('Idempotency-Key', $key); }
    if ($csrf && $method === 'POST') { $request->headers->set('X-CSRF-Token', $request->getCsrfToken()); }
    $controller = new ConversationController('conversation', $module);
    $data = $controller->runAction($action, $params); return [$app->response->statusCode, $data];
}
[$status] = requestRuntime('create', ['spaceId' => '7'], 'POST', [], 'create-no-csrf', false); checkHttpRuntime($status === 400, 'real Yii CSRF rejects missing token before create');
$app->user->setIdentity(null); [$status] = requestRuntime('create', ['spaceId' => '7'], 'POST', [], 'create-guest'); checkHttpRuntime($status === 401, 'guest rejected before a conversation is created'); $app->user->setIdentity($user);
[$status] = requestRuntime('create', ['spaceId' => '7'], 'POST', [], null); checkHttpRuntime($status === 400, 'missing Idempotency-Key rejected');
[$status] = requestRuntime('create', ['spaceId' => '7'], 'POST', ['viewer_id' => 2], 'create-unknown'); checkHttpRuntime($status === 400, 'create rejects forged owner body field');
[$status] = requestRuntime('create', ['spaceId' => '7'], 'POST', [], 'create-query', true, 'viewer_id=2'); checkHttpRuntime($status === 400, 'client query cannot override session context');
$module->unavailable = 'history_unavailable'; [$status, $response] = requestRuntime('create', ['spaceId' => '7'], 'POST', [], 'not-ready');
checkHttpRuntime($status === 503 && $response['error']['details']['reason'] === 'history_unavailable', 'native readiness diagnostic is a 503 rather than a fabricated empty success'); $module->unavailable = null;
[$status, $response] = requestRuntime('create', ['spaceId' => '8'], 'POST', [], 'wrong-event'); checkHttpRuntime($status === 409, 'wrong selected activity rejected');
[$status, $response] = requestRuntime('create', ['spaceId' => '7'], 'POST', [], 'create-once'); checkHttpRuntime($status === 201 && !isset($response['data']['job_id']), 'synchronous plugin create returns 201 without fake AIJob');
$view = $response['data']; $id = $view['conversation_id'];
[$status, $response] = requestRuntime('create', ['spaceId' => '7'], 'POST', [], 'create-once'); checkHttpRuntime($status === 201 && $response['data']['conversation_id'] === $id && $h->provider->calls === 0, 'HTTP create replay is stable and zero model');
[$status, $response] = requestRuntime('read', ['id' => 'conversation-' . str_repeat('f', 32)]); checkHttpRuntime($status === 404, 'unknown conversation is absent');
$other = new User(); $other->setAttributes(['id' => 2, 'status' => User::STATUS_ENABLED], false); $app->user->setIdentity($other);
[$status] = requestRuntime('read', ['id' => $id]); checkHttpRuntime($status === 404, 'wrong owner cannot distinguish another conversation from missing'); $app->user->setIdentity($user);
$input = ['expected_version' => $view['version'], 'message' => '找共同主题的伙伴', 'command' => 'recommend'];
[$status, $response] = requestRuntime('turn', ['id' => $id], 'POST', $input, 'turn-once');
checkHttpRuntime($status === 200 && $response['data']['execution_status'] === 'succeeded' && $response['data']['items'] !== [], 'actual controller executes persistent synchronous turn'); $done = $response['data'];
checkHttpRuntime(!preg_match('/permit_id|source_refs|input_hash|atom_hash|fact_references/', json_encode($response)), 'actual HTTP response strips all internal permit and provenance fields');
[$status] = requestRuntime('turn', ['id' => $id], 'POST', $input, 'turn-once'); checkHttpRuntime($status === 200 && $h->provider->calls === 2, 'HTTP turn replay cannot spend twice');
$conflict = $input; $conflict['message'] = 'different'; [$status, $response] = requestRuntime('turn', ['id' => $id], 'POST', $conflict, 'turn-once'); checkHttpRuntime($status === 409 && $response['error']['code'] === 'IDEMPOTENCY_CONFLICT', 'same scoped HTTP key different payload returns idempotency conflict');
[$status, $response] = requestRuntime('turn', ['id' => $id], 'POST', $input, 'stale-new-key'); checkHttpRuntime($status === 409 && $response['error']['code'] === 'VERSION_CONFLICT', 'fresh key with stale expected_version returns version conflict');
$confirm = ['expected_version' => $done['version'], 'requirements_version' => $done['requirements_version'], 'confirmation_intent' => 'replace_complete_requirements', 'message' => '确认主题条件并换一批', 'command' => 'refresh', 'conditions' => [['feature' => 'topics', 'operator' => 'similarity', 'value' => ['social'], 'strength' => 'soft']]];
[$status, $response] = requestRuntime('confirm', ['id' => $id], 'POST', $confirm, 'confirm-once');
checkHttpRuntime($status === 200 && count($response['data']['confirmed_conditions']) === 1, 'explicit requirement confirmation crosses trusted HTTP boundary');
[$status] = requestRuntime('confirm', ['id' => $id], 'POST', $confirm, 'confirm-once'); checkHttpRuntime($status === 200 && $h->provider->calls === 4, 'confirmation replay remains idempotent despite advanced requirements version');
$bad = $confirm; $bad['conditions'][0]['origin'] = 'user_confirmed'; [$status] = requestRuntime('confirm', ['id' => $id], 'POST', $bad, 'forged-origin'); checkHttpRuntime($status === 400, 'confirmation origin is not client-controlled');
$module->unavailable = 'disabled'; [$status] = requestRuntime('read', ['id' => $id]); checkHttpRuntime($status === 503 && $h->provider->calls === 4, 'disabled GET exposes no old candidate body and calls no model');
$module->unavailable = null; $h->ports->events->available = false; [$status] = requestRuntime('read', ['id' => $id]); checkHttpRuntime($status === 409, 'GET revalidates current activity before returning stored view');
$h->ports->events->available = true; $h->runtime->configure(2, false, 'synthetic-provider', 'reviewed-v1');
[$status, $response] = requestRuntime('read', ['id' => $id]); checkHttpRuntime($status === 200 && $response['data']['applicability'] === 'revoked' && $response['data']['confirmed_conditions'] === [], 'held HTTP assembly redacts confirmed conditions after runtime invalidation');
Yii::$app = null;
echo json_encode(['suite' => 'conversation_http', 'status' => 'passed', 'checks' => count($checks), 'labels' => $checks, 'scope' => 'Actual Yii Controller and CSRF with explicit test-only host ports and fresh SQLite. Not live HumHub HTTP.', 'network_calls' => 0, 'real_model_calls' => 0], JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT) . PHP_EOL;
