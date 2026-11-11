<?php
namespace humhub\modules\comparisonNative\controllers;

use humhub\components\Controller;
use humhub\components\access\ControllerAccess;
use yii\web\MethodNotAllowedHttpException;
use Yii;

/** Public synthetic prototype only. Core gate and CSRF behavior are unchanged. */
class HomeController extends Controller
{
    protected $access = ControllerAccess::class;
    public $layout = '@comparisonNative/views/layouts/main';

    public function actionIndex()
    {
        if (!Yii::$app->request->isGet) {
            throw new MethodNotAllowedHttpException('This prototype is read-only.');
        }
        Yii::$app->response->headers->set('Cache-Control', 'no-store');
        $this->pageTitle = '同频 CoLab · 原生主题验证';
        $file = Yii::getAlias('@comparisonNative/resources/data/demo-data.json');
        $demo = json_decode(file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
        return $this->render('index', ['demo' => $demo]);
    }
}
