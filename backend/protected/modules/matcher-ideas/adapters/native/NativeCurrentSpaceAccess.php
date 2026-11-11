<?php
declare(strict_types=1);
namespace humhub\modules\matcherIdeas\adapters\native;
use humhub\modules\matcherIdeas\domain\ports\CurrentSpaceAccess;
use humhub\modules\matcherRecommendation\contracts\ports\CurrentEventAccess;
final class NativeCurrentSpaceAccess implements CurrentSpaceAccess
{
    public function __construct(private CurrentEventAccess $events) {}
    public function stamp(int $viewerId, int $requestedSpaceId): string
    { return $this->events->resolve($viewerId, $requestedSpaceId)->accessVersion; }
}
