<?php
declare(strict_types=1);
namespace humhub\modules\matcherIdeas\adapters\memory;
use humhub\modules\matcherIdeas\domain\{IdeaException};
use humhub\modules\matcherIdeas\domain\ports\CurrentSpaceAccess;
final class InMemoryCurrentSpaceAccess implements CurrentSpaceAccess
{
    public array $selected = [];
    public int $revision = 1;
    public function stamp(int $viewerId, int $requestedSpaceId): string
    {
        if (($this->selected[$viewerId] ?? null) !== $requestedSpaceId) { throw new IdeaException('CURRENT_EVENT_MISMATCH', 'Select the current Space first.', 409); }
        return $viewerId . ':' . $requestedSpaceId . ':' . $this->revision;
    }
}
