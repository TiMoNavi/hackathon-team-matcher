<?php
declare(strict_types=1);
namespace humhub\modules\matcherChatUi\adapters\ui;

use humhub\modules\matcherChatUi\Module;
use humhub\modules\matcherChatUi\adapters\assets\Manifest;
use Yii;
use yii\base\Event;

/** Optional presentation bridge; backend owns coverage, authorization and navigation targets. */
final class EntryBridge
{
    public static function actorId(): ?int
    {
        try {
            $user = Yii::$app->user;
            if ($user->isGuest || !$user->impersonation->canAccessPrivateContent()) { return null; }
            $id = $user->id;
            if ((!is_int($id) && (!is_string($id) || !preg_match('/^[1-9][0-9]{0,15}$/D', $id)))
                || $id < 1 || $id > 9007199254740991) { return null; }
            return (int)$id;
        } catch (\Throwable $error) { return null; }
    }

    public static function ready(): bool
    {
        try {
            $ui = Yii::$app->getModule('matcher-chat-ui');
            if (!$ui instanceof Module || !$ui->isEnabled || ! $ui->isReadUiEnabled()
                || self::actorId() === null || Yii::$app->assetManager->linkAssets) { return false; }
            (new Manifest($ui->getBasePath() . '/resources/read-app'))->load();
            return true;
        } catch (\Throwable $error) { return false; }
    }

    public static function readiness(Event $event): void
    {
        // Class-name event registration keeps the guest shell independent of matcher-chat.
        if (!property_exists($event, 'viewerId') || !property_exists($event, 'uiReady')) { return; }
        $event->uiReady = is_int($event->viewerId) && $event->viewerId === self::actorId() && self::ready();
    }

    /** Internal UI status, never a client capability or an authorization substitute. */
    public static function status(): ?array
    {
        try {
            $actor = self::actorId();
            if ($actor === null) { return null; }
            $chat = Yii::$app->getModule('matcher-chat');
            if ($chat === null || !$chat->isEnabled || !method_exists($chat, 'isEntryTakeoverEnabled')
                || !$chat->isEntryTakeoverEnabled()) { return null; }
            return $chat->entryStatus($actor, self::ready());
        } catch (\Throwable $error) {
            // Only this UI becomes unavailable; a menu projection must not break dashboard.
            return ['enabled' => true, 'state' => 'paused'];
        }
    }
}
