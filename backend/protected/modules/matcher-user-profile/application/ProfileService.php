<?php
declare(strict_types=1);

namespace humhub\modules\matcherProfile\application;

use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ports\ProfileAccessPolicy;
use humhub\modules\matcherProfile\domain\ports\ProfileRepository;
use humhub\modules\matcherProfile\domain\ports\ProfileResourcePolicy;
use humhub\modules\matcherProfile\domain\ports\ProfileReadPolicy;

/** Ordinary profile use cases; all database, authorization and media behavior is injected. */
final class ProfileService
{
    public const POLICY_VERSION = 's2-2026-11-11';
    private readonly \Closure $clock;

    public function __construct(
        private readonly ProfileRepository $repository,
        private readonly ProfileAccessPolicy $access,
        private readonly ?ProfileResourcePolicy $resources = null,
        ?callable $clock = null,
        private readonly ?ProfileReadPolicy $readPolicy = null,
    ) {
        $this->clock = $clock === null ? static fn(): string => gmdate('Y-m-d H:i:s') : \Closure::fromCallable($clock);
    }

    public function getProfile(int $actorId, int $ownerId, ProfileScope $scope, ?int $currentSpaceId = null, array $context = []): array
    {
        if ($context === []) {
            $context = ['entry_type' => $actorId === $ownerId ? 'self' : ($currentSpaceId === null ? 'friendship' : 'space'), 'space_id' => $currentSpaceId, 'purpose' => 'detail'];
        }
        $authorize = function () use ($actorId, $ownerId, $scope, $currentSpaceId, $context): void {
            if ($this->readPolicy !== null) { $this->readPolicy->assertCanRead($actorId, $ownerId, $scope, $context); }
            else { $this->access->assertCanRead($actorId, $ownerId, $scope, $currentSpaceId); }
        };
        // With independent privacy, acquire state first. Its native facts adapter uses
        // current locking reads afterwards, preventing stale RR snapshots and user->state upgrades.
        if ($this->readPolicy === null) { $authorize(); }
        return $this->repository->transaction(function () use ($actorId, $ownerId, $scope, $context, $authorize): array {
            if ($this->readPolicy === null) { $authorize(); }
            $state = $this->repository->findState($ownerId, $scope, true);
            $authorize();
            $attributes = $state === null ? [] : $this->repository->currentAttributes($state['id']);
            $isOwner = $actorId === $ownerId;
            if (!$isOwner && $this->readPolicy === null) {
                $attributes = array_values(array_filter($attributes, static fn(array $item): bool =>
                    ($item['confirmation'] ?? null) === 'confirmed' && ($item['visibility'] ?? 'private') === 'authenticated'));
            }
            $result = $this->profileResult($scope, $state, $attributes);
            if (!$isOwner && $this->readPolicy !== null) { $result = $this->readPolicy->projectProfile($actorId, $ownerId, $scope, $result, $context); }
            if ($isOwner) {
                $result['legacy_candidates'] = $scope->spaceId === null ? $this->legacyCandidates($ownerId, $attributes) : [];
                $result['editing_draft'] = $state === null ? null : $this->repository->findEditingDraft($state['id']);
            }
            return $result;
        });
    }

    public function startDraft(int $actorId, int $ownerId, ProfileScope $scope, string $origin = 'manual', bool $resume = true): array
    {
        $this->writeAccess($actorId, $ownerId, $scope);
        if (!in_array($origin, ['manual', 'native_edit', 'onboarding', 'import', 'ai', 'rules', 'migration'], true)) {
            $this->invalid('Unsupported draft origin.');
        }
        return $this->repository->transaction(function () use ($actorId, $ownerId, $scope, $origin, $resume): array {
            $this->writeAccess($actorId, $ownerId, $scope);
            $state = $this->repository->ensureState($ownerId, $scope, $this->now());
            $this->writeAccess($actorId, $ownerId, $scope);
            $existing = $resume ? $this->repository->findEditingDraft($state['id'], $origin) : null;
            if ($existing !== null) {
                return $this->draftResult($scope, $state, $existing);
            }
            $draft = $this->newDraft($state, $actorId, $origin);
            $this->repository->saveDraft($draft);
            return $this->draftResult($scope, $state, $draft);
        });
    }

    public function getDraft(int $actorId, int $ownerId, ProfileScope $scope, string $draftId): array
    {
        $this->access->assertOwner($actorId, $ownerId, $scope);
        return $this->repository->transaction(function () use ($actorId, $ownerId, $scope, $draftId): array {
            $this->access->assertOwner($actorId, $ownerId, $scope);
            [$state, $draft] = $this->loadDraft($ownerId, $scope, $draftId, true);
            $this->access->assertOwner($actorId, $ownerId, $scope);
            return $this->draftResult($scope, $state, $draft);
        });
    }

    public function updateDraft(int $actorId, int $ownerId, ProfileScope $scope, string $draftId, int $expectedDraftVersion, array $operations): array
    {
        $this->writeAccess($actorId, $ownerId, $scope);
        return $this->repository->transaction(function () use ($actorId, $ownerId, $scope, $draftId, $expectedDraftVersion, $operations): array {
            $this->writeAccess($actorId, $ownerId, $scope);
            [$state, $draft] = $this->loadDraft($ownerId, $scope, $draftId, true);
            $this->writeAccess($actorId, $ownerId, $scope);
            $this->expectEditing($draft, $expectedDraftVersion);
            $current = $this->repository->currentAttributes($state['id']);
            $draft['fields'] = $this->mergeOperations($ownerId, $scope, $current, $draft['fields'], $operations);
            if ($operations !== []) {
                ++$draft['draft_version'];
                $draft['confirmation_hash'] = null;
                $draft['confirmed_revision'] = null;
                $draft['updated_at'] = $this->now();
                $this->repository->saveDraft($draft);
            }
            return $this->draftResult($scope, $state, $draft);
        });
    }

    /** null selects every pending operation; a non-empty list confirms only those stable IDs. */
    public function confirmDraft(int $actorId, int $ownerId, ProfileScope $scope, string $draftId, int $expectedDraftVersion, int $expectedBaseRevision, ?array $attributeIds = null): array
    {
        $this->writeAccess($actorId, $ownerId, $scope);
        $selection = $attributeIds === null ? null : $this->validateIds($attributeIds);
        if ($selection !== null) { sort($selection, SORT_STRING); }
        $digest = hash('sha256', json_encode([$draftId, $expectedDraftVersion, $expectedBaseRevision, $selection], JSON_THROW_ON_ERROR));
        return $this->repository->transaction(function () use ($actorId, $ownerId, $scope, $draftId, $expectedDraftVersion, $expectedBaseRevision, $selection, $digest): array {
            $this->writeAccess($actorId, $ownerId, $scope);
            [$state, $draft] = $this->loadDraft($ownerId, $scope, $draftId, true);
            $this->writeAccess($actorId, $ownerId, $scope);
            if (is_string($draft['confirmation_hash'] ?? null) && hash_equals($draft['confirmation_hash'], $digest)) {
                $receipt = $this->repository->findRevision($state['id'], (int) $draft['confirmed_revision']);
                if ($receipt === null || ($receipt['snapshot']['confirmation']['request_hash'] ?? null) !== $digest) {
                    throw new ProfileException('PROFILE_STORAGE_ERROR', 'Confirmation receipt is unavailable.', 500);
                }
                return $this->confirmationResult($receipt['snapshot']);
            }
            $this->expectEditing($draft, $expectedDraftVersion);
            if ($expectedBaseRevision !== (int) $draft['base_revision'] || $expectedBaseRevision !== (int) $state['revision']) {
                $this->conflict('The profile changed after this draft was started.');
            }
            $pendingIds = array_column($draft['fields'], 'attribute_id');
            if ($selection !== null && array_diff($selection, $pendingIds) !== []) {
                $this->invalid('Confirmation contains an item outside this draft.');
            }
            $selected = $selection === null ? $draft['fields'] : array_values(array_filter($draft['fields'], static fn(array $op): bool => in_array($op['attribute_id'], $selection, true)));
            if ($selected === []) { $this->invalid('Select at least one draft item to confirm.'); }
            $current = $this->repository->currentAttributes($state['id']);
            $next = $this->applyOperations($current, $selected, true, $this->now());
            $this->validateAttributes($ownerId, $scope, $next, true);
            $remaining = array_values(array_filter($draft['fields'], static fn(array $op): bool => !in_array($op['attribute_id'], array_column($selected, 'attribute_id'), true)));
            $nextRevision = (int) $state['revision'] + 1;
            $draft['status'] = $remaining === [] ? 'confirmed' : 'editing';
            if ($remaining !== []) {
                $draft['fields'] = $remaining;
                ++$draft['draft_version'];
                $draft['base_revision'] = $nextRevision;
            }
            $draft['confirmation_hash'] = $digest;
            $draft['confirmed_revision'] = $nextRevision;
            $draft['updated_at'] = $this->now();
            $receipt = [
                'request_hash' => $digest, 'draft_id' => $draftId,
                'draft_version' => (int) $draft['draft_version'], 'draft_status' => $draft['status'],
                'confirmed_attribute_ids' => array_column($selected, 'attribute_id'),
            ];
            $snapshot = $this->commitRevision($state, $scope, $current, $next, $receipt);
            $this->repository->saveDraft($draft);
            return $this->confirmationResult($snapshot);
        });
    }

    public function reconfirm(int $actorId, int $ownerId, ProfileScope $scope, int $expectedRevision, array $attributeIds): array
    {
        $this->writeAccess($actorId, $ownerId, $scope);
        $ids = $this->validateIds($attributeIds);
        return $this->repository->transaction(function () use ($actorId, $ownerId, $scope, $expectedRevision, $ids): array {
            $this->writeAccess($actorId, $ownerId, $scope);
            $state = $this->repository->findState($ownerId, $scope, true);
            $this->writeAccess($actorId, $ownerId, $scope);
            if ($state === null || (int) $state['revision'] !== $expectedRevision) { $this->conflict('The profile revision changed.'); }
            $current = $this->repository->currentAttributes($state['id']);
            if (array_diff($ids, array_column($current, 'attribute_id')) !== []) { $this->invalid('Reconfirmation contains an unknown current item.'); }
            $next = $current;
            foreach ($next as &$attribute) {
                if (in_array($attribute['attribute_id'], $ids, true)) {
                    $attribute['confirmation'] = 'confirmed';
                    $attribute['last_confirmed_at'] = $this->now();
                }
            }
            unset($attribute);
            $this->validateAttributes($ownerId, $scope, $next, true);
            $snapshot = $this->commitRevision($state, $scope, $current, $next, ['kind' => 'reconfirm', 'confirmed_attribute_ids' => $ids]);
            return $snapshot['profile'];
        });
    }

    public function getRevision(int $actorId, int $ownerId, ProfileScope $scope, int $revision): array
    {
        $this->access->assertOwner($actorId, $ownerId, $scope);
        $state = $this->repository->findState($ownerId, $scope);
        $record = $state === null ? null : $this->repository->findRevision($state['id'], $revision);
        if ($record === null) { $this->notFound('Profile revision was not found.'); }
        return $record['snapshot']['profile'];
    }

    /** Changes only confirmed current visibility; content timestamps and all pending drafts are preserved. */
    public function setVisibilities(int $actorId, int $ownerId, ProfileScope $scope, int $expectedRevision, array $changes): array
    {
        $this->writeAccess($actorId, $ownerId, $scope);
        if (!array_is_list($changes) || $changes === [] || count($changes) > 200) { $this->invalid('Select between 1 and 200 visibility changes.'); }
        $byId = [];
        foreach ($changes as $change) {
            if (!is_array($change) || array_diff(array_keys($change), ['attribute_id', 'visibility']) !== []
                || !is_string($change['attribute_id'] ?? null) || !self::isUuid($change['attribute_id'])
                || !in_array($change['visibility'] ?? null, FieldCatalog::VISIBILITIES, true)
                || isset($byId[$change['attribute_id']])) { $this->invalid('Provide unique current attribute IDs and supported visibility values.'); }
            $byId[$change['attribute_id']] = $change['visibility'];
        }
        return $this->repository->transaction(function () use ($actorId, $ownerId, $scope, $expectedRevision, $byId): array {
            $this->writeAccess($actorId, $ownerId, $scope);
            $state = $this->repository->findState($ownerId, $scope, true);
            $this->writeAccess($actorId, $ownerId, $scope);
            if ($state === null || (int)$state['revision'] !== $expectedRevision) { $this->conflict('The profile revision changed.'); }
            $this->readPolicy?->assertCanRead($actorId, $ownerId, $scope, ['entry_type' => 'self', 'space_id' => $scope->spaceId, 'purpose' => 'detail']);
            $current = $this->repository->currentAttributes($state['id']);
            $confirmed = array_column(array_filter($current, static fn(array $item): bool => ($item['confirmation'] ?? null) === 'confirmed'), null, 'attribute_id');
            if (array_diff(array_keys($byId), array_keys($confirmed)) !== []) { $this->invalid('Visibility changes require confirmed current attributes.'); }
            $next = $current;
            foreach ($next as &$item) { if (isset($byId[$item['attribute_id']])) { $item['visibility'] = $byId[$item['attribute_id']]; } }
            unset($item);
            if ($this->permissionFingerprint($current) === $this->permissionFingerprint($next)) { return $this->profileResult($scope, $state, $current); }
            $snapshot = $this->commitRevision($state, $scope, $current, $next, ['kind' => 'visibility', 'attribute_ids' => array_keys($byId)]);
            return $snapshot['profile'];
        });
    }

    public function adminProposal(int $actorId, int $ownerId, ProfileScope $scope, array $operations): array
    {
        $this->access->assertWritable();
        $this->access->assertAdministrator($actorId, $ownerId, $scope);
        return $this->repository->transaction(function () use ($actorId, $ownerId, $scope, $operations): array {
            $this->access->assertWritable();
            $this->access->assertAdministrator($actorId, $ownerId, $scope);
            $state = $this->repository->ensureState($ownerId, $scope, $this->now());
            $this->access->assertWritable();
            $this->access->assertAdministrator($actorId, $ownerId, $scope);
            $draft = $this->newDraft($state, $actorId, 'admin_proposal');
            $draft['fields'] = $this->mergeOperations($ownerId, $scope, $this->repository->currentAttributes($state['id']), [], $operations);
            if ($draft['fields'] === []) { $this->invalid('An administrator proposal needs at least one change.'); }
            $this->repository->saveDraft($draft);
            return $this->draftResult($scope, $state, $draft);
        });
    }

    private function writeAccess(int $actorId, int $ownerId, ProfileScope $scope): void
    {
        $this->access->assertWritable();
        $this->access->assertOwner($actorId, $ownerId, $scope);
    }

    private function loadDraft(int $ownerId, ProfileScope $scope, string $draftId, bool $lock = false): array
    {
        $state = $this->repository->findState($ownerId, $scope, $lock);
        $draft = $this->repository->findDraft($draftId, $lock);
        if ($state === null || $draft === null || $draft['state_id'] !== $state['id'] || ($draft['draft_kind'] ?? 'profile') !== 'profile') {
            $this->notFound('Profile draft was not found.');
        }
        return [$state, $draft];
    }

    private function newDraft(array $state, int $initiator, string $origin): array
    {
        return [
            'id' => self::uuid(), 'state_id' => $state['id'], 'draft_kind' => 'profile',
            'base_revision' => (int) $state['revision'], 'base_identity_version' => (int) $state['identity_version'],
            'draft_version' => 1, 'fields' => [], 'origin' => $origin, 'initiator_id' => $initiator,
            'status' => 'editing', 'confirmation_hash' => null, 'confirmed_revision' => null,
            'created_at' => $this->now(), 'updated_at' => $this->now(),
        ];
    }

    private function expectEditing(array $draft, int $expectedVersion): void
    {
        if ($expectedVersion < 1 || $draft['status'] !== 'editing' || (int) $draft['draft_version'] !== $expectedVersion) {
            $this->conflict('The draft is no longer editable at the supplied version.');
        }
    }

    private function mergeOperations(int $ownerId, ProfileScope $scope, array $current, array $pending, array $operations): array
    {
        if (!array_is_list($operations) || count($operations) > 200) { $this->invalid('Draft operations must be a list of at most 200 items.'); }
        $base = array_column($current, null, 'attribute_id');
        $merged = array_column($pending, null, 'attribute_id');
        $seen = [];
        $fields = FieldCatalog::definitions();
        foreach ($operations as $operation) {
            if (!is_array($operation) || array_is_list($operation)) { $this->invalid('Each operation must be an object.'); }
            $unknown = array_diff(array_keys($operation), ['op', 'attribute_id', 'key', 'value', 'visibility', 'display_label', 'record_group_id', 'sort_order']);
            if ($unknown !== []) { $this->invalid('Unknown draft operation properties.', ['properties' => array_values($unknown)]); }
            $op = $operation['op'] ?? 'upsert';
            if (!in_array($op, ['upsert', 'delete'], true)) { $this->invalid('Unknown draft operation.'); }
            $id = $operation['attribute_id'] ?? null;
            if ($id !== null && (!is_string($id) || !self::isUuid($id))) { $this->invalid('Invalid attribute ID.'); }
            if ($id !== null && isset($seen[$id])) { $this->invalid('A request cannot mutate the same attribute twice.'); }
            if ($id !== null) { $seen[$id] = true; }
            $previous = $id === null ? null : ($merged[$id] ?? $base[$id] ?? null);
            if ($id !== null && $previous === null) { $this->invalid('Attribute ID does not belong to this profile or draft.'); }
            if ($op === 'delete') {
                if ($id === null) { $this->invalid('Deletion requires an existing attribute ID.'); }
                if (array_diff(array_keys($operation), ['op', 'attribute_id']) !== []) { $this->invalid('Deletion accepts only its attribute ID.'); }
                if (isset($base[$id])) { $merged[$id] = ['op' => 'delete', 'attribute_id' => $id]; } else { unset($merged[$id]); }
                continue;
            }
            $previous = ($previous['op'] ?? 'upsert') === 'delete' ? ($base[$id] ?? null) : $previous;
            $key = $operation['key'] ?? $previous['key'] ?? null;
            if (!is_string($key) || !isset($fields[$key]) || $fields[$key]['scope'] !== $scope->kind()) { $this->invalid('Field is not editable in this scope.'); }
            if ($previous !== null && isset($previous['key']) && $previous['key'] !== $key) { $this->invalid('A stable attribute ID cannot change field type.'); }
            if (!array_key_exists('value', $operation) && !array_key_exists('value', $previous ?? [])) { $this->invalid('An upsert needs a value.'); }
            $value = $operation['value'] ?? $previous['value'] ?? null;
            if (array_key_exists('value', $operation) && $operation['value'] === null) { $this->invalid('Use an explicit delete operation to remove a field.'); }
            if ($value === null) { $this->invalid('An upsert value cannot be null.'); }
            $id ??= self::uuid();
            $item = [
                'op' => 'upsert', 'attribute_id' => $id, 'key' => $key, 'value' => $value,
                'visibility' => $operation['visibility'] ?? $previous['visibility'] ?? $fields[$key]['default_visibility'],
                'display_label' => $operation['display_label'] ?? $previous['display_label'] ?? null,
                'record_group_id' => $operation['record_group_id'] ?? $previous['record_group_id'] ?? null,
                'sort_order' => $operation['sort_order'] ?? $previous['sort_order'] ?? count($base) + count($merged),
                'schema_version' => FieldCatalog::VERSION,
            ];
            if (!is_int($item['sort_order']) || $item['sort_order'] < 0 || $item['sort_order'] > 100000) { $this->invalid('sort_order must be an integer from 0 to 100000.'); }
            foreach (['display_label' => 255, 'record_group_id' => 36] as $property => $max) {
                if ($item[$property] !== null && (!is_string($item[$property]) || mb_strlen($item[$property], 'UTF-8') > $max)) { $this->invalid('Invalid ' . $property . '.'); }
            }
            if ($item['record_group_id'] !== null && !self::isUuid($item['record_group_id'])) { $this->invalid('record_group_id must be a UUID.'); }
            $merged[$id] = $item;
        }
        $result = array_values($merged);
        $preview = $this->applyOperations($current, $result, false, $this->now());
        $this->validateAttributes($ownerId, $scope, $preview, false);
        return $result;
    }

    private function applyOperations(array $current, array $operations, bool $confirmed, string $now): array
    {
        $items = array_column($current, null, 'attribute_id');
        foreach ($operations as $op) {
            if ($op['op'] === 'delete') { unset($items[$op['attribute_id']]); continue; }
            $previous = $items[$op['attribute_id']] ?? null;
            $item = $op;
            unset($item['op']);
            $item['confirmation'] = $confirmed ? 'confirmed' : 'pending';
            $sameContent = ($previous['confirmation'] ?? null) === 'confirmed'
                && ($previous['key'] ?? null) === $item['key']
                && self::canonicalValue($previous['value'] ?? null) === self::canonicalValue($item['value'])
                && ($previous['display_label'] ?? null) === ($item['display_label'] ?? null);
            $item['last_confirmed_at'] = $confirmed ? ($sameContent ? ($previous['last_confirmed_at'] ?? $now) : $now) : null;
            $items[$item['attribute_id']] = $item;
        }
        $items = array_values($items);
        usort($items, static fn(array $a, array $b): int => (($a['sort_order'] ?? 0) <=> ($b['sort_order'] ?? 0)) ?: strcmp($a['attribute_id'], $b['attribute_id']));
        return $items;
    }

    /** JSON object key order is not a content edit; array order and scalar types remain significant. */
    private static function canonicalValue(mixed $value): mixed
    {
        if (!is_array($value)) { return $value; }
        if (!array_is_list($value)) { ksort($value, SORT_STRING); }
        foreach ($value as &$item) { $item = self::canonicalValue($item); }
        unset($item);
        return $value;
    }

    private function validateAttributes(int $ownerId, ProfileScope $scope, array $attributes, bool $complete): void
    {
        $errors = FieldCatalog::validateAttributeSet($attributes, $scope, $complete);
        $ids = [];
        $codes = [];
        foreach ($attributes as $item) {
            if (isset($ids[$item['attribute_id']])) { $errors[] = 'Duplicate stable attribute ID.'; }
            $ids[$item['attribute_id']] = true;
            if (is_array($item['value'] ?? null) && isset($item['value']['code'])) {
                $codeKey = $item['key'] . ':' . $item['value']['code'];
                if (isset($codes[$codeKey])) { $errors[] = 'Duplicate code for ' . $item['key'] . '.'; }
                $codes[$codeKey] = true;
            }
        }
        if ($errors !== []) { $this->invalid('Profile validation failed.', ['errors' => $errors]); }
        foreach ($attributes as $item) {
            if ($item['key'] === 'contact_wechat_qr' && isset($item['value']['file_ref'])) {
                if ($this->resources === null) { $this->invalid('A QR resource validator is required.'); }
                $this->resources->assertContactQrOwned($ownerId, $item['value']['file_ref']);
            }
            if ($item['key'] === 'portfolio_link' && isset($item['value']['project_ref'])) {
                $projects = array_column(array_filter($attributes, static fn(array $candidate): bool => $candidate['key'] === 'project'), 'attribute_id');
                if (!in_array($item['value']['project_ref'], $projects, true)) { $this->invalid('The portfolio link refers to a project outside this profile.'); }
            }
        }
    }

    private function commitRevision(array $state, ProfileScope $scope, array $previous, array $attributes, array $confirmation): array
    {
        $state['revision'] = (int) $state['revision'] + 1;
        if ($this->permissionFingerprint($previous) !== $this->permissionFingerprint($attributes)) {
            $state['permission_version'] = (int) $state['permission_version'] + 1;
        }
        $state['current_revision_id'] = self::uuid();
        $state['updated_at'] = $this->now();
        $snapshot = ['profile' => $this->profileResult($scope, $state, $attributes), 'confirmation' => $confirmation];
        $this->repository->replaceAttributes($state, $attributes);
        $this->repository->insertRevision([
            'id' => $state['current_revision_id'], 'state_id' => $state['id'], 'revision' => $state['revision'],
            'snapshot' => $snapshot, 'schema_version' => FieldCatalog::VERSION,
            'confirmed_at' => $this->now(), 'created_at' => $this->now(),
        ]);
        $this->repository->saveState($state);
        return $snapshot;
    }

    private function profileResult(ProfileScope $scope, ?array $state, array $attributes): array
    {
        return [
            'scope' => $scope->key(), 'space_id' => $scope->spaceId,
            'revision' => (int) ($state['revision'] ?? 0), 'permission_version' => (int) ($state['permission_version'] ?? 0),
            'attributes' => $attributes,
            'field_definitions' => array_values(array_filter(FieldCatalog::definitions(), static fn(array $field): bool => $field['scope'] === $scope->kind())),
            'schema_version' => FieldCatalog::VERSION, 'policy_version' => self::POLICY_VERSION,
        ];
    }

    private function draftResult(ProfileScope $scope, array $state, array $draft): array
    {
        $completed = $draft['status'] === 'confirmed' && isset($draft['confirmed_revision'])
            ? $this->repository->findRevision($state['id'], (int) $draft['confirmed_revision'])
            : null;
        $preview = $completed['snapshot']['profile']['attributes']
            ?? $this->applyOperations($this->repository->currentAttributes($state['id']), $draft['fields'], false, $this->now());
        return $draft + [
            'scope' => $scope->key(), 'space_id' => $scope->spaceId,
            'current_revision' => (int) $state['revision'],
            'preview_attributes' => $preview,
            'field_definitions' => array_values(array_filter(FieldCatalog::definitions(), static fn(array $field): bool => $field['scope'] === $scope->kind())),
            'policy_version' => self::POLICY_VERSION,
        ];
    }

    private function confirmationResult(array $snapshot): array
    {
        $receipt = $snapshot['confirmation'];
        return [
            'profile' => $snapshot['profile'], 'confirmed_revision' => $snapshot['profile']['revision'],
            'draft_id' => $receipt['draft_id'], 'draft_version' => $receipt['draft_version'],
            'draft_status' => $receipt['draft_status'], 'confirmed_attribute_ids' => $receipt['confirmed_attribute_ids'],
        ];
    }

    private function legacyCandidates(int $ownerId, array $attributes): array
    {
        $existing = array_column($attributes, 'key');
        $fields = FieldCatalog::definitions();
        $result = [];
        foreach ($this->repository->nativeCandidates($ownerId) as $key => $value) {
            if (!isset($fields[$key]) || in_array($key, $existing, true) || $value === null || $value === '') { continue; }
            $result[] = ['key' => $key, 'value' => $value, 'visibility' => 'private', 'confirmation' => 'legacy_candidate'];
        }
        return $result;
    }

    private function permissionFingerprint(array $attributes): string
    {
        $projection = [];
        foreach ($attributes as $item) { $projection[$item['attribute_id']] = [$item['visibility'], $item['confirmation']]; }
        ksort($projection, SORT_STRING);
        return hash('sha256', json_encode($projection, JSON_THROW_ON_ERROR));
    }

    private function validateIds(array $ids): array
    {
        if ($ids === [] || !array_is_list($ids) || count($ids) > 200) { $this->invalid('Select between 1 and 200 stable attribute IDs.'); }
        foreach ($ids as $id) { if (!is_string($id) || !self::isUuid($id)) { $this->invalid('Invalid attribute ID.'); } }
        if (count(array_unique($ids)) !== count($ids)) { $this->invalid('Duplicate selected attribute ID.'); }
        return $ids;
    }

    private static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);
        return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
    }
    private static function isUuid(string $value): bool { return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/D', $value) === 1; }
    private function now(): string { return ($this->clock)(); }
    private function invalid(string $message, array $details = []): never { throw new ProfileException('PROFILE_VALIDATION_FAILED', $message, 422, $details); }
    private function conflict(string $message): never { throw new ProfileException('PROFILE_VERSION_CONFLICT', $message, 409); }
    private function notFound(string $message): never { throw new ProfileException('PROFILE_NOT_FOUND', $message, 404); }
}
