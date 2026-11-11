<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\ports;

use humhub\modules\matcherProfile\domain\ProfileScope;

/** Optional independent privacy capability. Context is transport-neutral and revalidated on each read. */
interface ProfileReadPolicy
{
    public function assertCanRead(int $viewerId, int $ownerId, ProfileScope $scope, array $context): void;
    public function projectProfile(int $viewerId, int $ownerId, ProfileScope $scope, array $profile, array $context): array;
    public function assertCanReadMedia(int $viewerId, int $ownerId, string $kind, string $ref, array $context): void;
}
