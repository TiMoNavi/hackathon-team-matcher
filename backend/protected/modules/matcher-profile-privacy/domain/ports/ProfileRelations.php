<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\domain\ports;

/** Live relationship facts; SQL/native adapters must not trust caller-supplied authorization flags. */
interface ProfileRelations
{
    public function assertActive(int $userId): void;
    public function isBlocked(int $viewerId, int $ownerId): bool;
    public function areFriends(int $viewerId, int $ownerId): bool;
    public function isSpaceMember(int $userId, int $spaceId): bool;
    /** Validates the exact post author, current content visibility and viewer access. */
    public function canAccessPostAuthor(int $viewerId, int $ownerId, int $postId): bool;
}
