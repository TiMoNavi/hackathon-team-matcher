<?php
declare(strict_types=1);
namespace humhub\modules\matcherGithubImport\domain\ports;

interface GithubIdentity
{
    /** Local verified association only. Never invokes OAuth or fetches user attributes. */
    public function status(int $ownerId): array;
}
