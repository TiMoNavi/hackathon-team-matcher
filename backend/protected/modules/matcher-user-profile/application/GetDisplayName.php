<?php
declare(strict_types=1);

namespace humhub\modules\matcherProfile\application;

use humhub\modules\matcherProfile\domain\DisplayName;
use humhub\modules\matcherProfile\domain\ports\ConfirmedIdentityReader;

final class GetDisplayName
{
    public function __construct(private readonly ConfirmedIdentityReader $identities) {}

    public function execute(int $ownerId, string $guid): string
    {
        $identity = $this->identities->read($ownerId);
        return DisplayName::resolve($guid, $identity['nickname'], $identity['identity_version'], $identity['confirmed']);
    }
}
