<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\application;

use humhub\modules\matcherPrivacy\domain\ReadContext;
use humhub\modules\matcherPrivacy\domain\VisibilityPolicy;
use humhub\modules\matcherPrivacy\domain\ports\ProfileRelations;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ports\ProfileReadPolicy as ReadPolicyPort;
use humhub\modules\matcherProfile\domain\ports\ProfileRepository;

/** Revalidates the entry and live relationships before projecting confirmed attributes. */
final class ProfileReadPolicy implements ReadPolicyPort
{
    public function __construct(private ProfileRelations $relations, private ProfileRepository $repository, private VisibilityPolicy $visibility = new VisibilityPolicy()) {}

    public function assertCanRead(int $viewerId, int $ownerId, ProfileScope $scope, array $context): void
    {
        $entry = ReadContext::fromArray($context);
        $this->activePair($viewerId, $ownerId);
        if ($viewerId === $ownerId) {
            if ($scope->spaceId !== null && !$this->relations->isSpaceMember($ownerId, $scope->spaceId)) { $this->denied(); }
            return;
        }
        if ($entry->entryType === 'identity' || $entry->purpose === 'identity' || $entry->entryType === 'self') { $this->denied(); }
        if (in_array($entry->purpose, ['summary', 'discovery'], true) && $entry->entryType !== 'space') { $this->denied(); }
        if ($scope->spaceId !== null) {
            if ($entry->spaceId !== $scope->spaceId || !$this->bothMembers($viewerId, $ownerId, $scope->spaceId)) { $this->denied(); }
        }
        $valid = match ($entry->entryType) {
            'space' => $entry->spaceId !== null && $this->bothMembers($viewerId, $ownerId, $entry->spaceId),
            'friendship' => $this->relations->areFriends($viewerId, $ownerId),
            'public_post' => $entry->postId !== null && $this->relations->canAccessPostAuthor($viewerId, $ownerId, $entry->postId),
            default => false,
        };
        if (!$valid) { $this->denied(); }
    }

    public function projectProfile(int $viewerId, int $ownerId, ProfileScope $scope, array $profile, array $context): array
    {
        $this->assertCanRead($viewerId, $ownerId, $scope, $context);
        $entry = ReadContext::fromArray($context);
        $perspective = $viewerId === $ownerId ? 'owner' : ($this->relations->areFriends($viewerId, $ownerId) ? 'friends' : 'authenticated');
        return $this->visibility->project($profile, $perspective, $entry->purpose);
    }

    public function assertCanReadMedia(int $viewerId, int $ownerId, string $kind, string $ref, array $context): void
    {
        $this->activePair($viewerId, $ownerId);
        if ($viewerId === $ownerId) { return; }
        if ($kind === 'avatar') {
            // Avatar ownership/current identity reference is checked by IdentityService under the state lock.
            // A signed-in native author card can load its opaque confirmed identity resource without profile access.
            if ($context === []) { $context = ['entry_type' => 'identity', 'purpose' => 'identity']; }
            $entry = ReadContext::fromArray($context);
            if ($entry->entryType !== 'identity') { $this->assertCanRead($viewerId, $ownerId, ProfileScope::global(), $context); }
            return;
        }
        if ($kind !== 'contact_qr') { $this->denied(); }
        $context['purpose'] = 'contacts';
        $this->assertCanRead($viewerId, $ownerId, ProfileScope::global(), $context);
        $state = $this->repository->findState($ownerId, ProfileScope::global());
        $profile = ['attributes' => $state === null ? [] : $this->repository->currentAttributes($state['id'])];
        $visible = $this->projectProfile($viewerId, $ownerId, ProfileScope::global(), $profile, $context);
        foreach ($visible['attributes'] as $item) {
            if ($item['key'] === 'contact_wechat_qr' && ($item['value']['file_ref'] ?? null) === $ref) { return; }
        }
        throw new ProfileException('NOT_FOUND', 'Media resource not found.', 404);
    }

    private function activePair(int $viewerId, int $ownerId): void
    {
        $this->relations->assertActive($viewerId);
        $this->relations->assertActive($ownerId);
        if ($viewerId !== $ownerId && $this->relations->isBlocked($viewerId, $ownerId)) { $this->denied(); }
    }
    private function bothMembers(int $viewerId, int $ownerId, int $spaceId): bool
    {
        return $this->relations->isSpaceMember($viewerId, $spaceId) && $this->relations->isSpaceMember($ownerId, $spaceId);
    }
    private function denied(): never { throw new ProfileException('PROFILE_ACCESS_DENIED', 'This profile is unavailable through the supplied entry.', 403); }
}
