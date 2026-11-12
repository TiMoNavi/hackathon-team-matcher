<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\controllers;

use humhub\modules\matcherChat\adapters\http\{ActorExpectation, RequestBoundary, SessionActor};
use humhub\modules\matcherChat\domain\{ChatException, GroupCommand, SafeInteger};
use humhub\modules\matcherChat\Module;
use Yii;
use yii\web\{HttpException, Response};

/** Explicit ordinary-group lifecycle only; this controller grants no message/file access. */
final class GroupController extends \yii\web\Controller
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
            $method = $id === 'invitation' ? 'GET' : (isset(GroupCommand::INTENTS[$id]) ? 'POST' : null);
            if ($method === null) { throw new ChatException('NOT_FOUND', 'The endpoint is unavailable.', 404); }
            $request = Yii::$app->request;
            if ($request->method !== $method) { $response->headers->set('Allow', $method); throw new ChatException('METHOD_NOT_ALLOWED', 'Unsupported request method.', 405); }
            $origin = $request->headers->get('Origin'); $site = $request->headers->get('Sec-Fetch-Site');
            if (($origin !== null && $origin !== $request->hostInfo) || ($site !== null && !in_array($site, ['same-origin', 'none'], true))) { throw new ChatException('CROSS_ORIGIN_DENIED', 'Use the same-origin application.', 403); }
            $user = Yii::$app->user;
            if (!$user->enableSession || $user->isGuest) { throw new ChatException('AUTHENTICATION_REQUIRED', 'A native session is required.', 401); }
            $this->viewerId = SessionActor::requireSelf(SafeInteger::native($user->identity->id, 'viewer_id'));
            ActorExpectation::assert($request->headers->get('X-Matcher-Chat-Actor'), $this->viewerId);
            $this->queryKeys($id === 'create' ? ['r'] : ['r', 'id']);
            RequestBoundary::prepare($request);
            return parent::runAction($id, $params);
        } catch (ChatException $error) { return $this->failure($error); }
        catch (HttpException $error) { return $this->failure(new ChatException('INVALID_REQUEST', 'The request or CSRF token is invalid.', $error->statusCode)); }
        catch (\Throwable $error) {
            Yii::error(['request_id' => $this->requestId, 'type' => get_class($error)], 'matcher-chat-group-api');
            return $this->failure(new ChatException('CHAT_GROUPS_UNAVAILABLE', 'The group request could not be completed.', 503));
        }
    }

    public function actionCreate(): array { return $this->write('create', null); }
    public function actionInvite($id): array { return $this->write('invite', $this->id($id)); }
    public function actionAccept($id): array { return $this->write('accept', $this->id($id)); }
    public function actionDecline($id): array { return $this->write('decline', $this->id($id)); }
    public function actionWithdraw($id): array { return $this->write('withdraw', $this->id($id)); }
    public function actionLeave($id): array { return $this->write('leave', $this->id($id)); }
    public function actionInvitation($id): array
    {
        if (Yii::$app->request->rawBody !== '') { throw new ChatException('INVALID_ARGUMENT', 'Invitation detail has no request body.'); }
        return $this->chat()->groups($this->viewerId)->invitation($this->viewerId, $this->id($id), $this->requestId);
    }
    private function write(string $operation, ?int $id): array
    {
        $command = new GroupCommand($operation, $this->body());
        $groups = $this->chat()->groups($this->viewerId);
        $result = $operation === 'create' ? $groups->create($this->viewerId, $command, $this->requestId)
            : $groups->$operation($this->viewerId, $id, $command, $this->requestId);
        Yii::$app->response->statusCode = $result['data']['replayed'] ? 200 : 201;
        return $result;
    }
    private function body(): array
    {
        $request = Yii::$app->request;
        if (strtolower(trim(explode(';', (string)$request->headers->get('Content-Type'))[0])) !== 'application/json') { throw new ChatException('INVALID_REQUEST', 'Use application/json.', 415); }
        $raw = $request->rawBody;
        if (strlen($raw) > 4096) { throw new ChatException('INVALID_REQUEST', 'The request is too large.', 413); }
        try { $body = json_decode($raw, false, 4, JSON_THROW_ON_ERROR); } catch (\JsonException) { throw new ChatException('INVALID_GROUP_COMMAND', 'Provide a JSON object.'); }
        if (!$body instanceof \stdClass) { throw new ChatException('INVALID_GROUP_COMMAND', 'Provide a JSON object.'); }
        // Flat command keys must not be silently overwritten by json_decode.
        preg_match_all('/"(?:[^"\\\\]|\\\\.)*"/s', $raw, $tokens, PREG_OFFSET_CAPTURE);
        $keys = [];
        foreach ($tokens[0] as [$token, $offset]) {
            if (!str_starts_with(ltrim(substr($raw, $offset + strlen($token))), ':')) { continue; }
            $key = json_decode($token, true, 2, JSON_THROW_ON_ERROR);
            if (in_array($key, $keys, true)) { throw new ChatException('INVALID_GROUP_COMMAND', 'Duplicate command fields are unsupported.'); }
            $keys[] = $key;
        }
        return (array)$body;
    }
    private function queryKeys(array $allowed): void
    {
        if (array_diff(array_keys(Yii::$app->request->queryParams), $allowed)) { throw new ChatException('INVALID_ARGUMENT', 'Unsupported query field.'); }
    }
    private function id(mixed $value): int
    {
        if (is_string($value) && preg_match('/^[1-9][0-9]{0,15}$/D', $value) && (strlen($value) < 16 || strcmp($value, (string)SafeInteger::MAX) <= 0)) { return (int)$value; }
        if (is_int($value)) { return SafeInteger::positive($value, 'target_id'); }
        throw new ChatException('INVALID_ARGUMENT', 'The target must be a canonical positive safe integer.');
    }
    private function chat(): Module { return $this->module; }
    private function failure(ChatException $error): array
    {
        Yii::$app->response->statusCode = $error->httpStatus;
        if ($error->retryAfterSeconds !== null) { Yii::$app->response->headers->set('Retry-After', (string)$error->retryAfterSeconds); }
        Yii::$app->response->headers->remove('Location'); Yii::$app->response->content = null;
        return $error->envelope($this->requestId);
    }
}
