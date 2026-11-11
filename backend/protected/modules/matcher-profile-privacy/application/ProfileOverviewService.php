<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\application;
use humhub\modules\matcherPrivacy\domain\ports\CurrentProfileEntry;
use humhub\modules\matcherProfile\domain\{ProfileException, ProfileScope};
use humhub\modules\matcherProfile\domain\ports\ProfilePresentationRepository;
final class ProfileOverviewService
{
    public function __construct(private PrivacyService $profiles, private ProfilePresentationRepository $presentation, private CurrentProfileEntry $entry) {}
    public function read(int $viewerId, int $ownerId, int $spaceId): array
    {
        $before = $this->entry->resolve($viewerId, $ownerId, $spaceId);
        $settings = $this->presentation->read($ownerId);
        $context = ['entry_type' => 'space', 'space_id' => $spaceId, 'purpose' => 'detail'];
        $global = $this->profiles->read($viewerId, $ownerId, ProfileScope::global(), $context);
        $space = $this->profiles->read($viewerId, $ownerId, ProfileScope::event($spaceId), $context);
        // Re-read the projections as well as the access facts; field revocation must never race a mixed overview.
        if ($global !== $this->profiles->read($viewerId, $ownerId, ProfileScope::global(), $context)
            || $space !== $this->profiles->read($viewerId, $ownerId, ProfileScope::event($spaceId), $context)
            || $settings !== $this->presentation->read($ownerId)
            || $before !== $this->entry->resolve($viewerId, $ownerId, $spaceId)) {
            throw new ProfileException('PROFILE_OVERVIEW_CHANGED', 'Profile data or access changed during the read. Retry.', 409);
        }
        $school = null; $primary = null; $additional = [];
        foreach ($global['attributes'] as $attribute) {
            if ($attribute['key'] === 'education' && $attribute['attribute_id'] === $settings['education_attribute_id']) { $school = $attribute; }
            if ($attribute['key'] === 'portfolio_link') {
                if ($attribute['attribute_id'] === $settings['primary_portfolio_attribute_id']) { $primary = $attribute; }
                else { $additional[] = $attribute; }
            }
        }
        return ['owner_id' => $ownerId, 'space_id' => $spaceId, 'global' => $global, 'space' => $space, 'school_overview' => $school, 'primary_portfolio_link' => $primary, 'additional_portfolio_links' => $additional, 'presentation_version' => $settings['version'], 'policy_version' => 'profile-overview-v1'];
    }
}
