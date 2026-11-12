<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebapp\controllers;

use humhub\components\access\ControllerAccess;
use humhub\modules\matcherWebapp\Module;
use humhub\modules\matcherWebapp\adapters\assets\Manifest;
use humhub\modules\matcherWebapp\application\Bootstrap;
use humhub\modules\matcherWebapp\application\ShellPolicy;
use Yii;
use yii\helpers\Url;
use yii\web\MethodNotAllowedHttpException;
use yii\web\NotFoundHttpException;

final class AppController extends \humhub\components\Controller
{
    public $access = ControllerAccess::class;

    /** The public shell reads no actor data; each API enforces its normal authorization. */
    protected function getAccessRules() { return []; }

    public function actionIndex(string $path = '')
    {
        if (!$this->module instanceof Module || !$this->module->isUiEnabled() || !ShellPolicy::allowsPath($path)) {
            throw new NotFoundHttpException('Page not found.');
        }
        if (!Yii::$app->request->isGet) { throw new MethodNotAllowedHttpException('Use GET.'); }
        Yii::$app->response->headers->set('Cache-Control', 'private, no-store');
        Yii::$app->response->headers->set('X-Content-Type-Options', 'nosniff');
        $bootstrap = Bootstrap::data(Yii::$app->request->getCsrfToken(), Url::to(['/dashboard/dashboard']), Url::to(['/user/auth/login']));
        $release = $this->module->getBasePath() . '/resources/app';
        try {
            $manifest = new Manifest($release);
            $assets = $manifest->load();
            $manager = Yii::$app->assetManager;
            // A directory symlink would bypass beforeCopy and expose unapproved files.
            if ($manager->linkAssets) { throw new \RuntimeException('Application assets require copied publication.'); }
            [, $baseUrl] = $manager->publish($release, ['beforeCopy' => $manifest->publishFilter($assets['files'])]);
            if (!ShellPolicy::allowsAssetBase($baseUrl)) { throw new \RuntimeException('Application assets require a same-origin publication URL.'); }
        } catch (\RuntimeException $e) {
            Yii::$app->response->statusCode = 503;
            return $this->renderPartial('unavailable', ['bootstrap' => $bootstrap]);
        }
        return $this->renderPartial('index', ['bootstrap' => $bootstrap, 'assets' => $assets, 'assetBase' => $baseUrl]);
    }
}
