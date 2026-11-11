<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\ports;
interface ProfileSourceRepository
{
    public function transaction(callable $callback): mixed;
    public function listSources(int $ownerId): array;
    public function hasSourceHistory(int $ownerId, string $kind): bool;
    public function findSource(string $id, bool $lock = false): ?array;
    public function findSourceKey(int $ownerId, string $kind, string $key): ?array;
    public function saveSource(array $source): void;
    public function findSnapshot(string $id): ?array;
    public function saveSnapshot(array $snapshot): void;
    public function purgeSnapshots(string $sourceId): void;
    public function findJob(string $id): ?array;
    public function saveJob(array $job): void;
    public function changeJobApplicability(string $sourceId, string $applicability): void;
}
