<?php
declare(strict_types=1);

namespace humhub\modules\matcherProfile\domain\ports;

use humhub\modules\matcherProfile\domain\ProfileScope;

/**
 * Persistence DTOs use logical field keys and decoded PHP JSON values.
 * State: id,user_id,scope_key,space_id,revision,permission_version,current_revision_id,
 * identity_version,confirmed_avatar_ref,created_at,updated_at.
 * Attribute: attribute_id,key,value,visibility,confirmation,last_confirmed_at,
 * display_label,record_group_id,sort_order,schema_version; native values are hydrated.
 * Draft: id,state_id,draft_kind,base_revision,base_identity_version,draft_version,
 * fields (operation list),origin,initiator_id,status,confirmation_hash,confirmed_revision,
 * created_at,updated_at. Revision: id,state_id,revision,snapshot,schema_version,confirmed_at,created_at.
 * Transactions must roll back native values, rows and snapshots together.
 */
interface ProfileRepository
{
    public function transaction(callable $callback): mixed;
    public function findState(int $ownerId, ProfileScope $scope, bool $forUpdate = false): ?array;
    /** Idempotently creates/locks the unique owner/scope state inside a transaction. */
    public function ensureState(int $ownerId, ProfileScope $scope, string $now): array;
    public function saveState(array $state): void;
    /** Ordinary profile attributes only: exclude nickname/identity markers. */
    public function currentAttributes(string $stateId): array;
    /** Atomically replace ordinary attributes and write/clear their native bindings; keep identity markers. */
    public function replaceAttributes(array $state, array $attributes): void;
    /** Unconfirmed native values keyed by ordinary logical key; never login email. */
    public function nativeCandidates(int $ownerId): array;
    public function findRevision(string $stateId, int $revision): ?array;
    public function insertRevision(array $revision): void;
    public function findDraft(string $draftId, bool $forUpdate = false): ?array;
    /** Most recent matching editing profile draft; excludes admin proposals unless requested. */
    public function findEditingDraft(string $stateId, string $origin = 'manual'): ?array;
    public function saveDraft(array $draft): void;
}
