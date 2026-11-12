<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\http;

use humhub\modules\matcherChat\domain\SafeInteger;

/** Optional UI answers readiness only; it cannot set a URL or grant authority. */
final class EntryTakeoverEvent extends \yii\base\Event
{
    public bool $uiReady = false;

    public function __construct(public readonly int $viewerId, array $config = [])
    {
        SafeInteger::positive($viewerId, 'viewer_id');
        parent::__construct($config);
    }
}
