<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\ports;

/** Only display references are stored; field values remain authoritative in ProfileRepository. */
interface ProfilePresentationRepository
{
    /** Missing settings have version 0; the existing native homepage binding is the initial primary. */
    public function read(int $ownerId): array;
    /** Atomic compare-and-swap, including concurrent first saves. */
    public function save(int $ownerId, int $expectedVersion, ?string $educationId, ?string $portfolioId): array;
}
