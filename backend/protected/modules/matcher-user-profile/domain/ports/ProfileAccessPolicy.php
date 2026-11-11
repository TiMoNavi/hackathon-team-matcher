<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\ports;

use humhub\modules\matcherProfile\domain\ProfileScope;

interface ProfileAccessPolicy
{
    /** Verifies active actor/owner and formal owner membership for Space scope. */
    public function assertOwner(int $actorId, int $ownerId, ProfileScope $scope): void;
    /** For other users, requires both memberships in server-validated currentSpaceId. */
    public function assertCanRead(int $actorId, int $ownerId, ProfileScope $scope, ?int $currentSpaceId): void;
    /** Verifies active administrator and formal owner membership for Space scope. */
    public function assertAdministrator(int $actorId, int $ownerId, ProfileScope $scope): void;
    public function assertWritable(): void;
}
