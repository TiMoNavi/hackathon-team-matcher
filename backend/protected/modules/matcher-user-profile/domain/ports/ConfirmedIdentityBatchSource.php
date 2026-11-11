<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\ports;

/** Internal identity projection; the caller owns the legal-entry authorization. */
interface ConfirmedIdentityBatchSource
{
    public function read(array $ownerIds): array;
}
