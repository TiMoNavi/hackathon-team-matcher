<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\controllers;

use humhub\modules\matcherAuth\Module;
use humhub\modules\matcherAuth\adapters\native\ReceiptService;
use humhub\modules\matcherAuth\domain\AuthException;
use humhub\modules\matcherAuth\domain\AuthPolicy;
use humhub\modules\user\models\User;
use Yii;
use yii\web\HttpException;
use yii\web\Response;

final class ApiController extends \yii\web\Controller
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
        catch (AuthException $error) { return $this->error($error->httpStatus, $error->errorCode, $error->getMessage(), $error->details); }
        catch (HttpException $error) { return $this->error($error->statusCode, 'INVALID_REQUEST', 'The request or CSRF token is invalid.'); }
        catch (\Throwable $error) {
            Yii::error(['request_id' => $this->requestId, 'type' => get_class($error)], 'matcher-auth-api');
            return $this->error(500, 'INTERNAL_ERROR', 'The authentication request could not be completed.');
        }
    }
    public function actionCapabilities(): array
    {
        $this->method('GET');
        return $this->ok(['email_available' => $this->auth()->emailAvailable(), 'github_available' => $this->auth()->githubAvailable()]);
    }
    public function actionEmailCodes(): array
    {
        $this->method('POST'); $data = $this->body(['email', 'purpose', 'return_to']);
        if (!$this->auth()->emailAvailable()) { throw new AuthException('AUTH_UNAVAILABLE', 'Email authentication is unavailable.', 503); }
        return $this->ok($this->auth()->challenges()->request($this->string($data, 'email'), $this->string($data, 'purpose'), $this->string($data, 'return_to'), $this->auth()->receipts()->browser(), $this->actor()), 202);
    }
    public function actionVerify(): array
    {
        $this->method('POST'); $data = $this->body(['challenge_id', 'code']);
        if (!$this->auth()->emailAvailable()) { throw new AuthException('AUTH_UNAVAILABLE', 'Email authentication is unavailable.', 503); }
        $proof = $this->auth()->challenges()->verify($this->string($data, 'challenge_id'), $this->string($data, 'code'), $this->auth()->receipts()->browser(), $this->actor());
        $result = $this->auth()->identities()->resolve('email-code', $proof['email'], $proof['email'], $proof['purpose'], $proof['actor_id']);
        if ($result['registration']) { throw new AuthException('REGISTRATION_REQUIRED', 'Complete the required native registration fields.', 409, ['next_url' => '/user/registration']); }
        if (!$result['bound']) {
            $client = $this->auth()->identities()->client('email-code', $proof['email'], $proof['email']);
            (new NativeAuthController('auth', Yii::$app->getModule('user')))->authenticateVerified($result['user'], $client);
        }
        if (Yii::$app->user->isGuest || (int)Yii::$app->user->id !== (int)$result['user']->id) { throw new AuthException('AUTH_LOGIN_FAILED', 'The account could not be signed in.', 403); }
        Yii::$app->response->headers->remove('Location');
        Yii::$app->response->content = null;
        return $this->ok(['authenticated' => true, 'bound' => $result['bound'], 'next_url' => AuthPolicy::NEXT_URL]);
    }
    public function actionLogout(): array
    {
        $this->method('POST'); $this->body([]); $this->actor();
        Yii::$app->user->logout(true);
        if (!Yii::$app->user->isGuest) { throw new AuthException('AUTH_LOGIN_FAILED', 'The session could not be closed.', 403); }
        return $this->ok(['authenticated' => false]);
    }
    public function actionGithubStart()
    {
        $this->method('GET');
        if (!$this->auth()->githubAvailable()) { throw new AuthException('AUTH_UNAVAILABLE', 'GitHub authentication is unavailable.', 503); }
        $intent = Yii::$app->request->get('intent'); $returnTo = Yii::$app->request->get('return_to');
        if (!is_string($intent) || !is_string($returnTo)) { throw new AuthException('INVALID_REQUEST', 'Provide an explicit authentication intent.'); }
        AuthPolicy::context($intent, $this->actor(), $returnTo);
        $this->auth()->receipts()->issue(ReceiptService::OAUTH, 'github', $intent, '', '', $this->actor());
        Yii::$app->response->format = Response::FORMAT_HTML;
        return Yii::$app->response->redirect(['/user/auth/external', 'authclient' => 'github']);
    }
    private function actor(): ?int
    {
        if (Yii::$app->user->isGuest) { return null; }
        $user = Yii::$app->user->identity;
        if (!$user instanceof User || (int)$user->status !== User::STATUS_ENABLED) { throw new AuthException('ACCOUNT_UNAVAILABLE', 'This account is unavailable.', 403); }
        return (int)$user->id;
    }
    private function auth(): Module { return $this->module; }
    private function method(string $method): void
    {
        if (Yii::$app->request->method !== $method) { Yii::$app->response->headers->set('Allow', $method); throw new AuthException('INVALID_REQUEST', 'Unsupported request method.', 405); }
    }
    private function body(array $allowed): array
    {
        $request = Yii::$app->request;
        if (strtolower(trim(explode(';', (string)$request->headers->get('Content-Type'))[0])) !== 'application/json') { throw new AuthException('INVALID_REQUEST', 'Use application/json.', 415); }
        if (strlen($request->rawBody) > 4096) { throw new AuthException('INVALID_REQUEST', 'Authentication request is too large.', 413); }
        try { $object = json_decode($request->rawBody, false, 8, JSON_THROW_ON_ERROR); }
        catch (\JsonException) { throw new AuthException('INVALID_REQUEST', 'Provide a JSON object.'); }
        if (!$object instanceof \stdClass) { throw new AuthException('INVALID_REQUEST', 'Provide a JSON object.'); }
        $data = (array)$object;
        if (array_diff(array_keys($data), $allowed) !== []) { throw new AuthException('INVALID_REQUEST', 'Unsupported authentication field.'); }
        return $data;
    }
    private function string(array $data, string $key): string
    {
        if (!isset($data[$key]) || !is_string($data[$key])) { throw new AuthException('INVALID_REQUEST', 'A required authentication field is missing.'); }
        return $data[$key];
    }
    private function ok(array $data, int $status = 200): array
    {
        Yii::$app->response->format = Response::FORMAT_JSON; Yii::$app->response->statusCode = $status;
        return ['data' => $data, 'meta' => ['request_id' => $this->requestId]];
    }
    private function error(int $status, string $code, string $message, array $details = []): array
    {
        Yii::$app->response->format = Response::FORMAT_JSON; Yii::$app->response->statusCode = $status;
        Yii::$app->response->headers->remove('Location'); Yii::$app->response->content = null;
        if ($status === 429 && isset($details['retry_after'])) { Yii::$app->response->headers->set('Retry-After', (string)$details['retry_after']); }
        return ['error' => ['code' => $code, 'message' => $message, 'retryable' => false, 'details' => $details], 'meta' => ['request_id' => $this->requestId]];
    }
}
