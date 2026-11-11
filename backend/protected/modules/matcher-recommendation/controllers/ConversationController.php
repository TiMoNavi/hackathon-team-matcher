<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\controllers;
use humhub\modules\matcherRecommendation\adapters\conversation\{ConversationHttpException, ConversationHttpInput, ConversationHttpView, ConversationReadinessException, ConversationStorageException};
use humhub\modules\matcherRecommendation\adapters\native\NativeAccessException;
use humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException;
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;
use humhub\modules\user\models\User;
use Yii;
use yii\web\{Controller, HttpException, Response};

/** Plugin-specific synchronous extension. Not a social conversation or shared RecommendationRun/AIJob endpoint. */
final class ConversationController extends Controller
{
    public $enableCsrfValidation = true;
    private string $requestId;
    public function runAction($id, $params = [])
    {
        $this->requestId = bin2hex(random_bytes(12)); Yii::$app->response->format = Response::FORMAT_JSON;
        Yii::$app->response->headers->set('Cache-Control', 'private, no-store'); Yii::$app->response->headers->set('X-Content-Type-Options', 'nosniff');
        try { return parent::runAction($id, $params); }
        catch (ConversationHttpException $e) { return $this->error($e->status, $e->errorCode, $e->getMessage()); }
        catch (ConversationReadinessException $e) { return $this->error(503, 'AI_UNAVAILABLE', 'A required recommendation capability is unavailable.', ['reason' => $e->reason]); }
        catch (ConversationStorageException) { return $this->error(503, 'AI_UNAVAILABLE', 'Conversation storage is unavailable.', ['reason' => 'storage_unavailable']); }
        catch (NativeAccessException $e) {
            $status = match ($e->reason) { 'authentication_required' => 401, 'access_denied', 'candidate_access_revoked' => 403, 'current_event_required', 'current_event_mismatch', 'context_changed' => 409, 'invalid_request' => 400, default => 503 };
            return $this->error($status, $status === 503 ? 'AI_UNAVAILABLE' : ($status === 409 ? 'VERSION_CONFLICT' : ($status === 401 ? 'AUTH_REQUIRED' : ($status === 403 ? 'FORBIDDEN' : 'INVALID_REQUEST'))), 'The current session or activity does not allow this request.');
        }
        catch (AiRecommendationException $e) {
            $error = ConversationHttpView::failure($e->reason);
            $status = match ($error['code']) { 'AI_BUDGET_EXCEEDED' => 429, 'VERSION_CONFLICT' => 409, 'INVALID_REQUEST' => 400, 'AI_UNAVAILABLE' => 503, default => 500 };
            Yii::$app->response->statusCode = $status; return ['error' => $error, 'meta' => ['request_id' => $this->requestId]];
        }
        catch (HttpException $e) { return $this->error($e->statusCode, 'INVALID_REQUEST', 'The request or CSRF token is invalid.'); }
        catch (\Throwable $e) {
            Yii::error(['request_id' => $this->requestId, 'type' => get_class($e)], 'matcher-conversation-api');
            return $this->error(500, 'AI_SERVICE_ERROR', 'The conversation request could not be completed.');
        }
    }
    public function beforeAction($action) { $this->actor(); $this->query(); return parent::beforeAction($action); }
    public function actionCreate(string $spaceId): array
    {
        $this->method('POST'); $this->body('create'); $key = ConversationHttpInput::key(Yii::$app->request->headers->get('Idempotency-Key'));
        if (!preg_match('/^[1-9][0-9]{0,9}$/D', $spaceId) || (int)$spaceId > 2147483647) { throw new ConversationHttpException(400, 'INVALID_REQUEST', 'Invalid activity ID.'); }
        $service = $this->module->getConversationFactory()->create($this->actor(), (int)$spaceId);
        $view = $service->create($this->actor(), (int)$spaceId, $key);
        if ($view['applicability'] !== 'current') { throw new AiRecommendationException('context_invalidated'); }
        return $this->ok($view, 201);
    }
    public function actionRead(string $id): array
    {
        $this->method('GET'); [$service] = $this->owned($id); return $this->ok($service->get($this->actor(), $id));
    }
    public function actionTurn(string $id): array { return $this->submit($id, 'turn'); }
    public function actionConfirm(string $id): array { return $this->submit($id, 'confirm'); }
    private function submit(string $id, string $operation): array
    {
        $this->method('POST'); $body = $this->body($operation);
        $key = 'http:' . $operation . ':' . hash('sha256', ConversationHttpInput::key(Yii::$app->request->headers->get('Idempotency-Key')));
        [$service, $state] = $this->owned($id);
        $digest = Fingerprint::of([$body['expected_version'], $body['message'], $body['command'], $body['intent'], $body['requirements_version'] ?? null]);
        foreach ($state['turns'] as $turn) {
            if ($turn['idempotency_key'] === $key && !hash_equals($turn['input_hash'], $digest)) { throw new ConversationHttpException(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key belongs to a different request.'); }
        }
        return $this->ok($service->submit($this->actor(), $id, $body['expected_version'], $body['message'], $key, $body['command'], $body['intent'], $body['requirements_version'] ?? null));
    }
    private function owned(string $id): array
    {
        if (!preg_match('/^conversation-[a-f0-9]{32}(?:[a-f0-9]{32})?$/D', $id)) { throw new ConversationHttpException(404, 'NOT_FOUND', 'Conversation not found.'); }
        $factory = $this->module->getConversationFactory(); $state = $factory->store()->load($id, $this->actor());
        if ($state === null) { throw new ConversationHttpException(404, 'NOT_FOUND', 'Conversation not found.'); }
        return [$factory->create($this->actor(), $state['event_id']), $state];
    }
    private function actor(): int
    {
        if (Yii::$app->user->isGuest) { throw new NativeAccessException('authentication_required'); }
        $identity = Yii::$app->user->identity;
        if (!$identity instanceof User || (int)$identity->status !== User::STATUS_ENABLED) { throw new NativeAccessException('access_denied'); }
        return (int)$identity->id;
    }
    private function query(): void
    {
        $raw = Yii::$app->request->getQueryString(); if (strlen($raw) > 2048) { throw new ConversationHttpException(400, 'INVALID_REQUEST', 'Query fields are not accepted.'); }
        parse_str($raw, $query); unset($query[Yii::$app->urlManager->routeParam]);
        if ($query !== []) { throw new ConversationHttpException(400, 'INVALID_REQUEST', 'Query fields are not accepted.'); }
    }
    private function body(string $operation): array
    {
        if (strtolower(trim(explode(';', (string)Yii::$app->request->headers->get('Content-Type'))[0])) !== 'application/json') { throw new ConversationHttpException(415, 'INVALID_REQUEST', 'Use application/json.'); }
        return ConversationHttpInput::parse(Yii::$app->request->rawBody, $operation);
    }
    private function method(string $method): void
    {
        if (Yii::$app->request->method !== $method) { Yii::$app->response->headers->set('Allow', $method); throw new ConversationHttpException(405, 'INVALID_REQUEST', 'Unsupported request method.'); }
    }
    private function ok(array $data, int $status = 200): array
    { Yii::$app->response->statusCode = $status; return ['data' => ConversationHttpView::present($data), 'meta' => ['request_id' => $this->requestId]]; }
    private function error(int $status, string $code, string $message, array $details = []): array
    { Yii::$app->response->statusCode = $status; return ['error' => ['code' => $code, 'message' => $message, 'retryable' => false, 'details' => $details], 'meta' => ['request_id' => $this->requestId]]; }
}
