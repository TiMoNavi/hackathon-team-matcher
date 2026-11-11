<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboarding\adapters\memory;
use humhub\modules\matcherOnboarding\domain\ports\OnboardingRepository;
final class InMemoryOnboardingRepository implements OnboardingRepository
{
    public array $sessions = []; public bool $failSave = false;
    public function transaction(callable $callback): mixed
    { $before = $this->sessions; try { return $callback(); } catch (\Throwable $e) { $this->sessions = $before; throw $e; } }
    public function findSession(string $id, bool $forUpdate = false): ?array { return $this->sessions[$id] ?? null; }
    public function findActive(int $ownerId, string $scopeKey, bool $forUpdate = false): ?array
    { foreach (array_reverse($this->sessions) as $s) { if ($s['owner_id'] === $ownerId && $s['scope_key'] === $scopeKey && $s['status'] === 'active') { return $s; } } return null; }
    public function saveSession(array $session): void { if ($this->failSave) { throw new \RuntimeException('Synthetic session failure.'); } $this->sessions[$session['id']] = $session; }
}
