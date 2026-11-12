<?php
declare(strict_types=1);
namespace humhub\modules\matcherEventAccess\adapters\http;
use humhub\modules\matcherEventAccess\Module;
final class EventAccessRequestBootstrap implements \yii\base\BootstrapInterface
{
    public function bootstrap($app)
    { if(!$app instanceof \yii\web\Application||!$app->hasModule('matcher-event-access'))return;$module=$app->getModule('matcher-event-access');if($module instanceof Module&&$module->isEnabled)RequestBoundary::prepare($app->request); }
}
