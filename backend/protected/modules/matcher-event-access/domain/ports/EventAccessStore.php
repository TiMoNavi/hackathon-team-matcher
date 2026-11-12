<?php
declare(strict_types=1);
namespace humhub\modules\matcherEventAccess\domain\ports;
interface EventAccessStore
{
    public function transaction(callable $operation): mixed;
    public function lock(array $keys): void;
    public function invitation(string $id): ?array;
    public function invitationByDigest(string $digest): ?array;
    public function saveInvitation(array $invitation): void;
    public function receipt(string $id): ?array;
    public function receiptFor(string $invitationId, int $actorId): ?array;
    public function saveReceipt(array $receipt): void;
    public function replay(string $key): ?array;
    public function saveReplay(string $key, string $requestHash, string $kind, string $resourceId): void;
    /** Persist the attempt separately so failed commands cannot roll back rate accounting. */
    public function attempt(int $actorId, string $operation, int $now, int $window, int $maximum): void;
}
