<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\controllers;

use humhub\modules\matcherProfile\domain\ProfileException;
use Yii;
use yii\web\UploadedFile;

/** Keeps the native upload widget while committing its explicit selection through identity CAS. */
final class NativeImageController extends \humhub\modules\user\controllers\ImageController
{
    public function runAction($id, $params = [])
    {
        try { return parent::runAction($id, $params); }
        catch (ProfileException $error) { throw new \yii\web\HttpException($error->httpStatus, $error->getMessage()); }
    }

    protected function handleImageUpload($uploadName, $type = self::TYPE_PROFILE_IMAGE)
    {
        if ($type === self::TYPE_PROFILE_BANNER_IMAGE) { return parent::handleImageUpload($uploadName, $type); }
        $this->forcePostRequest();
        try {
            $actor = (int)Yii::$app->user->id;
            if ($actor !== (int)$this->contentContainer->id) { throw new ProfileException('OWNER_CONFIRMATION_REQUIRED', 'The profile owner must choose and confirm their avatar.', 403); }
            $value = Yii::$app->request->get('expected_version', Yii::$app->request->post('expected_version'));
            if (!is_scalar($value) || !preg_match('/^(0|[1-9][0-9]{0,9})$/D', (string)$value)) { throw new ProfileException('INVALID_VERSION', 'Reload the profile page before choosing an avatar.'); }
            $files = UploadedFile::getInstancesByName($uploadName); $file = $files[0] ?? null;
            if (!$file || $file->error !== UPLOAD_ERR_OK || !is_uploaded_file($file->tempName)) { throw new ProfileException('INVALID_UPLOAD', 'Choose a valid image.'); }
            $module = Yii::$app->getModule('matcher-user-profile');
            $candidate = $module->getIdentityService()->upload($actor, 'avatar', $file->tempName);
            $identity = $module->getIdentityService()->update($actor, (int)$value, ['avatar_ref' => $candidate['file_ref']]);
            return $this->asJson(['files' => [['url' => $module->mediaUrl($identity['avatar_ref']), 'type' => $type, 'container_id' => $this->contentContainer->contentcontainer_id, 'space_id' => $actor, 'identity_version' => $identity['identity_version']]]]);
        } catch (ProfileException $error) {
            Yii::$app->response->statusCode = $error->httpStatus;
            return $this->asJson(['files' => [['error' => true, 'errors' => [$error->getMessage()]]]]);
        }
    }

    public function handleCrop($type = self::TYPE_PROFILE_IMAGE)
    {
        if ($type === self::TYPE_PROFILE_BANNER_IMAGE) { return parent::handleCrop($type); }
        $actor = $this->owner(); $module = Yii::$app->getModule('matcher-user-profile');
        $identity = $module->getIdentityService()->getIdentity($actor);
        $model = new \humhub\models\forms\CropProfileImage();
        if (Yii::$app->request->isPost) {
            if (!$model->load(Yii::$app->request->post()) || !$model->validate()) { throw new \yii\web\BadRequestHttpException('Invalid crop area.'); }
            if ($identity['identity_version'] !== $this->expectedVersion()) { throw new \yii\web\ConflictHttpException('Avatar changed; reload before cropping.'); }
            if (!$identity['avatar_ref']) { throw new \yii\web\ConflictHttpException('Upload an avatar before cropping.'); }
            $media = $module->getIdentityService()->readMedia($actor, $identity['avatar_ref']);
            $image = imagecreatefrompng($media['path']);
            if ($model->cropX < 0 || $model->cropY < 0 || $model->cropW < 1 || $model->cropH < 1 || $model->cropX + $model->cropW > imagesx($image) || $model->cropY + $model->cropH > imagesy($image)) { throw new \yii\web\BadRequestHttpException('Crop area exceeds the image.'); }
            $cropped = imagecrop($image, ['x' => $model->cropX, 'y' => $model->cropY, 'width' => $model->cropW, 'height' => $model->cropH]);
            $path = tempnam(Yii::getAlias('@runtime'), 'matcher-crop-');
            try {
                if (!$cropped || !imagepng($cropped, $path)) { throw new \yii\web\ServerErrorHttpException('Unable to create the crop.'); }
                $candidate = $module->getIdentityService()->upload($actor, 'avatar', $path);
                $module->getIdentityService()->update($actor, $identity['identity_version'], ['avatar_ref' => $candidate['file_ref']]);
            } finally { @unlink($path); }
            $this->view->saved(); return $this->htmlRedirect($this->contentContainer->getUrl());
        }
        return $this->renderAjax('@matcherProfile/views/native-image/crop', ['model' => $model, 'assetImage' => $this->contentContainer->image]);
    }

    public function actionDelete($type)
    {
        if ($type === self::TYPE_PROFILE_BANNER_IMAGE) { return parent::actionDelete($type); }
        $this->forcePostRequest(); $actor = $this->owner();
        $module = Yii::$app->getModule('matcher-user-profile');
        $identity = $module->getIdentityService()->update($actor, $this->expectedVersion(), ['avatar_ref' => null]);
        $fresh = \humhub\modules\user\models\User::findOne($actor);
        return $this->asJson(['type' => $type, 'defaultUrl' => $fresh->image->getUrl(), 'space_id' => $actor, 'identity_version' => $identity['identity_version']]);
    }

    private function owner(): int
    {
        $actor = (int)Yii::$app->user->id;
        if ($actor !== (int)$this->contentContainer->id) { throw new \yii\web\ForbiddenHttpException('The profile owner must confirm avatar changes.'); }
        return $actor;
    }

    private function expectedVersion(): int
    {
        $value = Yii::$app->request->get('expected_version', Yii::$app->request->post('expected_version'));
        if (!is_scalar($value) || !preg_match('/^(0|[1-9][0-9]{0,9})$/D', (string)$value)) { throw new \yii\web\BadRequestHttpException('Reload the profile page before editing the avatar.'); }
        return (int)$value;
    }
}
