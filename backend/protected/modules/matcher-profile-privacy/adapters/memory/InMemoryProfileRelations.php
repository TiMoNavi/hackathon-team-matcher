<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\memory;

use humhub\modules\matcherPrivacy\domain\ports\ProfileRelations;
use humhub\modules\matcherProfile\domain\ProfileException;

final class InMemoryProfileRelations implements ProfileRelations
{
    public array $activeUsers = [];
    public array $friendships = [];
    public array $memberships = [];
    public array $blockedPairs = [];
    /** postId => ['owner_id' => int, 'viewers' => list<int>, 'visible' => bool] */
    public array $posts = [];
    public function assertActive(int $userId): void
    {
        if ($userId < 1 || !in_array($userId, $this->activeUsers, true)) { throw new ProfileException('PROFILE_ACCESS_DENIED', 'An active signed-in account is required.', $userId < 1 ? 401 : 403); }
    }
    public function isBlocked(int $viewerId, int $ownerId): bool { return in_array([$viewerId, $ownerId], $this->blockedPairs, true) || in_array([$ownerId, $viewerId], $this->blockedPairs, true); }
    public function areFriends(int $viewerId, int $ownerId): bool { return in_array([$viewerId, $ownerId], $this->friendships, true) && in_array([$ownerId, $viewerId], $this->friendships, true); }
    public function isSpaceMember(int $userId, int $spaceId): bool { return in_array($userId, $this->memberships[$spaceId] ?? [], true); }
    public function canAccessPostAuthor(int $viewerId, int $ownerId, int $postId): bool
    {
        $post = $this->posts[$postId] ?? [];
        return ($post['owner_id'] ?? null) === $ownerId && ($post['visible'] ?? false) && in_array($viewerId, $post['viewers'] ?? [], true);
    }
}
