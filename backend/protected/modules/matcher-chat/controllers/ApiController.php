<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\controllers;

use humhub\modules\matcherChat\adapters\http\RequestBoundary;
use humhub\modules\matcherChat\adapters\http\ActorExpectation;
use humhub\modules\matcherChat\domain\{ChatException, PageRequest, SafeInteger, SendText};
use humhub\modules\matcherChat\Module;
use humhub\modules\user\models\User;
use Yii;
use yii\web\{HttpException, Response};

final class ApiController extends \yii\web\Controller
{
    public $enableCsrfValidation = true;
    private string $requestId = '';
    private int $viewerId = 0;

    public function runAction($id, $params = [])
    {
        $this->requestId = bin2hex(random_bytes(12));
        $response = Yii::$app->response;
        $response->format = Response::FORMAT_JSON;
        $response->headers->set('Cache-Control', 'private, no-store');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        try {
            $methods = ['conversations' => ['GET'], 'messages' => ['GET', 'POST'], 'read-state' => ['PUT']];
            if (!isset($methods[$id])) { throw new ChatException('NOT_FOUND', 'The endpoint is unavailable.', 404); }
            if (!in_array(Yii::$app->request->method, $methods[$id], true)) { $response->headers->set('Allow', implode(', ', $methods[$id])); throw new ChatException('METHOD_NOT_ALLOWED', 'Unsupported request method.', 405); }
            $this->sameOrigin();
            $user = Yii::$app->user;
            if (!$user->enableSession || $user->isGuest) { throw new ChatException('AUTHENTICATION_REQUIRED', 'Sign in to read conversations.', 401); }
            $identity = $user->identity;
            if (!$identity instanceof User || (int)$identity->status !== User::STATUS_ENABLED) { throw new ChatException('ACCOUNT_UNAVAILABLE', 'This account is unavailable.', 403); }
            if ($user->canGetProperty('impersonation') && !$user->impersonation->canAccessPrivateContent()) { throw new ChatException('PRIVATE_CONTENT_UNAVAILABLE', 'Private content is unavailable.', 403); }
            $this->viewerId = SafeInteger::native($identity->id, 'viewer_id');
            ActorExpectation::assert(Yii::$app->request->headers->get('X-Matcher-Chat-Actor'), $this->viewerId);
            RequestBoundary::prepare(Yii::$app->request);
            return parent::runAction($id, $params);
        } catch (ChatException $error) { return $this->failure($error); }
        catch (HttpException $error) { return $this->failure(new ChatException('INVALID_REQUEST', 'The request or CSRF token is invalid.', $error->statusCode)); }
        catch (\Throwable $error) {
            Yii::error(['request_id' => $this->requestId, 'type' => get_class($error)], 'matcher-chat-api');
            return $this->failure(new ChatException('CHAT_DEPENDENCY_UNAVAILABLE', 'The chat request could not be completed.', 503));
        }
    }

    public function actionConversations(): array { return $this->chat()->reader($this->viewerId)->conversations($this->viewerId, $this->page(false), $this->requestId); }
    public function actionMessages($id): array
    {
        if (Yii::$app->request->method === 'GET') { return $this->chat()->reader($this->viewerId)->messages($this->viewerId, $this->id($id), $this->page(true), $this->requestId); }
        $request = Yii::$app->request;
        $this->queryKeys(['r', 'id']);
        if (strtolower(trim(explode(';', (string)$request->headers->get('Content-Type'))[0])) !== 'application/json') { throw new ChatException('INVALID_REQUEST', 'Use application/json.', 415); }
        if (strlen($request->rawBody) > 65536) { throw new ChatException('INVALID_REQUEST', 'The request is too large.', 413); }
        try { $body = json_decode($request->rawBody, false, 4, JSON_THROW_ON_ERROR); } catch (\JsonException) { throw new ChatException('INVALID_ARGUMENT', 'Provide a JSON object.'); }
        if (!$body instanceof \stdClass) { throw new ChatException('INVALID_ARGUMENT', 'Provide a JSON object.'); }
        $keys = array_keys((array)$body); sort($keys);
        if ($keys !== ['body', 'client_message_id']) { throw new ChatException('INVALID_ARGUMENT', 'Provide only client_message_id and body.'); }
        $result = $this->chat()->sender($this->viewerId)->send($this->viewerId, $this->id($id), new SendText($body->client_message_id, $body->body), $this->requestId);
        Yii::$app->response->statusCode = $result['data']['replayed'] ? 200 : 201;
        return $result;
    }
    public function actionReadState($id): array
    {
        $request = Yii::$app->request;
        $this->queryKeys(['r', 'id']);
        if (strtolower(trim(explode(';', (string)$request->headers->get('Content-Type'))[0])) !== 'application/json') { throw new ChatException('INVALID_REQUEST', 'Use application/json.', 415); }
        if (strlen($request->rawBody) > 1024) { throw new ChatException('INVALID_REQUEST', 'The request is too large.', 413); }
        try { $body = json_decode($request->rawBody, false, 4, JSON_THROW_ON_ERROR); } catch (\JsonException) { throw new ChatException('INVALID_ARGUMENT', 'Provide a JSON object.'); }
        if (!$body instanceof \stdClass || array_keys((array)$body) !== ['read_seq']) { throw new ChatException('INVALID_ARGUMENT', 'Provide only read_seq.'); }
        return $this->chat()->reader($this->viewerId)->markRead($this->viewerId, $this->id($id), SafeInteger::nonNegative($body->read_seq, 'read_seq'), $this->requestId);
    }
    private function page(bool $messages): PageRequest
    {
        $this->queryKeys($messages ? ['r', 'id', 'limit', 'cursor', 'after_seq'] : ['r', 'limit', 'cursor']);
        $query = Yii::$app->request->queryParams;
        $limit = isset($query['limit']) ? $this->unsigned($query['limit'], 'limit') : 24;
        $after = array_key_exists('after_seq', $query) ? $this->unsigned($query['after_seq'], 'after_seq') : null;
        return new PageRequest($limit, $query['cursor'] ?? null, $after);
    }
    private function queryKeys(array $allowed): void { if (array_diff(array_keys(Yii::$app->request->queryParams), $allowed)) { throw new ChatException('INVALID_ARGUMENT', 'Unsupported query field.'); } }
    private function unsigned(mixed $value, string $field): int
    {
        if (is_string($value) && preg_match('/^(0|[1-9][0-9]*)$/D', $value) && strlen($value) <= 16 && (strlen($value) < 16 || strcmp($value, (string)SafeInteger::MAX) <= 0)) { return (int)$value; }
        if (is_int($value)) { return SafeInteger::nonNegative($value, $field); }
        throw new ChatException('INVALID_ARGUMENT', $field . ' must be a safe integer.');
    }
    private function id(mixed $id): int { return SafeInteger::positive($this->unsigned($id, 'conversation_id'), 'conversation_id'); }
    private function sameOrigin(): void
    {
        $request = Yii::$app->request;
        $origin = $request->headers->get('Origin');
        $site = $request->headers->get('Sec-Fetch-Site');
        if (($origin !== null && $origin !== $request->hostInfo) || ($site !== null && !in_array($site, ['same-origin', 'none'], true))) { throw new ChatException('CROSS_ORIGIN_DENIED', 'Use the same-origin application.', 403); }
    }
    private function chat(): Module { return $this->module; }
    private function failure(ChatException $error): array
    {
        Yii::$app->response->statusCode = $error->httpStatus;
        if ($error->retryAfterSeconds !== null) { Yii::$app->response->headers->set('Retry-After', (string)$error->retryAfterSeconds); }
        Yii::$app->response->headers->remove('Location');
        Yii::$app->response->content = null;
        return $error->envelope($this->requestId);
    }
}
