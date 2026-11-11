<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\memory;

use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ports\ProfileRepository;

/** Test adapter: transactions snapshot all state, including native-value projections. */
final class InMemoryProfileRepository implements ProfileRepository
{
    public array $states = [];
    public array $attributes = [];
    public array $revisions = [];
    public array $drafts = [];
    public array $native = [];
    public ?string $failOn = null;
    public array $lockLog = [];
    /** Optional deterministic scheduler hook for lock-wait authorization tests. */
    public $onStateLocked = null;
    private int $transactionDepth = 0;

    public function transaction(callable $callback): mixed
    {
        $before = [$this->states, $this->attributes, $this->revisions, $this->drafts, $this->native];
        ++$this->transactionDepth;
        try { return $callback(); } catch (\Throwable $error) {
            [$this->states, $this->attributes, $this->revisions, $this->drafts, $this->native] = $before;
            throw $error;
        } finally { --$this->transactionDepth; }
    }

    public function findState(int $ownerId, ProfileScope $scope, bool $forUpdate = false): ?array
    {
        if ($forUpdate) { $this->lock('state:' . $ownerId . ':' . $scope->key()); }
        if ($forUpdate && $this->onStateLocked !== null) { ($this->onStateLocked)(); }
        foreach ($this->states as $state) {
            if ($state['user_id'] === $ownerId && $state['scope_key'] === $scope->key()) { return $state; }
        }
        return null;
    }

    public function ensureState(int $ownerId, ProfileScope $scope, string $now): array
    {
        $state = $this->findState($ownerId, $scope, true);
        if ($state !== null) { return $state; }
        $state = [
            'id' => $this->uuid(), 'user_id' => $ownerId, 'scope_key' => $scope->key(), 'space_id' => $scope->spaceId,
            'revision' => 0, 'permission_version' => 0, 'current_revision_id' => null, 'identity_version' => 0,
            'confirmed_avatar_ref' => null, 'created_at' => $now, 'updated_at' => $now,
        ];
        $this->states[$state['id']] = $state;
        return $state;
    }

    public function saveState(array $state): void
    {
        $this->maybeFail('saveState');
        $this->states[$state['id']] = $state;
    }

    public function currentAttributes(string $stateId): array
    {
        $items = $this->attributes[$stateId] ?? [];
        $ownerId = $this->states[$stateId]['user_id'];
        foreach ($items as &$item) {
            $binding = FieldCatalog::definitions()[$item['key']]['native_binding'];
            if ($binding !== null) { $item['value'] = $this->native[$ownerId][$item['key']] ?? null; }
        }
        unset($item);
        return $items;
    }

    public function replaceAttributes(array $state, array $attributes): void
    {
        $this->maybeFail('replaceAttributes');
        $ownerId = $state['user_id'];
        $nextKeys = array_column($attributes, 'key');
        foreach ($this->attributes[$state['id']] ?? [] as $old) {
            if (FieldCatalog::get($old['key'])['native_binding'] !== null && !in_array($old['key'], $nextKeys, true)) {
                unset($this->native[$ownerId][$old['key']]);
            }
        }
        foreach ($attributes as $item) {
            if (FieldCatalog::get($item['key'])['native_binding'] !== null) { $this->native[$ownerId][$item['key']] = $item['value']; }
        }
        $this->attributes[$state['id']] = $attributes;
    }

    public function nativeCandidates(int $ownerId): array { return $this->native[$ownerId] ?? []; }
    public function findRevision(string $stateId, int $revision): ?array { return $this->revisions[$stateId][$revision] ?? null; }

    public function insertRevision(array $revision): void
    {
        $this->maybeFail('insertRevision');
        if (isset($this->revisions[$revision['state_id']][$revision['revision']])) { throw new \LogicException('Immutable revision already exists.'); }
        $this->revisions[$revision['state_id']][$revision['revision']] = $revision;
    }

    public function findDraft(string $draftId, bool $forUpdate = false): ?array
    {
        if ($forUpdate) { $this->lock('draft:' . $draftId); }
        return $this->drafts[$draftId] ?? null;
    }

    public function findEditingDraft(string $stateId, string $origin = 'manual'): ?array
    {
        foreach (array_reverse($this->drafts) as $draft) {
            if ($draft['state_id'] === $stateId && $draft['origin'] === $origin && $draft['status'] === 'editing' && $draft['draft_kind'] === 'profile') { return $draft; }
        }
        return null;
    }

    public function saveDraft(array $draft): void
    {
        $this->maybeFail('saveDraft');
        $this->drafts[$draft['id']] = $draft;
    }

    private function lock(string $target): void
    {
        if ($this->transactionDepth < 1) { throw new \LogicException('Row locks require a transaction.'); }
        $this->lockLog[] = $target;
    }
    private function maybeFail(string $operation): void
    {
        if ($this->failOn === $operation) { throw new \RuntimeException('Synthetic adapter failure: ' . $operation); }
    }
    private function uuid(): string
    {
        $hex = bin2hex(random_bytes(16));
        return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-4' . substr($hex, 13, 3) . '-8' . substr($hex, 17, 3) . '-' . substr($hex, 20);
    }
}
