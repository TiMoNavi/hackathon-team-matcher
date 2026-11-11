<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\memory;

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ports\ProfileAccessPolicy;

final class InMemoryProfileAccessPolicy implements ProfileAccessPolicy
{
    public bool $maintenance = false;
    /** Explicit active users, administrator IDs, and formal member IDs by native Space ID. */
    public array $users = [];
    public array $administrators = [];
    public array $memberships = [];

    public function assertOwner(int $actorId, int $ownerId, ProfileScope $scope): void
    {
        $this->active($actorId, $ownerId);
        if ($actorId !== $ownerId) { $this->deny(); }
        if ($scope->spaceId !== null) { $this->member($ownerId, $scope->spaceId); }
    }

    public function assertCanRead(int $actorId, int $ownerId, ProfileScope $scope, ?int $currentSpaceId): void
    {
        $this->active($actorId, $ownerId);
        if ($actorId === $ownerId) { $this->assertOwner($actorId, $ownerId, $scope); return; }
        if ($currentSpaceId === null || $currentSpaceId < 1 || ($scope->spaceId !== null && $scope->spaceId !== $currentSpaceId)) { $this->deny(); }
        $this->member($actorId, $currentSpaceId);
        $this->member($ownerId, $currentSpaceId);
    }

    public function assertAdministrator(int $actorId, int $ownerId, ProfileScope $scope): void
    {
        $this->active($actorId, $ownerId);
        if (!in_array($actorId, $this->administrators, true)) { $this->deny(); }
        if ($scope->spaceId !== null) { $this->member($ownerId, $scope->spaceId); }
    }

    public function assertWritable(): void
    {
        if ($this->maintenance) { throw new ProfileException('PROFILE_MAINTENANCE', 'Profile writes are temporarily unavailable.', 503); }
    }

    private function active(int $actorId, int $ownerId): void
    {
        if ($actorId < 1) { throw new ProfileException('AUTHENTICATION_REQUIRED', 'Sign in to continue.', 401); }
        if (!in_array($actorId, $this->users, true) || !in_array($ownerId, $this->users, true)) { $this->deny(); }
    }
    private function member(int $userId, int $spaceId): void { if (!in_array($userId, $this->memberships[$spaceId] ?? [], true)) { $this->deny(); } }
    private function deny(): never { throw new ProfileException('PROFILE_ACCESS_DENIED', 'The profile is not accessible in this context.', 403); }
}
