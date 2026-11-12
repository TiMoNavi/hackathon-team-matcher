<?php
declare(strict_types=1);
namespace humhub\modules\matcherChatUi\controllers;

use humhub\components\access\ControllerAccess;
use humhub\modules\matcherChatUi\Module;
use humhub\modules\matcherChatUi\adapters\assets\Manifest;
use humhub\modules\matcherChatUi\adapters\ui\EntryBridge;
use humhub\modules\matcherChatUi\application\Bootstrap;
use humhub\modules\matcherChatUi\application\ReadBootstrap;
use humhub\modules\matcherChatUi\application\ShellPolicy;
use Yii;
use yii\helpers\Url;
use yii\web\MethodNotAllowedHttpException;
use yii\web\NotFoundHttpException;

final class AppController extends \humhub\components\Controller
{
    public $access = ControllerAccess::class;
    private mixed $requestedPath = '';

    /** Guests receive the static shell; the gated read host binds the native session. */
    protected function getAccessRules() { return []; }

    public function runAction($id, $params = [])
    {
        if ($id === '' || $id === 'index') {
            // Yii binds action parameters after beforeAction; capture the route value first.
            $this->requestedPath = array_key_exists('path', $params) ? $params['path'] : '';
            $this->assertRequest($this->requestedPath);
        }
        return parent::runAction($id, $params);
    }

    public function beforeAction($action)
    {
        // The read-only method guard precedes Yii's normal CSRF check without disabling it.
        $this->assertRequest($this->requestedPath);
        return parent::beforeAction($action);
    }

    public function actionIndex(mixed $path = '')
    {
        $this->assertRequest($path);
        $request = Yii::$app->request;
        if ($request->pathInfo === 'matcher-chat-ui/app/index'
            || $request->getQueryParam('r') === 'matcher-chat-ui/app/index') {
            $baseUrl = $request->baseUrl;
            if (!is_string($baseUrl) || ($baseUrl !== '' && !ShellPolicy::allowsAssetBase($baseUrl))) {
                throw new NotFoundHttpException('Page not found.');
            }
            // Keep one browser URL shape; do not forward returnUrl or any other query input.
            $target = $baseUrl . '/matcher/chat' . ($path === '' ? '' : '/' . $path);
            Yii::$app->response->headers->set('Location', $target);
            Yii::$app->response->statusCode = 302;
            return Yii::$app->response;
        }
        $shellBootstrap = Bootstrap::data($request->getCsrfToken(), Url::to(['/dashboard/dashboard']), Url::to(['/user/auth/login']));
        $entryStatus = EntryBridge::status();
        if (in_array($entryStatus['state'] ?? '', ['paused', 'unsupported_coverage'], true)) {
            Yii::$app->response->statusCode = 503;
            return $this->renderPartial('unavailable', ['bootstrap' => $shellBootstrap, 'entryState' => $entryStatus['state']]);
        }
        try {
            $actorId = EntryBridge::actorId();
            $reading = $this->module instanceof Module && $actorId !== null && $this->module->isReadUiEnabled();
        } catch (\Throwable $error) {
            Yii::$app->response->statusCode = 503;
            return $this->renderPartial('unavailable', ['bootstrap' => $shellBootstrap, 'entryState' => 'paused']);
        }
        $bootstrap = $reading
            ? ReadBootstrap::data($request->getCsrfToken(), Url::to(['/dashboard/dashboard']), Url::to(['/user/auth/login']), $actorId)
            : $shellBootstrap;
        try {
            $release = $this->module->getBasePath() . ($reading ? '/resources/read-app' : '/resources/app');
            $manifest = new Manifest($release);
            $assets = $manifest->load();
            $manager = Yii::$app->assetManager;
            if ($manager->linkAssets) { throw new \RuntimeException('Copied asset publication is required.'); }
            [, $baseUrl] = $manager->publish($release, ['beforeCopy' => $manifest->publishFilter($assets['files'])]);
            if (!is_string($baseUrl) || !ShellPolicy::allowsAssetBase($baseUrl)) {
                throw new \RuntimeException('Same-origin assets are required.');
            }
        } catch (\Throwable $e) {
            // Do not disclose filesystem paths or unexpected configuration through the page/log.
            Yii::warning('Chat shell asset publication unavailable.', 'matcher-chat-ui');
            Yii::$app->response->statusCode = 503;
            return $this->renderPartial('unavailable', ['bootstrap' => $bootstrap]);
        }
        return $this->renderPartial('index', ['bootstrap' => $bootstrap, 'assets' => $assets, 'assetBase' => $baseUrl]);
    }

    private function assertRequest(mixed $path): void
    {
        Yii::$app->response->headers->set('Cache-Control', 'private, no-store');
        Yii::$app->response->headers->set('X-Content-Type-Options', 'nosniff');
        $enabled = $this->module instanceof Module && $this->module->isUiEnabled();
        $status = ShellPolicy::rejectionStatus($enabled, $path, Yii::$app->request->method);
        if ($status === 404) { throw new NotFoundHttpException('Page not found.'); }
        if ($status === 405) {
            Yii::$app->response->headers->set('Allow', 'GET');
            throw new MethodNotAllowedHttpException('Use GET.');
        }
    }
}
