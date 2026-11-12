<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain\ports;

/** Current native facts, re-read inside the repository consistency boundary. */
interface GroupAuthority
{
    public function activeAccount(int $userId): bool;
    /** True only for an explicitly admitted native Message and active group state. */
    public function activeGroup(int $conversationId): bool;
    public function nativeMember(int $conversationId, int $userId): bool;
    /** Current native creator/owner fact; never accepted from the request. */
    public function nativeOwner(int $conversationId, int $userId): bool;
    /** Current bidirectional friendship, active accounts, and no block in either direction. */
    public function friendsUnblocked(int $firstUserId, int $secondUserId): bool;
}
