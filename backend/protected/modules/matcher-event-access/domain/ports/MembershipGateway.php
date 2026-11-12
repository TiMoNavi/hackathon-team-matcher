<?php
declare(strict_types=1);
namespace humhub\modules\matcherEventAccess\domain\ports;
interface MembershipGateway
{
    public function assertActor(int $actorId): void;
    /** Live native InviteUsers permission; never infer it from an invitation record. */
    public function assertIssuer(int $actorId, int $spaceId): void;
    public function assertCanAccept(int $actorId, int $spaceId): void;
    public function current(int $actorId, int $spaceId): ?array;
    /** Native lifecycle inside the shared unit of work; no social or selection writes. */
    public function join(int $actorId, int $spaceId): array;
    /** Query one more than the requested page; afterId is an authenticated cursor position. */
    public function joined(int $actorId, int $afterId, int $limit): array;
}
