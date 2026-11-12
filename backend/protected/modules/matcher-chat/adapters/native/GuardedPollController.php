<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\native;

use humhub\modules\live\components\LiveEvent;
use humhub\modules\matcherChat\Module;
use Yii;

/** Preserve native non-chat polling; mail visibility is checked before serialization. */
final class GuardedPollController extends \humhub\modules\live\controllers\PollController
{
    protected function checkVisibility(LiveEvent $liveEvent)
    {
        if (!parent::checkVisibility($liveEvent)) { return false; }
        if (!NativeLiveFilter::isMail($liveEvent)) { return true; }
        try {
            $chat = Yii::$app->getModule('matcher-chat');
            if (!$chat instanceof Module || !$chat->isEnabled) { return false; }
            if (!$chat->schemaReady()) { return false; }
            $viewer = Yii::$app->user->isGuest ? null : (int)Yii::$app->user->id;
            return NativeLiveFilter::visible($liveEvent, $viewer, new NativeGuard($chat->sql()));
        } catch (\Throwable) {
            // A chat storage outage must not discard non-chat events in the same poll.
            return false;
        }
    }
}
