<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\controllers;

use humhub\modules\matcherRecommendation\adapters\analysis\CooperationHttpInput;
use humhub\modules\matcherRecommendation\adapters\native\NativeAccessException;
use humhub\modules\matcherRecommendation\contracts\analysis\CooperationAnalysisException;
use humhub\modules\matcherRecommendation\domain\browse\DiscoveryException;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\user\models\User;
use Yii;
use yii\web\{Controller, HttpException, Response};

/** Session-authenticated rule analysis. PUT/POST require native Yii CSRF; no AI endpoint. */
final class AnalysisController extends Controller
{
    public $enableCsrfValidation = true;
    private string $requestId;
    public function runAction($id, $params = [])
    {
        $this->requestId = bin2hex(random_bytes(12)); Yii::$app->response->format = Response::FORMAT_JSON;
        Yii::$app->response->headers->set('Cache-Control', 'private, no-store');
        Yii::$app->response->headers->set('X-Content-Type-Options', 'nosniff');
        try { return parent::runAction($id, $params); }
        catch (CooperationAnalysisException $error) {
            [$status, $code] = match ($error->reason) {
                'invalid_request' => [400, 'INVALID_ANALYSIS_REQUEST'],
                'context_changed' => [409, 'ANALYSIS_CONTEXT_CHANGED'],
                'selection_unavailable' => [409, 'ANALYSIS_SELECTION_CHANGED'],
                'projection_changed' => [409, 'ANALYSIS_PROJECTION_CHANGED'],
                'candidate_unavailable' => [404, 'ANALYSIS_CANDIDATE_UNAVAILABLE'],
                default => [503, 'ANALYSIS_UNAVAILABLE'],
            };
            return $this->error($status, $code, 'The analysis state is unavailable or has changed.');
        }
        catch (NativeAccessException $error) {
            [$status, $code] = match ($error->reason) {
                'authentication_required' => [401, 'AUTHENTICATION_REQUIRED'],
                'access_denied', 'candidate_access_revoked' => [403, 'ACCESS_DENIED'],
                'current_event_required', 'current_event_mismatch', 'context_changed' => [409, 'ANALYSIS_CONTEXT_CHANGED'],
                default => [503, 'ANALYSIS_UNAVAILABLE'],
            };
            return $this->error($status, $code, 'The current account or activity could not be verified.');
        }
        catch (DiscoveryException $error) {
            $code = match ($error->errorCode) {
                'DISCOVERY_PERSON_NOT_FOUND' => 'ANALYSIS_CANDIDATE_UNAVAILABLE',
                'DISCOVERY_CHANGED' => 'ANALYSIS_PROJECTION_CHANGED',
                'DISCOVERY_UNAVAILABLE' => 'ANALYSIS_UNAVAILABLE',
                default => $error->errorCode,
            };
            return $this->error($error->httpStatus, $code, 'The requested person or discovery state is unavailable.');
        }
        catch (ProfileException $error) { return $this->error($error->httpStatus, $error->errorCode, 'The selected profile data is unavailable.'); }
        catch (HttpException $error) { return $this->error($error->statusCode, 'INVALID_REQUEST', 'The request or CSRF token is invalid.'); }
        catch (\Throwable) { return $this->error(503, 'ANALYSIS_UNAVAILABLE', 'The analysis dependencies are unavailable.'); }
    }
    public function beforeAction($action)
    {
        $this->actor(); return parent::beforeAction($action);
    }
    public function actionSelfSelection(string $spaceId): array
    {
        $this->method(['GET', 'PUT']); $this->query();
        $viewer = $this->actor(); $space = $this->id($spaceId); $factory = $this->module->getCooperationFactory();
        if (Yii::$app->request->method === 'GET') { return $this->ok($factory->selection($viewer, $space)); }
        $input = CooperationHttpInput::selection($this->body());
        return $this->ok($factory->replace($viewer, $space, $input['attribute_ids'], $input['expected_selection_version'], $input['expected_current_event']));
    }
    public function actionPerson(string $spaceId, string $ownerId): array
    {
        $this->method(['POST']); $this->query(); $input = CooperationHttpInput::analysis($this->body());
        return $this->ok($this->module->getCooperationFactory()->analyze($this->actor(), $this->id($spaceId), $this->id($ownerId),
            $input['expected_selection_version'], $input['expected_candidate'], $input['expected_current_event']));
    }
    private function actor(): int
    {
        if (Yii::$app->user->isGuest) { throw new NativeAccessException('authentication_required'); }
        $identity = Yii::$app->user->identity;
        if (!$identity instanceof User || (int)$identity->status !== User::STATUS_ENABLED) { throw new NativeAccessException('access_denied'); }
        return (int)$identity->id;
    }
    private function id(string $id): int
    {
        if (!preg_match('/^[1-9][0-9]{0,9}$/D', $id) || (int)$id > 2147483647) { throw new CooperationAnalysisException('invalid_request'); }
        return (int)$id;
    }
    private function query(): void
    {
        $raw = Yii::$app->request->getQueryString();
        if (strlen($raw) > 4096) { throw new CooperationAnalysisException('invalid_request'); }
        parse_str($raw, $query); unset($query[Yii::$app->urlManager->routeParam]);
        if ($query !== []) { throw new CooperationAnalysisException('invalid_request'); }
    }
    private function body(): \stdClass
    {
        $request = Yii::$app->request;
        if (strtolower(trim(explode(';', (string)$request->headers->get('Content-Type'))[0])) !== 'application/json') {
            throw new DiscoveryException('UNSUPPORTED_MEDIA_TYPE', 'Use application/json.', 415);
        }
        if (strlen($request->rawBody) > 16384) { throw new DiscoveryException('REQUEST_TOO_LARGE', 'Use at most 16 KiB.', 413); }
        try { $body = json_decode($request->rawBody, false, 12, JSON_THROW_ON_ERROR); }
        catch (\JsonException) { throw new CooperationAnalysisException('invalid_request'); }
        if (!$body instanceof \stdClass) { throw new CooperationAnalysisException('invalid_request'); }
        return $body;
    }
    private function method(array $allowed): void
    {
        if (!in_array(Yii::$app->request->method, $allowed, true)) {
            Yii::$app->response->headers->set('Allow', implode(', ', $allowed));
            throw new DiscoveryException('METHOD_NOT_ALLOWED', 'Unsupported request method.', 405);
        }
    }
    private function ok(array $data): array { return ['data' => $data, 'meta' => ['request_id' => $this->requestId]]; }
    private function error(int $status, string $code, string $message): array
    {
        Yii::$app->response->statusCode = $status;
        return ['error' => ['code' => $code, 'message' => $message, 'retryable' => false, 'details' => []], 'meta' => ['request_id' => $this->requestId]];
    }
}
