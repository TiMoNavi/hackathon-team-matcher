<?php
declare(strict_types=1);

namespace humhub\modules\matcherProfile\domain\ports;

interface ConfirmedIdentityReader
{
    /** @return array{nickname:?string,identity_version:int,confirmed:bool} */
    public function read(int $ownerId): array;
}
