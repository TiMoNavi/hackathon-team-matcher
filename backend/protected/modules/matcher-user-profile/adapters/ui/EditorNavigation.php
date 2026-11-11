<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\ui;

use humhub\helpers\Html;
use humhub\modules\ui\menu\MenuLink;
use Yii;
use yii\base\Event;

/** Adds the ordinary profile editor to native account navigation and the owner's profile. */
final class EditorNavigation
{
    public static function accountMenu(Event $event): void
    {
        if (Yii::$app->user->isGuest) { return; }
        $event->sender->addEntry(new MenuLink([
            'label' => '团队协作资料',
            'url' => ['/matcher-user-profile/editor/index'],
            'sortOrder' => 110,
            'isActive' => Yii::$app->controller?->module->id === 'matcher-user-profile' && Yii::$app->controller?->id === 'editor',
        ]));
    }

    public static function profileButton(Event $event): void
    {
        if (Yii::$app->user->isGuest || !$event->sender->user?->isCurrentUser()) { return; }
        $event->result .= ' ' . Html::a('团队协作资料', ['/matcher-user-profile/editor/index'], ['class' => 'btn btn-default matcher-profile-edit']);
    }
}
