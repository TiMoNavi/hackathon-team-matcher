<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\native;
use Yii;
use yii\helpers\Html;
use yii\web\HttpException;
use humhub\modules\matcherProfile\domain\ProfileException;

class AccountController extends \humhub\modules\user\controllers\AccountController
{
    private ?NativeEditBridge $profileBridge = null;
    public function actionEdit() { return $this->versioned(fn() => parent::actionEdit()); }
    public function actionEditSettings() { return $this->versioned(fn() => parent::actionEditSettings()); }
    private function versioned(callable $action): mixed
    {
        $this->profileBridge = new NativeEditBridge((int)Yii::$app->user->id);
        try { return $this->profileBridge->run($action); }
        catch (ProfileException $error) { throw new HttpException($error->httpStatus, $error->getMessage()); }
    }
    public function render($view, $params = [])
    {
        $tokens = $this->profileBridge?->tokens() ?? [];
        if (isset($params['hForm'])) { $params['hForm'] = new VersionedHForm($params['hForm'], $tokens); }
        $html = parent::render($view, $params);
        if ($view === 'editSettings') {
            $hidden = ''; foreach ($tokens as $name => $value) { $hidden .= Html::hiddenInput($name, $value); }
            $html = preg_replace_callback('/(<form\b[^>]*\bid="basic-settings-form"[^>]*>)/i', static fn(array $match): string => $match[1] . $hidden, $html, 1);
        }
        return $html;
    }
}
