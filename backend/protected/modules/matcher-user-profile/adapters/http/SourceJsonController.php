<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\http;

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\user\models\User;
use Yii;
use yii\web\Controller;
use yii\web\HttpException;
use yii\web\Response;

/** Authenticated JSON transport only. Domain services own progress and permission rules. */
abstract class SourceJsonController extends Controller
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
        catch (ProfileException $error) { return $this->error($error->httpStatus, $error->errorCode, $error->getMessage(), $error->details); }
        catch (HttpException $error) { return $this->error($error->statusCode, $error->statusCode === 400 ? 'INVALID_REQUEST' : 'HTTP_ERROR', 'The request or CSRF token is invalid.'); }
        catch (\Throwable $error) {
            Yii::error(['request_id' => $this->requestId, 'type' => get_class($error)], 'matcher-profile-sources-api');
            return $this->error(500, 'INTERNAL_ERROR', 'The request could not be completed.');
        }
    }
    public function beforeAction($action)
    {
        $this->actor();
        return parent::beforeAction($action);
    }
    protected function actor(): int
    {
        if (Yii::$app->user->isGuest) { throw new ProfileException('AUTHENTICATION_REQUIRED', 'Sign in to continue.', 401); }
        $user = Yii::$app->user->identity;
        if (!$user instanceof User || (int)$user->status !== User::STATUS_ENABLED) { throw new ProfileException('ACCOUNT_UNAVAILABLE', 'This account is unavailable.', 403); }
        return (int)$user->id;
    }
    protected function method(string $expected): void
    {
        if (Yii::$app->request->method !== $expected) {
            Yii::$app->response->headers->set('Allow', $expected);
            throw new ProfileException('METHOD_NOT_ALLOWED', 'Unsupported request method.', 405);
        }
    }
    protected function body(array $allowed): array
    {
        $request = Yii::$app->request;
        if (strtolower(trim(explode(';', (string)$request->headers->get('Content-Type'))[0])) !== 'application/json') { throw new ProfileException('UNSUPPORTED_MEDIA_TYPE', 'Use application/json.', 415); }
        if (strlen($request->rawBody) > 262144) { throw new ProfileException('REQUEST_TOO_LARGE', 'The JSON body exceeds 256 KiB.', 413); }
        try { $object = json_decode($request->rawBody, false, 32, JSON_THROW_ON_ERROR); }
        catch (\JsonException) { throw new ProfileException('INVALID_JSON', 'Provide a valid JSON object.', 400); }
        if (!$object instanceof \stdClass) { throw new ProfileException('INVALID_JSON', 'Provide a JSON object.', 400); }
        $data = json_decode($request->rawBody, true, 32, JSON_THROW_ON_ERROR);
        if (array_diff(array_keys($data), $allowed) !== []) { throw new ProfileException('UNKNOWN_FIELD', 'The request contains unsupported fields.'); }
        return $data;
    }
    protected function uuid(mixed $value): string
    {
        if (!is_string($value) || !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $value)) { throw new ProfileException('INVALID_ID', 'Provide a valid resource ID.'); }
        return $value;
    }
    protected function positiveId(mixed $value): int
    {
        if ((!is_int($value) && !is_string($value)) || !preg_match('/^[1-9][0-9]{0,9}$/D', (string)$value) || (int)$value > 2147483647) { throw new ProfileException('INVALID_ID', 'Provide a valid positive ID.'); }
        return (int)$value;
    }
    protected function version(array $data, string $key = 'expected_version'): int
    {
        if (!isset($data[$key]) || !is_int($data[$key]) || $data[$key] < 0) { throw new ProfileException('INVALID_VERSION', $key . ' must be a nonnegative integer.'); }
        return $data[$key];
    }
    protected function list(array $data, string $key): array
    {
        if (!isset($data[$key]) || !is_array($data[$key]) || !array_is_list($data[$key])) { throw new ProfileException('INVALID_LIST', $key . ' must be a JSON list.'); }
        return $data[$key];
    }
    protected function ok(array $data, int $status = 200): array
    {
        Yii::$app->response->statusCode = $status;
        return ['data' => $data, 'meta' => ['request_id' => $this->requestId]];
    }
    private function error(int $status, string $code, string $message, array $details = []): array
    {
        Yii::$app->response->statusCode = $status;
        return ['error' => ['code' => $code, 'message' => $message, 'retryable' => $status >= 500, 'details' => $details], 'meta' => ['request_id' => $this->requestId]];
    }
}
