<?php
declare(strict_types=1);
namespace humhub\modules\matcherChatUi;

use humhub\modules\matcherChatUi\application\ShellPolicy;

/** Optional presentation only. This module owns no conversation or membership records. */
final class Module extends \humhub\components\Module
{
    public bool $uiEnabled = true;

    public function isUiEnabled(): bool
    {
        return ShellPolicy::enabled($this->uiEnabled, $this->settings->get('uiEnabled'));
    }
}
