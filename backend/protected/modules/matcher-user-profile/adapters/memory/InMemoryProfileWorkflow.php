<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\memory;
use humhub\modules\matcherProfile\domain\ports\ProfileWorkflow;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\application\ProfileService;
final class InMemoryProfileWorkflow implements ProfileWorkflow
{
    /** Repositories enlisted in the same test transaction as ordinary profiles. */
    public array $participants = []; public ?int $failConfirmSpace = null;
    public function __construct(private readonly InMemoryProfileRepository $repository, private readonly ProfileService $service, private readonly InMemoryProfileAccessPolicy $access) {}
    public function transaction(int $ownerId, ?int $spaceId, callable $callback, bool $writable = true): mixed
    {
        return $this->repository->transaction(function () use ($ownerId, $spaceId, $callback, $writable): mixed {
            $this->repository->ensureState($ownerId, ProfileScope::global(), '2026-11-11 00:00:00');
            if ($spaceId !== null) { $this->repository->ensureState($ownerId, ProfileScope::event($spaceId), '2026-11-11 00:00:00'); }
            $this->access->assertOwner($ownerId, $ownerId, $this->scope($spaceId));
            if ($writable) { $this->access->assertWritable(); }
            $next = $callback;
            foreach (array_reverse($this->participants) as $repository) { $inner = $next; $next = static fn(): mixed => $repository->transaction($inner); }
            return $next();
        });
    }
    public function profiles(int $ownerId, ?int $spaceId): array
    { return ['global' => $this->service->getProfile($ownerId, $ownerId, ProfileScope::global()), 'space' => $spaceId === null ? null : $this->service->getProfile($ownerId, $ownerId, $this->scope($spaceId))]; }
    public function createDraft(int $ownerId, ?int $spaceId): array { return $this->service->startDraft($ownerId, $ownerId, $this->scope($spaceId), 'onboarding', false); }
    public function getDraft(int $ownerId, ?int $spaceId, string $id): array { return $this->service->getDraft($ownerId, $ownerId, $this->scope($spaceId), $id); }
    public function updateDraft(int $ownerId, ?int $spaceId, string $id, int $expectedVersion, array $fields): array { return $this->service->updateDraft($ownerId, $ownerId, $this->scope($spaceId), $id, $expectedVersion, $fields); }
    public function confirmDraft(int $ownerId, ?int $spaceId, string $id, int $expectedVersion, int $expectedRevision, ?array $attributeIds = null): array
    {
        if ($spaceId !== null && $spaceId === $this->failConfirmSpace) { throw new \RuntimeException('Synthetic second-scope confirmation failure.'); }
        return $this->service->confirmDraft($ownerId, $ownerId, $this->scope($spaceId), $id, $expectedVersion, $expectedRevision, $attributeIds);
    }
    private function scope(?int $id): ProfileScope { return $id === null ? ProfileScope::global() : ProfileScope::event($id); }
}
