<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat;

use humhub\modules\matcherChat\adapters\http\RequestBoundary;
use humhub\modules\matcherChat\adapters\http\{EntryTakeoverEvent, SessionActor};
use humhub\modules\matcherChat\adapters\native\{GuardedPollController, NativeGuard};
use humhub\modules\matcherChat\application\EntryPolicy;
use humhub\modules\matcherChat\domain\{ChatException, PageRequest, SafeInteger};
use Yii;

final class Events
{
    private static function guard(): ?NativeGuard
    {
        $module = Yii::$app->getModule('matcher-chat');
        if (!$module instanceof Module || !$module->isEnabled) { return null; }
        if (!$module->schemaReady()) {
            // Partial-schema operation is not a safe reason to drop protections.
            throw new \yii\web\ServiceUnavailableHttpException('Chat protection metadata is unavailable.');
        }
        return new NativeGuard($module->sql());
    }
    private static function viewer(): ?int
    {
        if (!Yii::$app instanceof \yii\web\Application || Yii::$app->user->isGuest) { return null; }
        return SafeInteger::native(Yii::$app->user->id, 'viewer_id');
    }
    public static function beforeRequest(): void
    {
        if (!Yii::$app instanceof \yii\web\Application) { return; }
        $request = Yii::$app->request;
        RequestBoundary::prepare($request);
        [$route] = $request->resolve();
        $module = Yii::$app->getModule('matcher-chat');
        if (!$module instanceof Module || !$module->isEnabled) { return; }
        $protectedPoll = $module->installPollProtection();
        // Avoid reading/decoding arbitrary raw bodies. Native forms are already parsed by PHP.
        $body = $request->getMethod() === 'POST' && str_starts_with((string)$request->headers->get('Content-Type'), 'application/x-www-form-urlencoded') ? $request->bodyParams : [];
        $route = self::canonicalRoute($route);
        if (self::takeover($module, $route, $request->queryParams)) { Yii::$app->end(); }
        if (!self::needsGuard($route, $request->queryParams, $body, $protectedPoll)) { return; }
        self::guard()?->request($route, $request->queryParams, $body, self::viewer(), $protectedPoll);
    }
    public static function beforeAction($event): void
    {
        if (!Yii::$app instanceof \yii\web\Application) { return; }
        $controller = $event->action->controller;
        $route = self::canonicalRoute($controller->getUniqueId() . '/' . $event->action->id);
        $request = Yii::$app->request;
        $body = $request->getMethod() === 'POST' && str_starts_with((string)$request->headers->get('Content-Type'), 'application/x-www-form-urlencoded') ? $request->bodyParams : [];
        $module = Yii::$app->getModule('matcher-chat');
        if (!$module instanceof Module || !$module->isEnabled) { return; }
        // Controller class closes route aliases supplied by other modules.
        $class = strtolower(get_class($controller));
        if (str_starts_with($class, 'humhub\\modules\\mail\\controllers\\rest\\')) { $route = 'mail/rest/' . $event->action->id; }
        elseif ($controller instanceof \humhub\modules\mail\controllers\MailController) { $route = 'mail/mail/' . $event->action->id; }
        elseif ($controller instanceof \humhub\modules\mail\controllers\InboxController) { $route = 'mail/inbox/' . $event->action->id; }
        elseif (str_starts_with($class, 'humhub\\modules\\file\\controllers\\')) { $route = 'file/file/' . $event->action->id; }
        elseif ($controller instanceof \humhub\modules\live\controllers\PollController) { $route = 'live/poll/' . $event->action->id; }
        if (self::takeover($module, $route, $request->queryParams)) { $event->isValid = false; return; }
        $protectedPoll = $controller instanceof GuardedPollController;
        if (!self::needsGuard($route, $request->queryParams, $body, $protectedPoll)) { return; }
        self::guard()?->request($route, $request->queryParams, $body, self::viewer(), $protectedPoll);
    }
    public static function beforeNativeWrite($event): void
    {
        if ($event->sender instanceof \humhub\modules\file\models\File
            && !self::mailFileModel($event->sender->object_model) && !self::mailFileModel($event->sender->getOldAttribute('object_model'))) { return; }
        self::guard()?->nativeWrite($event->sender);
    }
    public static function beforeIdentityChange($event): void
    {
        $user = $event->sender;
        if ($event->name === \yii\db\BaseActiveRecord::EVENT_BEFORE_DELETE || $user->isAttributeChanged('status')) {
            self::guard()?->invalidateIdentity(SafeInteger::native($user->id, 'viewer_id'));
        }
    }
    public static function beforeInboxWidget($event): void
    {
        try {
            $guard = self::guard();
            if ($guard !== null && $guard->viewerManaged(self::viewer())) { $event->isValid = false; }
        } catch (\Throwable) { $event->isValid = false; }
    }

    private static function canonicalRoute(string $route): string
    {
        $route = trim($route, '/');
        return match ($route) {
            'mail' => 'mail/mail/index', 'mail/mail' => 'mail/mail/index', 'mail/inbox' => 'mail/inbox/index',
            'meta-search' => 'meta-search/index', 'live/poll' => 'live/poll/index', default => $route,
        };
    }

    /** Select relevant routes before schema access; unrelated pages keep running. */
    private static function needsGuard(string $route, array $query, array $body, bool $protectedPoll): bool
    {
        if (str_starts_with($route, 'mail/')) { return true; }
        if ($route === 'meta-search/index') {
            $provider = $body['provider'] ?? null;
            return !is_string($provider) || ltrim($provider, '\\') === ''
                || strcasecmp(ltrim($provider, '\\'), 'humhub\\modules\\mail\\search\\SearchProvider') === 0;
        }
        if ($route === 'live/poll/index') { return !$protectedPoll; }
        if ($route === 'file' || str_starts_with($route, 'file/')) {
            foreach ([$query, $body] as $input) {
                if (!array_key_exists('guid', $input)) { continue; }
                $guid = $input['guid'];
                if (!is_string($guid) || preg_match('/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/D', $guid) !== 1) { throw new \yii\web\NotFoundHttpException('File unavailable.'); }
                $row = Yii::$app->db->createCommand('SELECT object_model FROM {{%file}} WHERE guid=:guid', [':guid' => $guid])->queryOne();
                if ($row !== false && self::mailFileModel($row['object_model'])) { return true; }
            }
        }
        return false;
    }

    private static function mailFileModel(mixed $model): bool
    {
        return is_string($model) && str_starts_with(strtolower(ltrim($model, '\\')), 'humhub\\modules\\mail\\');
    }

    /** Intercept known navigation before native show() can call seen(). */
    private static function takeover(Module $module, string $route, array $query): bool
    {
        if (!in_array($route, ['mail/mail/index', 'mail/mail/show', 'mail/inbox/index'], true)
            || Yii::$app->request->method !== 'GET' || !$module->isEntryTakeoverEnabled()) { return false; }
        $viewer = self::viewer();
        if ($viewer === null) { return false; }
        try {
            SessionActor::requireSelf($viewer);
            $guard = self::guard();
            if ($guard === null || !$guard->viewerManaged($viewer)) { return false; }
            Yii::$app->response->headers->set('Cache-Control', 'private, no-store');
            Yii::$app->response->headers->set('X-Content-Type-Options', 'nosniff');
            $navigation = EntryPolicy::navigation($route, 'GET', $query);
            $event = new EntryTakeoverEvent($viewer);
            $module->trigger(Module::EVENT_ENTRY_READINESS, $event);
            $status = $module->entryStatus($viewer, $event->uiReady);
            if ($status['state'] !== 'takeover') {
                Yii::$app->response->headers->set('X-Matcher-Chat-Entry-State', $status['state']);
                throw new \yii\web\ServiceUnavailableHttpException('Chat entry is paused or its native conversation coverage is unsupported.');
            }
            if ($navigation['id'] !== null) {
                if (!$guard->managed($navigation['id'])) { throw ChatException::unavailable(); }
                $module->reader($viewer)->messages($viewer, $navigation['id'], new PageRequest(1), 'entry-navigation');
            }
            $response = Yii::$app->response;
            $response->headers->set('Cache-Control', 'private, no-store');
            $response->headers->set('X-Content-Type-Options', 'nosniff');
            $response->headers->set('Location', EntryPolicy::target(Yii::$app->request->baseUrl, $navigation['id']));
            $response->statusCode = 302;
            $response->data = null;
            $response->content = '';
            return true;
        } catch (ChatException $error) {
            Yii::$app->response->headers->remove('Location');
            throw new \yii\web\HttpException($error->httpStatus, 'Chat entry is unavailable.');
        }
    }
}
