<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\ports;
/** Provider returns owner-only structured source text, never confirmed/public profile data. */
interface ProfileSourceReader
{
    public function kind(): string;
    /** Local capability and verified-identity check. Must not fetch remote sources. */
    public function status(int $ownerId): array;
    /** The adapter receives only server-constructed input. No arbitrary source identity. */
    public function read(int $ownerId, array $input): array;
}
