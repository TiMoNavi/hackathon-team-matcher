<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\adapters\http;

use humhub\modules\matcherAuth\Module;
use yii\base\BootstrapInterface;

/** Configure after ModuleAutoLoader and before HumHub LanguageSelector in host bootstrap. */
final class AuthRequestBootstrap implements BootstrapInterface
{
    public function bootstrap($app)
    {
        if (!$app instanceof \yii\web\Application || !$app->hasModule('matcher-auth')) { return; }
        $module = $app->getModule('matcher-auth');
        if (!$module instanceof Module || !$module->isEnabled) { return; }
        RequestBoundary::prepare($app->request);
    }
}
