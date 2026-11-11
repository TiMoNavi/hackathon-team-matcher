<?php
declare(strict_types=1);
namespace humhub\modules\matcherIdeas\domain\ports;

/** No message bodies, friendships or idea follows are read through this port. */
interface NativeRelations
{
    public function isActive(int $userId): bool;
    public function isSpaceMember(int $userId, int $spaceId): bool;
    public function isBlocked(int $firstId, int $secondId): bool;
    /** @return array{id:int,creator_id:int,participant_ids:list<int>}|null */
    public function conversation(int $messageId): ?array;
}
