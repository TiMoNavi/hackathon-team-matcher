<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\controllers;

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\Module;
use humhub\modules\user\models\User;
use Yii;
use yii\web\Controller;
use yii\web\HttpException;
use yii\web\Response;
use yii\web\UploadedFile;

/** Session-authenticated ordinary-user API. The administrator REST module is independent. */
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
        catch (ProfileException $error) { return $this->error($error->httpStatus, $error->errorCode, $error->getMessage(), $error->details); }
        catch (HttpException $error) { return $this->error($error->statusCode, $error->statusCode === 400 ? 'INVALID_REQUEST' : 'HTTP_ERROR', $error->statusCode === 400 ? 'Invalid request or CSRF token.' : 'The request could not be completed.'); }
        catch (\Throwable $error) {
            Yii::error(['request_id' => $this->requestId, 'type' => get_class($error)], 'matcher-profile-api');
            return $this->error(500, 'INTERNAL_ERROR', 'The request could not be completed.');
        }
    }

    public function beforeAction($action)
    {
        $this->actor();
        return parent::beforeAction($action);
    }

    public function actionProfile(): array
    {
        $this->method('GET'); $actor = $this->actor();
        return $this->ok($this->services()->getProfileService()->getProfile($actor, $actor, $this->scope()));
    }

    public function actionMe(): array
    {
        $actor = $this->actor();
        if (Yii::$app->request->method === 'GET') { return $this->ok($this->services()->getIdentityService()->getIdentity($actor)); }
        $this->method('PATCH'); $data = $this->body(['expected_version', 'nickname', 'avatar_ref']);
        $version = $this->version($data, 'expected_version'); unset($data['expected_version']);
        return $this->ok($this->services()->getIdentityService()->update($actor, $version, $data));
    }

    public function actionDrafts(): array
    {
        $this->method('POST'); $actor = $this->actor();
        $data = $this->body(['scope', 'space_id', 'event_id', 'base_profile_version']); $scope = $this->scope($data);
        $result = $this->create('profile-drafts:' . $scope->key(), $data, $scope, function () use ($actor, $scope, $data) {
            if (isset($data['base_profile_version'])) {
                $current = $this->services()->getProfileService()->getProfile($actor, $actor, $scope);
                if ($this->version($data, 'base_profile_version') !== $current['revision']) { throw new ProfileException('VERSION_CONFLICT', 'Profile has changed; reload before editing.', 409); }
            }
            return $this->services()->getProfileService()->startDraft($actor, $actor, $scope);
        });
        return $this->ok($result, 201);
    }

    public function actionDraft(string $id): array
    {
        $id = $this->uuid($id); $actor = $this->actor(); $scope = $this->scope();
        if (Yii::$app->request->method === 'GET') { return $this->ok($this->services()->getProfileService()->getDraft($actor, $actor, $scope, $id)); }
        $this->method('PUT'); $data = $this->body(['expected_version', 'fields']);
        return $this->ok($this->services()->getProfileService()->updateDraft($actor, $actor, $scope, $id, $this->version($data, 'expected_version'), $this->list($data, 'fields')));
    }

    public function actionConfirm(string $id): array
    {
        $this->method('POST'); $id = $this->uuid($id); $actor = $this->actor(); $scope = $this->scope();
        $data = $this->body(['expected_version', 'base_revision', 'attribute_ids', 'confirmation_intent']);
        if (($data['confirmation_intent'] ?? null) !== 'confirm') { throw new ProfileException('CONFIRMATION_REQUIRED', 'Send confirmation_intent=confirm after reviewing the draft.'); }
        return $this->ok($this->services()->getProfileService()->confirmDraft($actor, $actor, $scope, $id, $this->version($data, 'expected_version'), $this->version($data, 'base_revision'), isset($data['attribute_ids']) ? $this->list($data, 'attribute_ids') : null));
    }

    public function actionReconfirm(): array
    {
        $this->method('POST'); $actor = $this->actor(); $scope = $this->scope(); $data = $this->body(['expected_version', 'attribute_ids']);
        return $this->ok($this->services()->getProfileService()->reconfirm($actor, $actor, $scope, $this->version($data, 'expected_version'), $this->list($data, 'attribute_ids')));
    }

    public function actionRevision(string $revision): array
    {
        $this->method('GET'); $actor = $this->actor();
        return $this->ok($this->services()->getProfileService()->getRevision($actor, $actor, $this->scope(), $this->positiveId($revision)));
    }

    public function actionContext(string $spaceId): array
    {
        $scope = ProfileScope::event($this->positiveId($spaceId)); $actor = $this->actor(); $service = $this->services()->getProfileService();
        if (Yii::$app->request->method === 'GET') { return $this->ok($service->getProfile($actor, $actor, $scope)); }
        $this->method('PUT'); $data = $this->body(['expected_version', 'attributes', 'confirmation_intent']);
        if (($data['confirmation_intent'] ?? null) !== 'confirm') { throw new ProfileException('CONFIRMATION_REQUIRED', 'Send confirmation_intent=confirm after reviewing the context.'); }
        $result = $this->services()->getProfileRepository()->transaction(function () use ($actor, $scope, $service, $data) {
            $current = $service->getProfile($actor, $actor, $scope);
            if ($this->version($data, 'expected_version') !== $current['revision']) { throw new ProfileException('VERSION_CONFLICT', 'Space profile has changed.', 409); }
            $draft = $service->startDraft($actor, $actor, $scope, 'manual', false);
            $draft = $service->updateDraft($actor, $actor, $scope, $draft['id'], $draft['draft_version'], $this->list($data, 'attributes'));
            return $service->confirmDraft($actor, $actor, $scope, $draft['id'], $draft['draft_version'], $current['revision']);
        });
        return $this->ok($result);
    }

    public function actionViewProfile(string $ownerId, ?string $spaceId = null): array
    {
        $this->method('GET'); $actor = $this->actor();
        $querySpace = Yii::$app->request->get('space_id');
        $space = $spaceId !== null ? $this->positiveId($spaceId) : ($querySpace === null ? null : $this->positiveId($querySpace));
        if ($spaceId !== null && $querySpace !== null && $this->positiveId($querySpace) !== $space) { throw new ProfileException('INVALID_ACCESS_CONTEXT', 'The route and query must use the same Space.'); }
        $owner = $this->positiveId($ownerId);
        $service = $this->services()->getProfileService();
        $context = $this->readContext($owner, $space);
        return $this->ok(['global' => $service->getProfile($actor, $owner, ProfileScope::global(), $space, $context), 'space' => $space === null ? null : $service->getProfile($actor, $owner, ProfileScope::event($space), $space, $context)]);
    }

    public function actionProposal(string $ownerId): array
    {
        $this->method('POST'); $actor = $this->actor(); $owner = $this->positiveId($ownerId);
        $data = $this->body(['scope', 'space_id', 'event_id', 'fields']); $scope = $this->scope($data);
        $result = $this->services()->getIdempotencyGuard()->run($actor, 'admin-proposal:' . $owner . ':' . $scope->key(), Yii::$app->request->headers->get('Idempotency-Key'), $data,
            function () use ($actor, $owner, $scope) { $this->services()->getAccessPolicy()->assertWritable(); $this->services()->getAccessPolicy()->assertAdministrator($actor, $owner, $scope); },
            fn() => $this->services()->getProfileService()->adminProposal($actor, $owner, $scope, $this->list($data, 'fields')));
        return $this->ok($result, 201);
    }

    public function actionAvatar(): array { return $this->upload('avatar'); }
    public function actionContactQr(): array { return $this->upload('contact_qr'); }

    private function upload(string $kind): array
    {
        $this->method('POST'); $actor = $this->actor(); $file = UploadedFile::getInstanceByName('file');
        if (!$file || $file->error !== UPLOAD_ERR_OK || !is_uploaded_file($file->tempName)) { throw new ProfileException('INVALID_UPLOAD', 'Provide one successfully uploaded image.'); }
        if ($file->size < 1 || $file->size > 5 * 1024 * 1024) { throw new ProfileException('INVALID_IMAGE_SIZE', 'Images must be nonempty and at most 5 MiB.'); }
        $result = $this->services()->getIdempotencyGuard()->run($actor, 'media-upload:' . $kind, Yii::$app->request->headers->get('Idempotency-Key'), ['kind' => $kind, 'content_sha256' => hash_file('sha256', $file->tempName)],
            function () use ($actor) { $this->services()->getAccessPolicy()->assertWritable(); $this->services()->getAccessPolicy()->assertOwner($actor, $actor, ProfileScope::global()); },
            fn() => $this->services()->getIdentityService()->upload($actor, $kind, $file->tempName),
            fn(array $receipt) => $this->services()->getIdentityService()->readMedia($actor, $receipt['file_ref']),
            fn(array $receipt) => $this->services()->getIdentityService()->discardRolledBackUpload($receipt['file_ref']));
        $result['url'] = $this->services()->mediaUrl($result['file_ref']);
        $result['thumbnail_url'] = $this->services()->mediaUrl($result['file_ref'], 'thumbnail');
        return $this->ok($result, 201);
    }

    public function actionMedia(string $ref)
    {
        $this->method('GET'); $spaceValue = Yii::$app->request->get('space_id');
        $variant = Yii::$app->request->get('variant', 'main');
        if (!is_string($variant)) { throw new ProfileException('INVALID_MEDIA_VARIANT', 'Unknown image variant.'); }
        $space = $spaceValue === null ? null : $this->positiveId($spaceValue);
        $media = $this->services()->getIdentityService()->readMedia($this->actor(), $ref, $variant, $space, $this->readContext(null, $space));
        Yii::$app->response->headers->set('Content-Security-Policy', "default-src 'none'");
        return Yii::$app->response->sendFile($media['path'], 'profile-image.png', ['mimeType' => $media['mime'], 'inline' => true]);
    }

    public function actionNotFound(): array { throw new ProfileException('NOT_FOUND', 'Unknown profile API endpoint.', 404); }

    /** Parse entry evidence only; the independent policy verifies live facts on every read. */
    private function readContext(?int $ownerId, ?int $spaceId): array
    {
        $entry = Yii::$app->request->get('entry_type');
        $postValue = Yii::$app->request->get('post_id');
        if ($ownerId === null && $spaceId === null && $entry === null && $postValue === null) { return []; }
        $postId = $postValue === null ? null : $this->positiveId($postValue);
        $entry ??= $ownerId === $this->actor() ? 'self' : ($spaceId !== null ? 'space' : ($postId !== null ? 'public_post' : 'friendship'));
        if (!is_string($entry) || !in_array($entry, ['self', 'space', 'friendship', 'public_post'], true)) { throw new ProfileException('INVALID_ACCESS_CONTEXT', 'Provide a valid profile entry.'); }
        return ['entry_type' => $entry, 'space_id' => $spaceId, 'post_id' => $postId, 'purpose' => 'detail'];
    }

    private function create(string $route, array $data, ProfileScope $scope, callable $perform): array
    {
        $actor = $this->actor();
        return $this->services()->getIdempotencyGuard()->run($actor, $route, Yii::$app->request->headers->get('Idempotency-Key'), $data,
            function () use ($actor, $scope) { $this->services()->getAccessPolicy()->assertWritable(); $this->services()->getAccessPolicy()->assertOwner($actor, $actor, $scope); }, $perform);
    }

    private function actor(): int
    {
        if (Yii::$app->user->isGuest) { throw new ProfileException('AUTHENTICATION_REQUIRED', 'Sign in to continue.', 401); }
        $user = Yii::$app->user->identity;
        if (!$user instanceof User || (int)$user->status !== User::STATUS_ENABLED) { throw new ProfileException('ACCOUNT_UNAVAILABLE', 'This account is unavailable.', 403); }
        return (int)$user->id;
    }
    private function services(): Module { return $this->module; }
    private function method(string $expected): void
    {
        if (Yii::$app->request->method !== $expected) { Yii::$app->response->headers->set('Allow', $expected); throw new ProfileException('METHOD_NOT_ALLOWED', 'Unsupported request method.', 405); }
    }
    private function body(array $allowed): array
    {
        $request = Yii::$app->request;
        if (strtolower(explode(';', (string)$request->headers->get('Content-Type'))[0]) !== 'application/json') { throw new ProfileException('UNSUPPORTED_MEDIA_TYPE', 'Use application/json.', 415); }
        $raw = $request->rawBody;
        if (strlen($raw) > 262144) { throw new ProfileException('REQUEST_TOO_LARGE', 'The JSON body exceeds 256 KiB.', 413); }
        try { $object = json_decode($raw, false, 32, JSON_THROW_ON_ERROR); } catch (\JsonException) { throw new ProfileException('INVALID_JSON', 'Provide a valid JSON object.', 400); }
        if (!$object instanceof \stdClass) { throw new ProfileException('INVALID_JSON', 'Provide a JSON object.', 400); }
        $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        if (array_diff(array_keys($data), $allowed) !== []) { throw new ProfileException('UNKNOWN_FIELD', 'The request contains unsupported fields.'); }
        return $data;
    }
    private function scope(?array $body = null): ProfileScope
    {
        $data = $body ?? Yii::$app->request->queryParams;
        $kind = $data['scope'] ?? (isset($data['space_id']) || isset($data['event_id']) ? 'space' : 'global');
        if ($kind === 'global') {
            if (isset($data['space_id']) || isset($data['event_id'])) { throw new ProfileException('INVALID_SCOPE', 'Global profiles do not accept a Space ID.'); }
            return ProfileScope::global();
        }
        if (!in_array($kind, ['event', 'space'], true)) { throw new ProfileException('INVALID_SCOPE', 'Use global or space.'); }
        if (isset($data['space_id'], $data['event_id']) && $this->positiveId($data['space_id']) !== $this->positiveId($data['event_id'])) { throw new ProfileException('INVALID_SCOPE', 'space_id and event_id must match.'); }
        return ProfileScope::event($this->positiveId($data['space_id'] ?? $data['event_id'] ?? ''));
    }
    private function positiveId(mixed $value): int
    {
        if ((!is_string($value) && !is_int($value)) || !preg_match('/^[1-9][0-9]{0,9}$/D', (string)$value) || (int)$value > 2147483647) { throw new ProfileException('INVALID_ID', 'Provide a valid positive ID.'); }
        return (int)$value;
    }
    private function version(array $data, string $key): int
    {
        if (!isset($data[$key]) || !is_int($data[$key]) || $data[$key] < 0) { throw new ProfileException('INVALID_VERSION', $key . ' must be a nonnegative integer.'); }
        return $data[$key];
    }
    private function uuid(string $value): string
    {
        if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $value)) { throw new ProfileException('INVALID_ID', 'Provide a valid resource ID.'); }
        return $value;
    }
    private function list(array $data, string $key): array
    {
        if (!isset($data[$key]) || !is_array($data[$key]) || !array_is_list($data[$key]) || count($data[$key]) > 200) { throw new ProfileException('INVALID_FIELDS', $key . ' must be a list with at most 200 items.'); }
        return $data[$key];
    }
    private function ok(array $data, int $status = 200): array { Yii::$app->response->statusCode = $status; return ['data' => $data, 'meta' => ['request_id' => $this->requestId]]; }
    private function error(int $status, string $code, string $message, array $details = []): array
    {
        Yii::$app->response->statusCode = $status; Yii::$app->response->format = Response::FORMAT_JSON;
        return ['error' => ['code' => $code, 'message' => $message, 'details' => $details, 'retryable' => $status >= 500], 'meta' => ['request_id' => $this->requestId]];
    }
}
