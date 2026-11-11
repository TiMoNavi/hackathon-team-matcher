<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\native;
use Yii;
use yii\web\HttpException;
use humhub\modules\matcherProfile\domain\ProfileException;

class AdminUserController extends \humhub\modules\admin\controllers\UserController
{
    private ?NativeEditBridge $profileBridge = null;
    public function actionEdit()
    {
        $this->profileBridge = new NativeEditBridge((int)Yii::$app->request->get('id'), true);
        try { return $this->profileBridge->run(fn() => parent::actionEdit()); }
        catch (ProfileException $error) { throw new HttpException($error->httpStatus, $error->getMessage()); }
    }
    public function render($view, $params = [])
    {
        if (isset($params['hForm']) && $this->profileBridge !== null) { $params['hForm'] = new VersionedHForm($params['hForm'], $this->profileBridge->tokens()); }
        return parent::render($view, $params);
    }
}
