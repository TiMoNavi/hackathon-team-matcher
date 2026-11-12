<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\http;

/** Host installs after ModuleAutoLoader and before LanguageSelector. No global parser changes. */
final class ChatRequestBootstrap implements \yii\base\BootstrapInterface
{
    public function bootstrap($app)
    {
        if ($app instanceof \yii\web\Application && $app->hasModule('matcher-chat') && $app->getModule('matcher-chat')->isEnabled) { RequestBoundary::prepare($app->request); }
    }
}
