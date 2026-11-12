<?php
declare(strict_types=1);
namespace humhub\modules\matcherChatUi\adapters\ui;

use humhub\modules\matcherChatUi\Module;
use humhub\modules\ui\menu\MenuLink;
use Yii;
use yii\base\Event;

final class Navigation
{
    public static function accountMenu(Event $event): void
    {
        $module = Yii::$app->getModule('matcher-chat-ui');
        if (!$module instanceof Module || !$module->isUiEnabled() || Yii::$app->user->isGuest) { return; }
        $event->sender->addEntry(new MenuLink([
            'label' => '聊天（接入中）',
            'url' => ['/matcher-chat-ui/app/index'],
            'sortOrder' => 110,
            'isActive' => Yii::$app->controller?->module->id === 'matcher-chat-ui',
        ]));
    }
}
