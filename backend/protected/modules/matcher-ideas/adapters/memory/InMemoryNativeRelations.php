<?php
declare(strict_types=1);
namespace humhub\modules\matcherIdeas\adapters\memory;
use humhub\modules\matcherIdeas\domain\ports\NativeRelations;

final class InMemoryNativeRelations implements NativeRelations
{
    public array $activeUsers = [];
    public array $memberships = [];
    public array $blocked = [];
    public array $conversations = [];
    public function isActive(int $userId): bool { return $userId > 0 && in_array($userId, $this->activeUsers, true); }
    public function isSpaceMember(int $userId, int $spaceId): bool { return $this->isActive($userId) && in_array($userId, $this->memberships[$spaceId] ?? [], true); }
    public function isBlocked(int $firstId, int $secondId): bool { return in_array([$firstId, $secondId], $this->blocked, true) || in_array([$secondId, $firstId], $this->blocked, true); }
    public function conversation(int $messageId): ?array { return $this->conversations[$messageId] ?? null; }
}
