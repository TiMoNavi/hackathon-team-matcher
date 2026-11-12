<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\controllers;

use humhub\modules\matcherAuth\adapters\native\GithubImportStatusReader;
use humhub\modules\matcherAuth\domain\AuthException;
use humhub\modules\user\models\User;
use Yii;
use yii\web\Response;

final class GithubImportStatusController extends \yii\web\Controller
{
    // This read-only action rejects every mutation method itself, including POST without CSRF.
    public $enableCsrfValidation = false;
    public function actionIndex(): array
    {
        $requestId = bin2hex(random_bytes(12));
        Yii::$app->response->format = Response::FORMAT_JSON;
        Yii::$app->response->headers->set('Cache-Control', 'private, no-store');
        Yii::$app->response->headers->set('X-Content-Type-Options', 'nosniff');
        try {
            if (Yii::$app->request->method !== 'GET') {
                Yii::$app->response->headers->set('Allow', 'GET');
                throw new AuthException('INVALID_REQUEST', 'Use GET to read import status.', 405);
            }
            if (Yii::$app->user->isGuest) { throw new AuthException('AUTHENTICATION_REQUIRED', 'Sign in to read your import status.', 401); }
            $user = Yii::$app->user->identity;
            if (!$user instanceof User || (int)$user->status !== User::STATUS_ENABLED) {
                throw new AuthException('ACCOUNT_UNAVAILABLE', 'This account is unavailable.', 403);
            }
            if (Yii::$app->request->queryParams !== []) { throw new AuthException('INVALID_REQUEST', 'This endpoint does not accept identity or query parameters.', 400); }
            return ['data' => (new GithubImportStatusReader())->read((int)$user->id), 'meta' => ['request_id' => $requestId]];
        } catch (AuthException $error) {
            Yii::$app->response->statusCode = $error->httpStatus;
            return ['error' => ['code' => $error->errorCode, 'message' => $error->getMessage(), 'retryable' => false, 'details' => []], 'meta' => ['request_id' => $requestId]];
        } catch (\Throwable) {
            Yii::$app->response->statusCode = 500;
            return ['error' => ['code' => 'INTERNAL_ERROR', 'message' => 'Import status is unavailable.', 'retryable' => false, 'details' => []], 'meta' => ['request_id' => $requestId]];
        }
    }
}
