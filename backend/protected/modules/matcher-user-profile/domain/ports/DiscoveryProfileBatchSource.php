<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\ports;

use humhub\modules\matcherProfile\domain\DiscoveryProfileBatchRequest;

/**
 * Internal data boundary, not a public authorization API. Caller must authorize the viewer/current
 * Space and requested subjects before and after reading. Read only confirmed/authenticated ordinary
 * attributes for requested keys, from global and the one current Space; no drafts or contacts.
 * Implementations batch storage access and reject a changing state/version rather than retrying
 * indefinitely or returning a false empty success. No source may manufacture subject eligibility.
 */
interface DiscoveryProfileBatchSource
{
    /** @return array{schema_version:int,profiles:array<int,array{scopes:array,identity_version:int}>} */
    public function read(DiscoveryProfileBatchRequest $request): array;
}
