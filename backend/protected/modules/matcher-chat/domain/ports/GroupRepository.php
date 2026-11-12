<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain\ports;

use humhub\modules\matcherChat\domain\{GroupInvitation, GroupMembership, GroupReceipt, GroupState};

/** The production adapter must include native UserMessage mutations in this same boundary. */
interface GroupRepository extends ConsistencyBoundary
{
    /** Create the native empty conversation and only its owner membership, in this boundary. */
    public function create(int $ownerId, string $title): GroupState;
    public function group(int $conversationId): ?GroupState;
    public function activeMembership(int $conversationId, int $userId): ?GroupMembership;
    public function latestMembership(int $conversationId, int $userId): ?GroupMembership;
    /** Atomically insert native user_message, membership generation, and updated group version/count. */
    public function join(GroupState $group, GroupMembership $membership): void;
    /** Atomically remove native user_message, close this membership generation, and update group version/count. */
    public function leave(GroupState $group, GroupMembership $membership): void;
    public function invitation(int $invitationId): ?GroupInvitation;
    /** Unresolved records only; competing invitations must share the group lock. */
    public function pendingInvitations(int $conversationId): array;
    public function insertInvitation(int $conversationId, int $inviterId, int $inviteeId, string $createdAt, string $expiresAt): GroupInvitation;
    public function saveInvitation(GroupInvitation $invitation): void;
    public function receipt(int $actorId, string $operation, string $clientCommandId): ?GroupReceipt;
    public function remember(GroupReceipt $receipt): void;
}
