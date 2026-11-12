<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\controllers;

use Yii;

final class GithubAuthAction extends \humhub\modules\user\authclient\AuthAction
{
    public function run()
    {
        try { return parent::run(); }
        catch (\Throwable $error) {
            if (Yii::$app->request->get('authclient') === 'github' && $this->controller instanceof NativeAuthController) {
                return $this->controller->authFailure('failed');
            }
            throw $error;
        }
    }
}
