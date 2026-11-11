<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboarding\adapters\ui;

use humhub\modules\ui\menu\MenuLink;
use Yii;
use yii\base\Event;

final class FlowNavigation
{
    public static function accountMenu(Event $event): void
    {
        if (Yii::$app->user->isGuest) { return; }
        $event->sender->addEntry(new MenuLink([
            'label' => '画像填写引导',
            'url' => ['/matcher-onboarding/flow/index'],
            'sortOrder' => 111,
            'isActive' => Yii::$app->controller?->module->id === 'matcher-onboarding',
        ]));
    }
}
