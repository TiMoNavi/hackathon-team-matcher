<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\native;

use humhub\modules\matcherChat\adapters\persistence\SqlState;
use humhub\modules\matcherChat\domain\{ChatException, SafeInteger};

/** Current native membership coverage; no body, title, profile or automatic admission. */
final class EntryCoverage
{
    public function __construct(private readonly SqlState $sql) {}

    public function inspect(int $viewerId): array
    {
        SafeInteger::positive($viewerId, 'viewer_id');
        return $this->sql->transaction(function () use ($viewerId): array {
            $limit = SqlState::MAX_CONVERSATIONS + 1;
            $native = $this->sql->all('SELECT message_id FROM {{%user_message}} WHERE user_id=:viewer ORDER BY message_id LIMIT ' . $limit . ' FOR UPDATE', [':viewer' => $viewerId]);
            $managed = $this->sql->all('SELECT c.message_id FROM {{%matcher_chat_conversation}} c WHERE EXISTS (SELECT 1 FROM {{%matcher_chat_member}} m WHERE m.message_id=c.message_id AND m.user_id=:historical) OR EXISTS (SELECT 1 FROM {{%user_message}} n WHERE n.message_id=c.message_id AND n.user_id=:current) ORDER BY c.message_id LIMIT ' . $limit . ' FOR UPDATE', [':historical' => $viewerId, ':current' => $viewerId]);
            if (count($native) >= $limit || count($managed) >= $limit) { throw new ChatException('CHAT_SCOPE_MIGRATION_REQUIRED', 'The scope requires review.', 503); }
            $nativeIds = array_map(static fn(array $row): int => SafeInteger::native($row['message_id'], 'conversation_id'), $native);
            if (count(array_unique($nativeIds)) !== count($nativeIds)) { throw new ChatException('INVALID_NATIVE_MEMBERSHIP', 'The membership requires review.', 503); }
            $managedIds = [];
            $revoked = 0;
            foreach ($managed as $row) {
                $id = SafeInteger::native($row['message_id'], 'conversation_id');
                $state = $this->sql->state($id);
                if ($state !== null && $state['type'] === 'direct') { $state = $this->sql->synchronize($id); }
                elseif ($state === null || $state['type'] !== 'group' || !$this->sql->groupsReady()
                    || $state['owner_id'] === null || $state['pair_low'] !== null || $state['pair_high'] !== null) {
                    throw new ChatException('CHAT_SCOPE_MIGRATION_REQUIRED', 'The scope requires review.', 503);
                }
                // Registered groups remain covered by native guards, but the
                // direct-only reader and EntryPolicy still advertise no group capability.
                $managedIds[] = $id;
                if ($state['status'] !== 'active') { ++$revoked; }
            }
            $nativeManaged = count(array_intersect($nativeIds, $managedIds));
            return ['affected' => $managedIds !== [], 'coverage' => ['native_total' => count($nativeIds), 'managed_total' => $nativeManaged,
                'unmanaged_total' => count($nativeIds) - $nativeManaged, 'revoked_total' => $revoked]];
        });
    }
}
