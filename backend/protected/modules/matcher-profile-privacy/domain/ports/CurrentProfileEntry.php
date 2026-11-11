<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\domain\ports;
interface CurrentProfileEntry
{
    /** Re-resolve the server selection, active accounts, both memberships, blocks and owner discovery opt-in. */
    public function resolve(int $viewerId, int $ownerId, int $spaceId): array;
}
