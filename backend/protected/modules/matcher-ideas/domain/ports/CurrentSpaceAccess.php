<?php
declare(strict_types=1);
namespace humhub\modules\matcherIdeas\domain\ports;
interface CurrentSpaceAccess
{
    /** Resolves a server-selected, currently authorized Space and returns its permission stamp. */
    public function stamp(int $viewerId, int $requestedSpaceId): string;
}
