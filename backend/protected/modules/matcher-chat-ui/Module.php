<?php
declare(strict_types=1);
namespace humhub\modules\matcherChatUi;

use humhub\modules\matcherChatUi\application\ShellPolicy;

/** Optional presentation only. This module owns no conversation or membership records. */
final class Module extends \humhub\components\Module
{
    public bool $uiEnabled = true;
    public bool $readUiEnabled = false;

    public function isUiEnabled(): bool
    {
        return ShellPolicy::enabled($this->uiEnabled, $this->settings->get('uiEnabled'));
    }

    public function isReadUiEnabled(): bool
    {
        if (!$this->readUiEnabled || !$this->isUiEnabled()
            || !in_array($this->settings->get('readUiEnabled'), [true, 1, '1', 'true'], true)) { return false; }
        $chat = \Yii::$app->getModule('matcher-chat');
        return $chat !== null && $chat->isEnabled && method_exists($chat, 'isReadingEnabled') && $chat->isReadingEnabled();
    }
}
