<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\ports;

interface ProfileResourcePolicy
{
    /** Throws when the ready, bounded image resource is not owned by ownerId. */
    public function assertContactQrOwned(int $ownerId, string $fileRef): void;
}
