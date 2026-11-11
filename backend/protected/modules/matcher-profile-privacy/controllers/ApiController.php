<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\controllers;

use humhub\modules\matcherPrivacy\domain\ReadContext;
use humhub\modules\matcherPrivacy\Module;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\user\models\User;
use Yii;
use yii\web\Controller;
use yii\web\HttpException;
use yii\web\Response;

/** Session-only ordinary-user privacy endpoints; writes require the native CSRF token. */
final class ApiController extends Controller
{
    public $enableCsrfValidation = true;
    private string $requestId;
    public function runAction($id, $params = [])
    {
        $this->requestId = bin2hex(random_bytes(12));
        Yii::$app->response->format = Response::FORMAT_JSON;
        Yii::$app->response->headers->set('Cache-Control', 'private, no-store');
        Yii::$app->response->headers->set('X-Content-Type-Options', 'nosniff');
        try { return parent::runAction($id, $params); }
        catch (ProfileException $e) { return $this->error($e->httpStatus, $e->errorCode, $e->getMessage(), $e->details); }
        catch (HttpException $e) { return $this->error($e->statusCode, $e->statusCode === 400 ? 'INVALID_REQUEST' : 'HTTP_ERROR', 'The request or CSRF token is invalid.'); }
        catch (\Throwable $e) {
            Yii::error(['request_id' => $this->requestId, 'type' => get_class($e)], 'matcher-privacy-api');
            return $this->error(500, 'INTERNAL_ERROR', 'The request could not be completed.');
        }
    }
    public function beforeAction($action)
    {
        $this->actor();
        return parent::beforeAction($action);
    }
    public function actionPreview(): array
    {
        $this->method('GET');
        $perspective = Yii::$app->request->get('perspective', 'owner');
        $draftId = Yii::$app->request->get('draft_id');
        if (!is_string($perspective) || ($draftId !== null && (!is_string($draftId) || !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $draftId)))) {
            throw new ProfileException('INVALID_PREVIEW', 'Provide a supported perspective and draft ID.');
        }
        return $this->ok($this->services()->getPrivacyService()->preview($this->actor(), $this->scope(), $perspective, $draftId));
    }
    public function actionVisibility(): array
    {
        $this->method('PATCH');
        $body = $this->body(['expected_version', 'changes', 'confirmation_intent']);
        if (($body['confirmation_intent'] ?? null) !== 'confirm') { throw new ProfileException('CONFIRMATION_REQUIRED', 'Confirm the selected visibility changes.'); }
        if (!is_int($body['expected_version'] ?? null) || $body['expected_version'] < 0 || !is_array($body['changes'] ?? null)) {
            throw new ProfileException('INVALID_VISIBILITY_CHANGE', 'Provide expected_version and a visibility change list.');
        }
        return $this->ok($this->services()->getPrivacyService()->changeVisibility($this->actor(), $this->scope(), $body['expected_version'], $body['changes']));
    }
    public function actionMyContacts(): array
    {
        $this->method('GET'); $actor = $this->actor();
        return $this->ok($this->services()->getPrivacyService()->contacts($actor, $actor, ['entry_type' => 'self', 'purpose' => 'contacts']));
    }
    public function actionOverview(string $spaceId, string $ownerId): array
    {
        $this->method('GET'); $this->query([]);
        return $this->ok($this->services()->getOverviewService()->read($this->actor(), $this->positiveId($ownerId), $this->positiveId($spaceId)));
    }
    public function actionRelations(string $spaceId, string $ownerId): array
    {
        $this->method('GET'); $this->query(['kind', 'limit', 'cursor']);
        return $this->relationPage($this->positiveId($spaceId), $this->positiveId($ownerId));
    }
    public function actionPresentation(): array
    {
        $this->query([]); $service = $this->services()->getPresentationService();
        if (Yii::$app->request->method === 'GET') { return $this->ok($service->read($this->actor())); }
        $this->method('PUT');
        $body = $this->body(['expected_version', 'education_attribute_id', 'primary_portfolio_attribute_id', 'confirmation_intent']);
        $this->confirmation($body);
        foreach (['education_attribute_id', 'primary_portfolio_attribute_id'] as $key) {
            if (!array_key_exists($key, $body) || ($body[$key] !== null && (!is_string($body[$key]) || !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $body[$key])))) {
                throw new ProfileException('INVALID_PRESENTATION_SELECTION', 'Provide a confirmed attribute UUID or explicit null for each selection.');
            }
        }
        return $this->ok($service->save($this->actor(), $body['expected_version'], $body['education_attribute_id'], $body['primary_portfolio_attribute_id']));
    }
    public function actionRelationSharing(): array
    {
        $spaceId = $this->positiveId(Yii::$app->request->get('space_id'));
        if (Yii::$app->request->method === 'GET') { $this->query(['space_id', 'kind', 'limit', 'cursor']); return $this->relationPage($spaceId, $this->actor()); }
        $this->method('PUT'); $this->query(['space_id']);
        $body = $this->body(['expected_version', 'kind', 'object_id', 'visibility', 'confirmation_intent']); $this->confirmation($body);
        foreach (['kind', 'object_id', 'visibility'] as $key) { if (!is_string($body[$key] ?? null)) { throw new ProfileException('INVALID_RELATION_SHARING', 'Provide kind, object_id and visibility.'); } }
        $this->services()->profileModule()->getAccessPolicy()->assertWritable();
        return $this->ok($this->services()->getRelationReader()->share($this->actor(), $spaceId, $body['kind'], $body['object_id'], $body['expected_version'], $body['visibility']));
    }
    private function relationPage(int $spaceId, int $ownerId): array
    {
        $viewerId = $this->actor(); $kind = Yii::$app->request->get('kind', 'activities'); $cursor = Yii::$app->request->get('cursor'); $limit = Yii::$app->request->get('limit', '24');
        if (!is_string($kind) || ($cursor !== null && (!is_string($cursor) || strlen($cursor) > 4096)) || (!is_string($limit) && !is_int($limit)) || !preg_match('/^[1-9][0-9]?$/D', (string)$limit)) { throw new ProfileException('INVALID_RELATION_QUERY', 'Provide a valid kind, cursor and bounded limit.'); }
        $context = new \humhub\modules\matcherProfile\domain\RelationAccessContext($ownerId, $viewerId, $viewerId === $ownerId ? 'self' : 'event_card', (string)($viewerId === $ownerId ? $ownerId : $spaceId), $spaceId);
        return $this->ok($this->services()->getRelationReader()->read($context, $kind, $cursor, (int)$limit));
    }
    private function confirmation(array $body): void
    {
        if (($body['confirmation_intent'] ?? null) !== 'confirm') { throw new ProfileException('CONFIRMATION_REQUIRED', 'Explicitly confirm these display choices.'); }
        if (!is_int($body['expected_version'] ?? null) || $body['expected_version'] < 0) { throw new ProfileException('INVALID_VERSION', 'Provide a non-negative expected_version.'); }
    }
    private function query(array $allowed): void
    {
        // Yii merges named route captures into queryParams; inspect only the original client query.
        $raw = Yii::$app->request->getQueryString();
        if (strlen($raw) > 32768) { throw new ProfileException('INVALID_RELATION_QUERY', 'The query exceeds the supported size.'); }
        parse_str($raw, $query); unset($query[Yii::$app->urlManager->routeParam]);
        if (array_diff(array_keys($query), $allowed) !== []) { throw new ProfileException('UNKNOWN_QUERY_FIELD', 'Unsupported query fields.'); }
    }
    public function actionContacts(string $ownerId, ?string $spaceId = null): array
    {
        $this->method('GET');
        return $this->ok($this->services()->getPrivacyService()->contacts($this->actor(), $this->positiveId($ownerId), $this->context($spaceId)));
    }
    private function context(?string $routeSpace): array
    {
        $querySpace = Yii::$app->request->get('space_id');
        if ($routeSpace !== null && $querySpace !== null && $this->positiveId($routeSpace) !== $this->positiveId($querySpace)) {
            throw new ProfileException('INVALID_ACCESS_CONTEXT', 'Route and query Space IDs must match.');
        }
        $space = $routeSpace ?? Yii::$app->request->get('space_id');
        $post = Yii::$app->request->get('post_id');
        $type = Yii::$app->request->get('entry_type', $space === null ? ($post === null ? 'friendship' : 'public_post') : 'space');
        if (!is_string($type)) { throw new ProfileException('INVALID_ACCESS_CONTEXT', 'Provide a valid entry type.'); }
        return (new ReadContext($type, $space === null ? null : $this->positiveId($space), $post === null ? null : $this->positiveId($post), 'contacts'))->toArray();
    }
    private function scope(): ProfileScope
    {
        $space = Yii::$app->request->get('space_id');
        $kind = Yii::$app->request->get('scope', $space === null ? 'global' : 'space');
        if ($kind === 'global' && $space === null) { return ProfileScope::global(); }
        if (!in_array($kind, ['space', 'event'], true) || $space === null) { throw new ProfileException('INVALID_SCOPE', 'Use global or a Space ID.'); }
        return ProfileScope::event($this->positiveId($space));
    }
    private function actor(): int
    {
        if (Yii::$app->user->isGuest) { throw new ProfileException('AUTHENTICATION_REQUIRED', 'Sign in to continue.', 401); }
        $user = Yii::$app->user->identity;
        if (!$user instanceof User || (int)$user->status !== User::STATUS_ENABLED) { throw new ProfileException('ACCOUNT_UNAVAILABLE', 'This account is unavailable.', 403); }
        return (int)$user->id;
    }
    private function services(): Module { return $this->module; }
    private function method(string $method): void
    {
        if (Yii::$app->request->method !== $method) { Yii::$app->response->headers->set('Allow', $method); throw new ProfileException('METHOD_NOT_ALLOWED', 'Unsupported request method.', 405); }
    }
    private function positiveId(mixed $value): int
    {
        if ((!is_string($value) && !is_int($value)) || !preg_match('/^[1-9][0-9]{0,9}$/D', (string)$value) || (int)$value > 2147483647) { throw new ProfileException('INVALID_ID', 'Provide a valid positive ID.'); }
        return (int)$value;
    }
    private function body(array $allowed): array
    {
        $request = Yii::$app->request;
        if (strtolower(explode(';', (string)$request->headers->get('Content-Type'))[0]) !== 'application/json') { throw new ProfileException('UNSUPPORTED_MEDIA_TYPE', 'Use application/json.', 415); }
        if (strlen($request->rawBody) > 262144) { throw new ProfileException('REQUEST_TOO_LARGE', 'The JSON body exceeds 256 KiB.', 413); }
        try { $object = json_decode($request->rawBody, false, 32, JSON_THROW_ON_ERROR); }
        catch (\JsonException) { throw new ProfileException('INVALID_JSON', 'Provide a valid JSON object.', 400); }
        if (!$object instanceof \stdClass) { throw new ProfileException('INVALID_JSON', 'Provide a JSON object.', 400); }
        $body = json_decode($request->rawBody, true, 32, JSON_THROW_ON_ERROR);
        if (array_diff(array_keys($body), $allowed) !== []) { throw new ProfileException('UNKNOWN_FIELD', 'The request contains unsupported fields.'); }
        return $body;
    }
    private function ok(array $data): array { return ['data' => $data, 'meta' => ['request_id' => $this->requestId]]; }
    private function error(int $status, string $code, string $message, array $details = []): array
    {
        Yii::$app->response->statusCode = $status;
        return ['error' => ['code' => $code, 'message' => $message, 'retryable' => $status >= 500, 'details' => $details], 'meta' => ['request_id' => $this->requestId]];
    }
}
