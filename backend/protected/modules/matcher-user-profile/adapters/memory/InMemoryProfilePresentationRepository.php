<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\memory;
use humhub\modules\matcherProfile\domain\ports\ProfilePresentationRepository;
use humhub\modules\matcherProfile\domain\ProfileException;
final class InMemoryProfilePresentationRepository implements ProfilePresentationRepository
{
    public array $rows = [];
    public array $nativePrimaryIds = [];
    public function read(int $ownerId): array
    { return $this->rows[$ownerId] ?? ['version' => 0, 'education_attribute_id' => null, 'primary_portfolio_attribute_id' => $this->nativePrimaryIds[$ownerId] ?? null]; }
    public function save(int $ownerId, int $expectedVersion, ?string $educationId, ?string $portfolioId): array
    {
        if ($this->read($ownerId)['version'] !== $expectedVersion) { throw new ProfileException('PRESENTATION_CONFLICT', 'Presentation settings changed.', 409); }
        return $this->rows[$ownerId] = ['version' => $expectedVersion + 1, 'education_attribute_id' => $educationId, 'primary_portfolio_attribute_id' => $portfolioId];
    }
}
