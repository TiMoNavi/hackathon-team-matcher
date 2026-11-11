<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\controllers;
use humhub\modules\matcherRecommendation\adapters\native\NativeAccessException;
use humhub\modules\matcherRecommendation\application\SelectCurrentEvent;
use humhub\modules\matcherRecommendation\domain\browse\{DiscoveryException, OrdinaryDiscoveryQuery};
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\user\models\User;
use Yii;
use yii\web\{Controller, HttpException, Response};

/** Native login session only. Every PUT passes Yii CSRF validation before invoking a use case. */
final class ApiController extends Controller
{
    public $enableCsrfValidation = true;
    private string $requestId;
    public function runAction($id, $params = [])
    {
        $this->requestId = bin2hex(random_bytes(12)); Yii::$app->response->format = Response::FORMAT_JSON;
        Yii::$app->response->headers->set('Cache-Control', 'private, no-store'); Yii::$app->response->headers->set('X-Content-Type-Options', 'nosniff');
        try { return parent::runAction($id, $params); }
        catch (DiscoveryException $error) { return $this->error($error->httpStatus, $error->errorCode, $error->getMessage()); }
        catch (NativeAccessException $error) {
            $status = match ($error->reason) {
                'authentication_required' => 401, 'access_denied', 'candidate_access_revoked' => 403,
                'current_event_required', 'current_event_mismatch', 'context_changed' => 409, 'invalid_request' => 422, default => 503,
            };
            return $this->error($status, strtoupper($error->reason), $error->getMessage());
        }
        catch (ProfileException $error) { return $this->error($error->httpStatus, $error->errorCode, $error->getMessage()); }
        catch (HttpException $error) { return $this->error($error->statusCode, 'INVALID_REQUEST', 'The request or CSRF token is invalid.'); }
        catch (\Throwable $error) {
            Yii::error(['request_id' => $this->requestId, 'type' => get_class($error)], 'matcher-discovery-api');
            return $this->error(500, 'INTERNAL_ERROR', 'The discovery request could not be completed.');
        }
    }
    public function beforeAction($action)
    {
        $this->actor(); return parent::beforeAction($action);
    }
    public function actionCurrentEvent(): array
    {
        $this->method(['GET', 'PUT']); $this->query([]); $store = $this->module->getCurrentEventSelectionStore();
        if (Yii::$app->request->method === 'PUT') {
            $body = $this->body(['space_id', 'expected_revision']);
            if (!isset($body['space_id']) || !is_int($body['space_id']) || !array_key_exists('expected_revision', $body)
                || ($body['expected_revision'] !== null && (!is_string($body['expected_revision']) || !preg_match('/^selection-[a-f0-9]{32}$/D', $body['expected_revision'])))) {
                throw new DiscoveryException('INVALID_SELECTION', 'Provide integer space_id and expected_revision (null for an initial selection).');
            }
            (new SelectCurrentEvent($store))->execute($this->id($body['space_id']), $body['expected_revision']);
        }
        $selection = $store->read(); $context = $this->module->getCurrentEventAccess()->resolve($this->actor(), $selection['space_id']);
        if ($store->read() !== $selection) { throw new NativeAccessException('context_changed'); }
        return $this->ok(['space_id' => $selection['space_id'], 'selection_revision' => $selection['selection_revision'], 'access_version' => $context->accessVersion]);
    }
    public function actionDiscoverySettings(string $spaceId): array
    {
        $this->method(['GET', 'PUT']); $this->query([]); $space = $this->id($spaceId); $service = $this->module->getDiscoverySettingsService();
        if (Yii::$app->request->method === 'GET') { return $this->ok($service->read($this->actor(), $space)); }
        $body = $this->body(['expected_version', 'discoverable']);
        if (!is_int($body['expected_version'] ?? null) || $body['expected_version'] < 0 || !is_bool($body['discoverable'] ?? null)) {
            throw new DiscoveryException('INVALID_DISCOVERY_SETTINGS', 'Provide non-negative expected_version and boolean discoverable.');
        }
        return $this->ok($service->change($this->actor(), $space, $body['expected_version'], $body['discoverable']));
    }
    public function actionDiscovery(string $spaceId): array
    {
        $this->method(['GET']); $query = $this->query(['target_type', 'filters', 'sort', 'limit', 'cursor']);
        foreach (['target_type', 'filters', 'sort', 'cursor'] as $key) { if (isset($query[$key]) && !is_string($query[$key])) { throw new DiscoveryException('INVALID_DISCOVERY_QUERY', 'Query values must use the documented string or JSON encoding.'); } }
        $filters = [];
        if (isset($query['filters'])) {
            if (strlen($query['filters']) > 16384) { throw new DiscoveryException('INVALID_DISCOVERY_QUERY', 'Filters exceed the supported size.'); }
            try { $object = json_decode($query['filters'], false, 12, JSON_THROW_ON_ERROR); $filters = json_decode($query['filters'], true, 12, JSON_THROW_ON_ERROR); }
            catch (\JsonException) { throw new DiscoveryException('INVALID_DISCOVERY_QUERY', 'Filters must be a JSON object.'); }
            if (!$object instanceof \stdClass) { throw new DiscoveryException('INVALID_DISCOVERY_QUERY', 'Filters must be a JSON object.'); }
            foreach (get_object_vars($object) as $field => $value) {
                // Preserve the JSON array/object distinction before converting to PHP arrays.
                if ($field === 'event_seeking') {
                    if (!$value instanceof \stdClass) { throw new DiscoveryException('INVALID_DISCOVERY_QUERY', 'event_seeking must be an object of code arrays.'); }
                    foreach (get_object_vars($value) as $codes) { if (!is_array($codes)) { throw new DiscoveryException('INVALID_DISCOVERY_QUERY', 'Seeking codes must be JSON arrays.'); } }
                } else {
                    if (!is_array($value)) { throw new DiscoveryException('INVALID_DISCOVERY_QUERY', 'Filter values must be JSON arrays.'); }
                    if ($field === 'event_availability') { foreach ($value as $interval) { if (!$interval instanceof \stdClass) { throw new DiscoveryException('INVALID_DISCOVERY_QUERY', 'Availability entries must be JSON objects.'); } } }
                }
            }
        }
        $limit = $query['limit'] ?? '24';
        if ((!is_string($limit) && !is_int($limit)) || !preg_match('/^[1-9][0-9]?$/D', (string)$limit)) { throw new DiscoveryException('INVALID_DISCOVERY_QUERY', 'Use limit 1–48.'); }
        $request = new OrdinaryDiscoveryQuery($filters, $query['sort'] ?? 'recent', (int)$limit, $query['cursor'] ?? null, $query['target_type'] ?? 'person');
        return $this->ok($this->module->getOrdinaryDiscoveryService()->page($this->actor(), $this->id($spaceId), $request));
    }
    public function actionPerson(string $spaceId, string $ownerId): array
    {
        $this->method(['GET']); $this->query([]);
        return $this->ok($this->module->getOrdinaryDiscoveryService()->detail($this->actor(), $this->id($spaceId), $this->id($ownerId)));
    }
    private function actor(): int
    {
        if (Yii::$app->user->isGuest) { throw new NativeAccessException('authentication_required'); }
        $identity = Yii::$app->user->identity;
        if (!$identity instanceof User || (int)$identity->status !== User::STATUS_ENABLED) { throw new NativeAccessException('access_denied'); }
        return (int)$identity->id;
    }
    private function id(mixed $id): int
    {
        if ((!is_string($id) && !is_int($id)) || !preg_match('/^[1-9][0-9]{0,9}$/D', (string)$id) || (int)$id > 2147483647) { throw new DiscoveryException('INVALID_ID', 'Use a positive integer ID.'); }
        return (int)$id;
    }
    private function query(array $allowed): array
    {
        // Yii Request::resolve() merges named path captures into queryParams. Parse the
        // original client query instead so path arguments cannot become unknown filters,
        // and injected ?spaceId/?ownerId still fail instead of being silently discarded.
        $raw = Yii::$app->request->getQueryString();
        if (strlen($raw) > 32768) { throw new DiscoveryException('INVALID_DISCOVERY_QUERY', 'The query exceeds the supported size.'); }
        parse_str($raw, $query);
        // Yii's route selector is transport metadata, not an accepted discovery filter.
        unset($query[Yii::$app->urlManager->routeParam]);
        if (array_diff(array_keys($query), $allowed) !== []) { throw new DiscoveryException('UNKNOWN_QUERY_FIELD', 'The request contains unsupported query fields.'); }
        return $query;
    }
    private function body(array $allowed): array
    {
        $request = Yii::$app->request;
        if (strtolower(trim(explode(';', (string)$request->headers->get('Content-Type'))[0])) !== 'application/json') { throw new DiscoveryException('UNSUPPORTED_MEDIA_TYPE', 'Use application/json.', 415); }
        if (strlen($request->rawBody) > 16384) { throw new DiscoveryException('REQUEST_TOO_LARGE', 'The request body exceeds 16 KiB.', 413); }
        try { $object = json_decode($request->rawBody, false, 12, JSON_THROW_ON_ERROR); $body = json_decode($request->rawBody, true, 12, JSON_THROW_ON_ERROR); }
        catch (\JsonException) { throw new DiscoveryException('INVALID_JSON', 'Provide a JSON object.', 400); }
        if (!$object instanceof \stdClass) { throw new DiscoveryException('INVALID_JSON', 'Provide a JSON object.', 400); }
        if (array_diff(array_keys($body), $allowed) !== []) { throw new DiscoveryException('UNKNOWN_FIELD', 'The request contains unsupported body fields.'); }
        return $body;
    }
    private function method(array $methods): void
    {
        if (!in_array(Yii::$app->request->method, $methods, true)) { Yii::$app->response->headers->set('Allow', implode(', ', $methods)); throw new DiscoveryException('METHOD_NOT_ALLOWED', 'Unsupported request method.', 405); }
    }
    private function ok(array $data): array { return ['data' => $data, 'meta' => ['request_id' => $this->requestId]]; }
    private function error(int $status, string $code, string $message): array
    {
        Yii::$app->response->statusCode = $status;
        return ['error' => ['code' => $code, 'message' => $message, 'retryable' => $status >= 500, 'details' => []], 'meta' => ['request_id' => $this->requestId]];
    }
}
