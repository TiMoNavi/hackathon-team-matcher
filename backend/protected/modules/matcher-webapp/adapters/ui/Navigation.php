<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebapp\adapters\ui;

use humhub\modules\matcherWebapp\Module;
use humhub\modules\ui\menu\MenuLink;
use Yii;
use yii\base\Event;

final class Navigation
{
    public static function accountMenu(Event $event): void
    {
        $module = Yii::$app->getModule('matcher-webapp');
        if (!$module instanceof Module || !$module->isUiEnabled() || Yii::$app->user->isGuest) { return; }
        $event->sender->addEntry(new MenuLink([
            'label' => '寻找活动队友', 'url' => ['/matcher-webapp/app/index'], 'sortOrder' => 109,
            'isActive' => Yii::$app->controller?->module->id === 'matcher-webapp',
        ]));
    }
}
