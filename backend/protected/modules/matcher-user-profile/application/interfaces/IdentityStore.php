<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\application\interfaces;
interface IdentityStore
{
    public function transaction(callable $callback): mixed;
    public function state(int $ownerId, bool $lock = false): ?array;
    public function ensureState(int $ownerId, string $now): array;
    public function saveState(array $state): void;
    public function nickname(int $ownerId): ?string;
    public function saveNickname(array $state, string $nickname, string $now): void;
    public function media(string $ref): ?array;
    public function saveMedia(array $state, string $id, array $metadata, string $now): void;
    public function recordChange(array $state, array $change, int $baseVersion, string $now): void;
    public function isConfirmedQr(int $ownerId, string $ref): bool;
    public function refresh(int $ownerId): void;
}
