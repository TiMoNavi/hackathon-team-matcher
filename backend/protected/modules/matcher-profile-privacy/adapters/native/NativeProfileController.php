<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;

use Yii;

final class NativeProfileController extends \humhub\modules\user\controllers\ProfileController
{
    public function actionAbout()
    {
        Yii::$app->response->headers->set('Cache-Control', 'private, no-store');
        return $this->renderContent(NativeProfilePresenter::about((int)$this->contentContainer->id));
    }
}
