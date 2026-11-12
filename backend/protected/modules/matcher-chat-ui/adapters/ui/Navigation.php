<?php
declare(strict_types=1);
namespace humhub\modules\matcherChatUi\adapters\ui;

use humhub\modules\matcherChatUi\Module;
use humhub\modules\ui\menu\MenuLink;
use Yii;
use yii\base\Event;
use yii\helpers\Url;

final class Navigation
{
    public static function accountMenu(Event $event): void
    {
        $module = Yii::$app->getModule('matcher-chat-ui');
        if (!$module instanceof Module || !$module->isUiEnabled() || Yii::$app->user->isGuest) { return; }
        $status = EntryBridge::status();
        $event->sender->addEntry(new MenuLink([
            'label' => self::label($status),
            'url' => ['/matcher-chat-ui/app/index'],
            'sortOrder' => 110,
            'isActive' => Yii::$app->controller?->module->id === 'matcher-chat-ui',
        ]));
    }

    /** mail adds entries at INIT; RUN edits only its exact inbox URL. */
    public static function topMenu(Event $event): void
    {
        $status = EntryBridge::status();
        if ($status === null || !($status['enabled'] ?? false) || ($status['state'] ?? '') === 'native') { return; }
        $ui = Yii::$app->getModule('matcher-chat-ui');
        foreach ($event->sender->getEntries() as $entry) {
            if (!$entry instanceof MenuLink || $entry->getUrl() !== Url::to(['/mail/mail/index'])) { continue; }
            if (!$ui instanceof Module || !$ui->isUiEnabled()) { $event->sender->removeEntry($entry); continue; }
            $entry->setUrl(['/matcher-chat-ui/app/index']);
            $entry->setLabel(self::label($status));
        }
    }

    public static function notificationArea(Event $event): void
    {
        $status = EntryBridge::status();
        if ($status !== null && ($status['enabled'] ?? false) && ($status['state'] ?? '') !== 'native') {
            $event->sender->removeWidget('humhub\modules\mail\widgets\NotificationInbox');
        }
    }

    private static function label(?array $status): string
    {
        return match ($status['state'] ?? '') {
            'takeover' => '聊天',
            'paused', 'unsupported_coverage' => '聊天（暂不可用）',
            default => '聊天（接入中）',
        };
    }
}
