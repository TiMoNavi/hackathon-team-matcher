<?php
namespace humhub\modules\comparisonReact\controllers;

use humhub\components\Controller;
use humhub\components\access\ControllerAccess;
use Yii;
use yii\filters\VerbFilter;
use yii\helpers\Html;
use yii\helpers\Json;
use yii\web\Response;
use yii\web\ServiceUnavailableHttpException;

/** Public, GET-only design proof. No real user/Space data or mutation endpoints. */
final class HomeController extends Controller
{
    public $layout = false;
    protected $access = ControllerAccess::class;

    public function behaviors()
    {
        return array_merge(parent::behaviors(), [
            'verbs' => ['class' => VerbFilter::class, 'actions' => ['index' => ['GET']]],
        ]);
    }

    public function actionIndex(): string
    {
        $source = dirname(__DIR__) . '/resources/app';
        $manifestFile = $source . '/.vite/manifest.json';
        if (!is_file($manifestFile)) {
            throw new ServiceUnavailableHttpException('Build the isolated React frontend first.');
        }
        $manifest = Json::decode(file_get_contents($manifestFile));
        $entry = $manifest['index.html'] ?? null;
        if (!$entry) {
            throw new ServiceUnavailableHttpException('Missing React build entry.');
        }
        [, $url] = Yii::$app->assetManager->publish($source);
        $css = '';
        foreach ($entry['css'] ?? [] as $file) {
            $css .= '<link rel="stylesheet" href="' . Html::encode($url . '/' . $file) . '">';
        }
        $script = Html::encode($url . '/' . $entry['file']);
        $csrfParam = Html::encode(Yii::$app->request->csrfParam);
        $csrfToken = Html::encode(Yii::$app->request->getCsrfToken());
        $response = Yii::$app->response;
        $response->format = Response::FORMAT_HTML;
        $response->headers->set('Cache-Control', 'no-store');
        $response->headers->set('X-Frontend-Proof', 'humhub-module-react-independent');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        // Deliberately do not call render(), beginPage(), head(), beginBody() or AppAsset.
        // This avoids theme/PJAX auto-injection while retaining Controller ACL, gates and CSRF defaults.
        return '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8">'
            . '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
            . '<meta name="csrf-param" content="' . $csrfParam . '">'
            . '<meta name="csrf-token" content="' . $csrfToken . '">'
            . '<meta name="theme-color" content="#245c4b">'
            . '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2218%22 fill=%22%232b6c53%22/%3E%3Cpath d=%22M20 40c0-20 24-20 24 0M32 20v27M20 40h24%22 fill=%22none%22 stroke=%22white%22 stroke-width=%224%22 stroke-linecap=%22round%22/%3E%3C/svg%3E">'
            . '<title>同频 CoLab · 独立 React 前端插件</title>' . $css
            . '</head><body><div id="colab-root"></div><script type="module" src="' . $script . '"></script></body></html>';
    }
}
