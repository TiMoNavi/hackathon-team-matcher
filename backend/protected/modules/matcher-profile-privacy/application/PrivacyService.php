<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\application;

use humhub\modules\matcherPrivacy\domain\VisibilityPolicy;
use humhub\modules\matcherProfile\application\ProfileService;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ports\ProfileRepository;

/** Ordinary profile privacy is usable independently from onboarding or AI. */
final class PrivacyService
{
    public function __construct(private ProfileService $profiles, private ProfileReadPolicy $readPolicy, private ProfileRepository $repository, private VisibilityPolicy $visibility = new VisibilityPolicy()) {}

    public function read(int $viewerId, int $ownerId, ProfileScope $scope, array $context): array
    {
        return $this->repository->transaction(function () use ($viewerId, $ownerId, $scope, $context): array {
            $profile = $this->profiles->getProfile($viewerId, $ownerId, $scope, $context['space_id'] ?? null, $context);
            return $this->readPolicy->projectProfile($viewerId, $ownerId, $scope, $profile, $context);
        });
    }

    public function contacts(int $viewerId, int $ownerId, array $context): array
    {
        $context['purpose'] = 'contacts';
        return $this->read($viewerId, $ownerId, ProfileScope::global(), $context);
    }

    public function preview(int $ownerId, ProfileScope $scope, string $perspective = 'owner', ?string $draftId = null): array
    {
        if (!in_array($perspective, ['owner', 'authenticated', 'friends'], true)) { throw new ProfileException('INVALID_PREVIEW', 'Use owner, authenticated or friends.'); }
        return $this->repository->transaction(function () use ($ownerId, $scope, $perspective, $draftId): array {
            $profile = $this->profiles->getProfile($ownerId, $ownerId, $scope);
            if ($draftId !== null) {
                $draft = $this->profiles->getDraft($ownerId, $ownerId, $scope, $draftId);
                $profile['attributes'] = $draft['preview_attributes'];
                $profile['revision'] = $draft['current_revision'];
            }
            return [
                'profile' => $this->visibility->project($profile, $perspective, 'detail', $draftId !== null),
                'contacts' => $this->visibility->project($profile, $perspective, 'contacts', $draftId !== null),
                'perspective' => $perspective, 'simulated' => true, 'draft_id' => $draftId,
                'base_revision' => $draft['base_revision'] ?? $profile['revision'],
            ];
        });
    }

    public function changeVisibility(int $ownerId, ProfileScope $scope, int $expectedRevision, array $changes): array
    {
        return $this->profiles->setVisibilities($ownerId, $ownerId, $scope, $expectedRevision, $changes);
    }
}
