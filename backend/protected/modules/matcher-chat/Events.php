<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat;

use humhub\modules\matcherChat\adapters\http\RequestBoundary;
use humhub\modules\matcherChat\adapters\native\NativeGuard;
use humhub\modules\matcherChat\domain\SafeInteger;
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
        if (!Yii::$app instanceof \yii\web\Application || ($guard = self::guard()) === null) { return; }
        $request = Yii::$app->request;
        RequestBoundary::prepare($request);
        [$route] = $request->resolve();
        // Avoid reading/decoding arbitrary raw bodies. Native forms are already parsed by PHP.
        $body = $request->getMethod() === 'POST' && str_starts_with((string)$request->headers->get('Content-Type'), 'application/x-www-form-urlencoded') ? $request->bodyParams : [];
        $guard->request($route, $request->queryParams, $body, self::viewer());
    }
    public static function beforeAction($event): void
    {
        if (!Yii::$app instanceof \yii\web\Application || ($guard = self::guard()) === null) { return; }
        $controller = $event->action->controller;
        $route = $controller->getUniqueId() . '/' . $event->action->id;
        $request = Yii::$app->request;
        $body = $request->getMethod() === 'POST' && str_starts_with((string)$request->headers->get('Content-Type'), 'application/x-www-form-urlencoded') ? $request->bodyParams : [];
        // Controller class closes route aliases supplied by other modules.
        if (str_starts_with(get_class($controller), 'humhub\\modules\\mail\\controllers\\rest\\') && $guard->hasAny()) { throw new \yii\web\NotFoundHttpException('Native REST chat is unavailable during isolated read integration.'); }
        if (str_starts_with(get_class($controller), 'humhub\\modules\\file\\controllers\\')) { $guard->request('file/file/' . $event->action->id, $request->queryParams, $body, self::viewer()); }
        $guard->request($route, $request->queryParams, $body, self::viewer());
    }
    public static function beforeNativeWrite($event): void { self::guard()?->nativeWrite($event->sender); }
    public static function beforeIdentityChange($event): void
    {
        $user = $event->sender;
        if ($event->name === \yii\db\BaseActiveRecord::EVENT_BEFORE_DELETE || $user->isAttributeChanged('status')) {
            self::guard()?->invalidateIdentity(SafeInteger::native($user->id, 'viewer_id'));
        }
    }
    public static function beforeInboxWidget($event): void
    {
        $guard = self::guard();
        if ($guard !== null && $guard->viewerManaged(self::viewer())) { $event->isValid = false; }
    }
}
