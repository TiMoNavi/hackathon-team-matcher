<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\ports;
interface ProfileAiJobRepository
{
    public function transaction(callable $callback): mixed;
    public function find(string $id, bool $lock = false): ?array;
    public function save(array $job): void;
    public function nextQueued(): ?string;
    public function expiredRunning(string $before, ?int $ownerId = null): array;
    public function countActive(int $ownerId): int;
    public function countSince(int $ownerId, string $since): int;
    public function revokeSource(string $sourceId): void;
}
