<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\memory;

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ports\ProfileResourcePolicy;

final class InMemoryProfileResourcePolicy implements ProfileResourcePolicy
{
    public array $resources = [];
    public function assertContactQrOwned(int $ownerId, string $fileRef): void
    {
        $resource = $this->resources[$fileRef] ?? [];
        if (($resource['owner_id'] ?? null) !== $ownerId || ($resource['kind'] ?? null) !== 'contact_qr' || ($resource['ready'] ?? false) !== true) {
            throw new ProfileException('PROFILE_RESOURCE_INVALID', 'The contact QR resource is not a ready image owned by this user.', 422);
        }
    }
}
