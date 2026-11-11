<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboarding\domain\ports;
interface OnboardingRepository
{
    public function transaction(callable $callback): mixed;
    public function findSession(string $id, bool $forUpdate = false): ?array;
    public function findActive(int $ownerId, string $scopeKey, bool $forUpdate = false): ?array;
    public function saveSession(array $session): void;
}
