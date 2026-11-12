<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebapp;

use humhub\modules\matcherWebapp\application\ShellPolicy;

/** A page/asset host only: no copied identities, profiles or current-event state. */
final class Module extends \humhub\components\Module
{
    public bool $uiEnabled = true;

    public function isUiEnabled(): bool
    {
        return ShellPolicy::enabled($this->uiEnabled, $this->settings->get('uiEnabled'));
    }
}
