<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\application;
use humhub\modules\matcherProfile\domain\{ProfileException, ProfileScope};
use humhub\modules\matcherProfile\domain\ports\{ProfileAccessPolicy, ProfileRepository, ProfilePresentationRepository};

final class ProfilePresentationService
{
    public function __construct(private ProfileRepository $profiles, private ProfilePresentationRepository $settings, private ProfileAccessPolicy $access) {}
    public function read(int $ownerId): array
    {
        $this->access->assertOwner($ownerId, $ownerId, ProfileScope::global());
        return $this->settings->read($ownerId);
    }
    public function save(int $ownerId, int $expectedVersion, ?string $educationId, ?string $portfolioId): array
    {
        if ($expectedVersion < 0) { throw new ProfileException('INVALID_VERSION', 'Provide a non-negative expected_version.'); }
        return $this->profiles->transaction(function () use ($ownerId, $expectedVersion, $educationId, $portfolioId): array {
            $this->access->assertOwner($ownerId, $ownerId, ProfileScope::global());
            $this->access->assertWritable();
            $state = $this->profiles->findState($ownerId, ProfileScope::global(), true);
            $attributes = $state === null ? [] : $this->profiles->currentAttributes($state['id']);
            foreach (['education' => $educationId, 'portfolio_link' => $portfolioId] as $key => $id) {
                if ($id === null) { continue; }
                $matches = array_filter($attributes, static fn(array $a): bool => $a['attribute_id'] === $id && $a['key'] === $key && $a['confirmation'] === 'confirmed');
                if (count($matches) !== 1) { throw new ProfileException('INVALID_PRESENTATION_SELECTION', 'Select an existing confirmed global attribute of the requested kind.'); }
            }
            $this->access->assertOwner($ownerId, $ownerId, ProfileScope::global());
            $saved = $this->settings->save($ownerId, $expectedVersion, $educationId, $portfolioId);
            $this->access->assertOwner($ownerId, $ownerId, ProfileScope::global());
            return $saved;
        });
    }
}
