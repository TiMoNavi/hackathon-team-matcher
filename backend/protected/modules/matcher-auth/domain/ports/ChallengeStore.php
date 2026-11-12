<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\domain\ports;

interface ChallengeStore
{
    public function transaction(callable $operation): mixed;
    public function lock(string $key): void;
    public function find(string $id): ?array;
    public function findLocked(string $id): ?array;
    public function save(array $challenge): void;
    public function recent(string $emailHash, int $since): array;
    public function invalidate(string $emailHash, string $purpose): void;
    public function attempt(string $emailHash, int $timestamp): void;
    public function attempts(string $emailHash, int $since): array;
}
