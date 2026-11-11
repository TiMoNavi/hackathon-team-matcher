<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\ports;
/** Owner workflow boundary. Engine execution always occurs outside its transaction. */
interface ProfileAiWorkflow
{
    public function transaction(int $ownerId, ?int $spaceId, callable $callback, bool $writable = true): mixed;
    public function capture(int $ownerId, string $operation, array $request): array;
    public function applicability(int $ownerId, array $context): string;
    public function install(int $ownerId, string $operation, array $context, array $data): array;
    public function applyCandidates(int $ownerId, array $context, array $data, array $request): array;
}
