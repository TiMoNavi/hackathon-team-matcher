<?php
declare(strict_types=1);
namespace humhub\modules\matcherIdeas\controllers;
use humhub\modules\matcherIdeas\domain\IdeaException;
use humhub\modules\matcherRecommendation\adapters\native\NativeAccessException;
use humhub\modules\user\models\User;
use Yii;
use yii\web\{Controller, HttpException, Response};

/** Session identity and Yii CSRF validation precede every write. No request can supply actor or relation facts. */
final class ApiController extends Controller
{
    public $enableCsrfValidation = true;
    private string $requestId;
    public function runAction($id, $params = [])
    {
        $this->requestId = bin2hex(random_bytes(12)); Yii::$app->response->format = Response::FORMAT_JSON;
        Yii::$app->response->headers->set('Cache-Control', 'private, no-store');
        Yii::$app->response->headers->set('X-Content-Type-Options', 'nosniff');
        try { return parent::runAction($id, $params); }
        catch (IdeaException $error) { return $this->error($error->httpStatus, $error->errorCode, $error->getMessage()); }
        catch (NativeAccessException $error) {
            $status = match ($error->reason) { 'authentication_required' => 401, 'access_denied', 'candidate_access_revoked' => 403,
                'current_event_required', 'current_event_mismatch', 'context_changed' => 409, 'invalid_request' => 422, default => 503 };
            return $this->error($status, strtoupper($error->reason), $error->getMessage());
        }
        catch (HttpException $error) { return $this->error($error->statusCode, 'INVALID_REQUEST', 'The request or CSRF token is invalid.'); }
        catch (\Throwable $error) {
            Yii::error(['request_id' => $this->requestId, 'type' => get_class($error)], 'matcher-ideas-api');
            return $this->error(500, 'INTERNAL_ERROR', 'The idea request could not be completed.');
        }
    }
    public function beforeAction($action) { $this->actor(); return parent::beforeAction($action); }
    public function actionMe(): array
    {
        $this->method(['GET']); $this->query([]);
        return $this->ok($this->module->getDraftService()->listOwned($this->actor()));
    }
    public function actionDrafts(): array
    {
        $this->method(['POST']); $this->query([]); $body = $this->body(['idea_id', 'fields', 'raw_text']);
        $ideaId = isset($body['idea_id']) ? $this->integer($body, 'idea_id') : null;
        $draft = $this->module->getDraftService()->start($this->actor(), $ideaId, $this->fields($body), $this->text($body, 'raw_text', ''));
        Yii::$app->response->statusCode = 201;
        return $this->ok($draft);
    }
    public function actionDraft(string $draftId): array
    {
        $this->method(['GET', 'PUT']); $this->query([]); $id = $this->id($draftId);
        if (Yii::$app->request->method === 'GET') { return $this->ok($this->module->getDraftService()->read($this->actor(), $id)); }
        $body = $this->body(['expected_version', 'fields', 'raw_text']);
        return $this->ok($this->module->getDraftService()->update($this->actor(), $id, $this->integer($body, 'expected_version'),
            $this->fields($body), array_key_exists('raw_text', $body) ? $this->text($body, 'raw_text') : null));
    }
    public function actionConfirm(string $draftId): array
    {
        $this->method(['POST']); $this->query([]); $body = $this->body(['expected_version', 'fields']);
        return $this->ok($this->module->getDraftService()->confirm($this->actor(), $this->id($draftId), $this->integer($body, 'expected_version'), $this->fields($body)));
    }
    public function actionActivities(string $ideaId): array
    {
        $this->method(['POST']); $this->query([]); $body = $this->body(['event_id', 'expected_version', 'members_visible', 'open_to_discussion', 'context']);
        $this->unsupportedDiscussion($body);
        $activity = $this->module->getIdeaService()->associateSpace($this->actor(), $this->id($ideaId), $this->integer($body, 'expected_version'),
            $this->integer($body, 'event_id'), $this->boolean($body, 'members_visible', false));
        Yii::$app->response->statusCode = 201;
        return $this->ok($this->activity($activity));
    }
    public function actionActivity(string $activityId): array
    {
        $this->method(['PUT']); $this->query([]); $body = $this->body(['expected_version', 'members_visible', 'status', 'open_to_discussion', 'context']);
        $this->unsupportedDiscussion($body);
        return $this->ok($this->activity($this->module->getIdeaService()->updatePublication($this->actor(), $this->id($activityId), $this->integer($body, 'expected_version'),
            array_key_exists('members_visible', $body) ? $this->boolean($body, 'members_visible') : null,
            array_key_exists('status', $body) ? $this->text($body, 'status') : null)));
    }
    public function actionMessenger(string $activityId): array
    {
        $this->method(['PUT']); $this->query([]); $body = $this->body(['expected_version', 'message_id', 'confirmation_intent']);
        if (($body['confirmation_intent'] ?? null) !== 'bind_existing_conversation') { throw new IdeaException('IDEA_BINDING_CONFIRMATION_REQUIRED', 'Explicitly confirm binding this existing conversation.'); }
        return $this->ok($this->activity($this->module->getIdeaService()->bindConversation($this->actor(), $this->id($activityId),
            $this->integer($body, 'expected_version'), $this->integer($body, 'message_id'))));
    }
    public function actionIdea(string $ideaId): array
    {
        $this->method(['GET']); $query = $this->query(['idea_activity_id']);
        if (!isset($query['idea_activity_id'])) { throw new IdeaException('IDEA_VALIDATION_FAILED', 'An exact idea_activity_id is required.'); }
        $actor = $this->actor(); $event = $this->module->getCurrentEventAccess()->resolve($actor);
        return $this->ok($this->module->getRelationSource()->detail($actor, $this->id($ideaId), $this->id($query['idea_activity_id']), $event->spaceId));
    }
    private function activity(array $activity): array
    {
        $activity['conversation_bound'] = $activity['message_id'] !== null;
        $activity['event_id'] = $activity['space_id'];
        $activity['open_to_discussion'] = false;
        unset($activity['message_id'], $activity['space_id']);
        return $activity;
    }
    private function unsupportedDiscussion(array $body): void
    {
        if (array_key_exists('open_to_discussion', $body) && $body['open_to_discussion'] !== false) {
            throw new IdeaException('IDEA_DISCUSSION_WORKFLOW_UNAVAILABLE', 'S7.2 only binds an existing conversation; opening a discussion is not implemented.');
        }
        if (array_key_exists('context', $body) && $body['context'] !== [] && $body['context'] !== null) {
            throw new IdeaException('IDEA_CONTEXT_UNAVAILABLE', 'S7.2 supports formal title and summary; activity context is not implemented.');
        }
    }
    private function actor(): int
    {
        if (Yii::$app->user->isGuest) { throw new IdeaException('AUTHENTICATION_REQUIRED', 'Sign in first.', 401); }
        $user = Yii::$app->user->identity;
        if (!$user instanceof User || (int)$user->status !== User::STATUS_ENABLED) { throw new IdeaException('ACCESS_DENIED', 'An active account is required.', 403); }
        return (int)$user->id;
    }
    private function id(mixed $id): int
    {
        if ((!is_string($id) && !is_int($id)) || !preg_match('/^[1-9][0-9]{0,9}$/D', (string)$id) || (int)$id > 2147483647) { throw new IdeaException('INVALID_ID', 'Use a positive integer ID.'); }
        return (int)$id;
    }
    private function integer(array $body, string $key): int
    {
        if (!isset($body[$key]) || !is_int($body[$key])) { throw new IdeaException('IDEA_VALIDATION_FAILED', 'Provide an integer ' . $key . '.'); }
        return $this->id($body[$key]);
    }
    private function text(array $body, string $key, ?string $default = null): string
    {
        if (!array_key_exists($key, $body) && $default !== null) { return $default; }
        if (!isset($body[$key]) || !is_string($body[$key])) { throw new IdeaException('IDEA_VALIDATION_FAILED', 'Provide a text ' . $key . '.'); }
        return $body[$key];
    }
    private function boolean(array $body, string $key, ?bool $default = null): bool
    {
        if (!array_key_exists($key, $body) && $default !== null) { return $default; }
        if (!isset($body[$key]) || !is_bool($body[$key])) { throw new IdeaException('IDEA_VALIDATION_FAILED', 'Provide a boolean ' . $key . '.'); }
        return $body[$key];
    }
    private function fields(array $body): array
    {
        if (!array_key_exists('fields', $body)) { return []; }
        if (!is_array($body['fields'])) { throw new IdeaException('IDEA_VALIDATION_FAILED', 'fields must be an object.'); }
        return $body['fields'];
    }
    private function query(array $allowed): array
    {
        $raw = Yii::$app->request->getQueryString();
        if (strlen($raw) > 2048) { throw new IdeaException('REQUEST_TOO_LARGE', 'The query exceeds the supported size.', 413); }
        parse_str($raw, $query); unset($query[Yii::$app->urlManager->routeParam]);
        if (array_diff(array_keys($query), $allowed) !== []) { throw new IdeaException('UNKNOWN_QUERY_FIELD', 'Unsupported query fields.'); }
        return $query;
    }
    private function body(array $allowed): array
    {
        $request = Yii::$app->request;
        if (strtolower(trim(explode(';', (string)$request->headers->get('Content-Type'))[0])) !== 'application/json') { throw new IdeaException('UNSUPPORTED_MEDIA_TYPE', 'Use application/json.', 415); }
        if (strlen($request->rawBody) > 32768) { throw new IdeaException('REQUEST_TOO_LARGE', 'The request body exceeds 32 KiB.', 413); }
        try { $object = json_decode($request->rawBody, false, 8, JSON_THROW_ON_ERROR); $body = json_decode($request->rawBody, true, 8, JSON_THROW_ON_ERROR); }
        catch (\JsonException) { throw new IdeaException('INVALID_JSON', 'Provide a JSON object.', 400); }
        if (!$object instanceof \stdClass) { throw new IdeaException('INVALID_JSON', 'Provide a JSON object.', 400); }
        if (array_diff(array_keys($body), $allowed) !== []) { throw new IdeaException('UNKNOWN_FIELD', 'Unsupported body fields.'); }
        if (property_exists($object, 'fields') && !$object->fields instanceof \stdClass) { throw new IdeaException('IDEA_VALIDATION_FAILED', 'fields must be a JSON object.'); }
        return $body;
    }
    private function method(array $methods): void
    {
        if (!in_array(Yii::$app->request->method, $methods, true)) { Yii::$app->response->headers->set('Allow', implode(', ', $methods)); throw new IdeaException('METHOD_NOT_ALLOWED', 'Unsupported request method.', 405); }
    }
    private function ok(array $data): array { return ['data' => $data, 'meta' => ['request_id' => $this->requestId]]; }
    private function error(int $status, string $code, string $message): array
    {
        Yii::$app->response->statusCode = $status;
        return ['error' => ['code' => $code, 'message' => $message, 'retryable' => $status >= 500, 'details' => []], 'meta' => ['request_id' => $this->requestId]];
    }
}
