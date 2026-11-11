<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\application;

use humhub\modules\matcherProfile\application\interfaces\IdentityStore;
use humhub\modules\matcherProfile\application\interfaces\ProfileMediaStore;
use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ports\ProfileAccessPolicy;
use humhub\modules\matcherProfile\domain\ports\ProfileResourcePolicy;
use humhub\modules\matcherProfile\domain\ports\ProfileReadPolicy;

/** Confirmed identity is versioned separately from ordinary profile revisions. */
final class IdentityService implements ProfileResourcePolicy
{
    public function __construct(private IdentityStore $store, private ProfileAccessPolicy $access, private ProfileMediaStore $files, private ?ProfileReadPolicy $readPolicy = null) {}

    public function getIdentity(int $actorId): array
    {
        return $this->store->transaction(function () use ($actorId) {
            $this->access->assertOwner($actorId, $actorId, ProfileScope::global());
            $state = $this->store->state($actorId, true);
            $this->access->assertOwner($actorId, $actorId, ProfileScope::global());
            return $this->identity($actorId, $state);
        });
    }

    public function update(int $actorId, int $expectedVersion, array $changes): array
    {
        $this->access->assertWritable();
        $this->access->assertOwner($actorId, $actorId, ProfileScope::global());
        if (array_diff(array_keys($changes), ['nickname', 'avatar_ref']) !== [] || $expectedVersion < 0 || $changes === []) {
            throw new ProfileException('INVALID_IDENTITY', 'Provide nickname or avatar_ref and a valid expected_version.');
        }
        $nickname = $changes['nickname'] ?? null;
        $avatarRef = $changes['avatar_ref'] ?? null;
        if (array_key_exists('nickname', $changes)) {
            if (!is_string($nickname)) { throw new ProfileException('INVALID_NICKNAME', 'Nickname must be text.'); }
            $nickname = trim($nickname);
            if (FieldCatalog::validate('nickname', $nickname) !== [] || preg_match('/[\x00-\x1F\x7F]/u', $nickname)) {
                throw new ProfileException('INVALID_NICKNAME', 'Nickname must contain 2–32 visible characters.');
            }
        }
        $hasAvatar = array_key_exists('avatar_ref', $changes);
        if ($hasAvatar && $avatarRef !== null && !is_string($avatarRef)) { throw new ProfileException('INVALID_MEDIA_REFERENCE', 'avatar_ref must be an uploaded image reference or null to remove it.'); }
        $result = $this->store->transaction(function () use ($actorId, $expectedVersion, $nickname, $avatarRef, $hasAvatar) {
            $this->access->assertWritable();
            $this->access->assertOwner($actorId, $actorId, ProfileScope::global());
            $now = self::now();
            $state = $this->store->ensureState($actorId, $now);
            $this->access->assertWritable();
            $this->access->assertOwner($actorId, $actorId, ProfileScope::global());
            if ((int)$state['identity_version'] !== $expectedVersion) {
                throw new ProfileException('VERSION_CONFLICT', 'Identity has changed; reload before saving.', 409, ['identity_version' => (int)$state['identity_version']]);
            }
            if ($avatarRef !== null) { $this->assertOwned($actorId, $avatarRef, 'avatar'); }
            if ($nickname !== null) { $this->store->saveNickname($state, $nickname, $now); }
            if ($hasAvatar) { $state['confirmed_avatar_ref'] = $avatarRef; }
            $state['identity_version'] = $expectedVersion + 1;
            $state['updated_at'] = $now;
            $this->store->saveState($state);
            $change = $nickname === null ? [] : ['nickname' => $nickname];
            if ($hasAvatar) { $change['avatar_ref'] = $avatarRef; }
            $this->store->recordChange($state, $change, $expectedVersion, $now);
            return $this->identity($actorId, $state);
        });
        $this->store->refresh($actorId);
        return $result;
    }

    public function upload(int $actorId, string $kind, string $temporaryPath): array
    {
        $this->access->assertWritable();
        $this->access->assertOwner($actorId, $actorId, ProfileScope::global());
        if (!in_array($kind, ['avatar', 'contact_qr'], true)) { throw new ProfileException('INVALID_MEDIA_KIND', 'Unsupported media kind.'); }
        $id = self::uuid();
        $metadata = $this->files->stage($temporaryPath, $kind, $id);
        $metadata['file_ref'] = 'mpr_' . $id;
        $metadata['owner_id'] = $actorId;
        $metadata['kind'] = $kind;
        try {
            $this->store->transaction(function () use ($actorId, $id, $metadata) {
                $this->access->assertWritable();
                $this->access->assertOwner($actorId, $actorId, ProfileScope::global());
                $now = self::now();
                $state = $this->store->ensureState($actorId, $now);
                $this->access->assertWritable();
                $this->access->assertOwner($actorId, $actorId, ProfileScope::global());
                $this->store->saveMedia($state, $id, $metadata, $now);
            });
        } catch (\Throwable $error) { $this->files->discard($id); throw $error; }
        return ['file_ref' => $metadata['file_ref'], 'avatar_ref' => $kind === 'avatar' ? $metadata['file_ref'] : null, 'kind' => $kind, 'width' => $metadata['width'], 'height' => $metadata['height'], 'confirmed' => false];
    }

    public function assertContactQrOwned(int $ownerId, string $fileRef): void { $this->assertOwned($ownerId, $fileRef, 'contact_qr'); }

    /** Internal adapter compensation after an enclosing transaction has rolled back. */
    public function discardRolledBackUpload(string $ref): void
    {
        if ($this->store->media($ref) !== null) { return; }
        if (preg_match('/^mpr_([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/D', $ref, $match)) { $this->files->discard($match[1]); }
    }

    public function readMedia(int $actorId, string $ref, string $variant = 'main', ?int $currentSpaceId = null, array $context = []): array
    {
        return $this->store->transaction(function () use ($actorId, $ref, $variant, $currentSpaceId, $context): array {
            $this->access->assertOwner($actorId, $actorId, ProfileScope::global());
            $media = $this->store->media($ref);
            if (!$media) { throw new ProfileException('NOT_FOUND', 'Media resource not found.', 404); }
            $ownerId = (int)$media['owner_id'];
            $this->access->assertOwner($ownerId, $ownerId, ProfileScope::global());
            $state = $this->store->state($ownerId, true);
            $this->access->assertOwner($actorId, $actorId, ProfileScope::global());
            $this->access->assertOwner($ownerId, $ownerId, ProfileScope::global());
            if ($actorId === $ownerId) { $this->readPolicy?->assertCanReadMedia($actorId, $ownerId, $media['kind'], $ref, $context); }
            if ($actorId !== $ownerId) {
                if ($media['kind'] === 'avatar') {
                    if (!$state || $state['confirmed_avatar_ref'] !== $ref || (int)$state['identity_version'] < 1) { throw new ProfileException('NOT_FOUND', 'Media resource not found.', 404); }
                    $this->readPolicy?->assertCanReadMedia($actorId, $ownerId, 'avatar', $ref, $context);
                } elseif ($this->readPolicy !== null) {
                    if ($context === []) { $context = ['entry_type' => $currentSpaceId === null ? 'friendship' : 'space', 'space_id' => $currentSpaceId, 'purpose' => 'contacts']; }
                    $this->readPolicy->assertCanReadMedia($actorId, $ownerId, $media['kind'], $ref, $context);
                } else {
                    $this->access->assertCanRead($actorId, $ownerId, ProfileScope::global(), $currentSpaceId);
                    if (!$this->store->isConfirmedQr($ownerId, $ref)) { throw new ProfileException('NOT_FOUND', 'Media resource not found.', 404); }
                }
            }
            $this->files->assertReady($media);
            return ['path' => $this->files->path($media, $variant), 'mime' => 'image/png'];
        });
    }

    private function assertOwned(int $ownerId, string $ref, string $kind): void
    {
        $media = $this->store->media($ref);
        if (!$media || (int)$media['owner_id'] !== $ownerId || $media['kind'] !== $kind) { throw new ProfileException('INVALID_MEDIA_REFERENCE', 'Use a ready image uploaded by this account.'); }
        $this->files->assertReady($media);
    }

    private function identity(int $ownerId, ?array $state): array
    {
        return ['user_id' => $ownerId, 'nickname' => $state === null ? null : $this->store->nickname($ownerId), 'identity_version' => (int)($state['identity_version'] ?? 0), 'avatar_ref' => $state['confirmed_avatar_ref'] ?? null];
    }

    private static function now(): string { return gmdate('Y-m-d H:i:s.u'); }
    public static function uuid(): string
    {
        $b = random_bytes(16); $b[6] = chr((ord($b[6]) & 15) | 64); $b[8] = chr((ord($b[8]) & 63) | 128);
        $h = bin2hex($b); return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20);
    }
}
