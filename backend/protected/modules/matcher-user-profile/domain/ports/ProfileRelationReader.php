<?php
declare(strict_types=1);

namespace humhub\modules\matcherProfile\domain\ports;

use humhub\modules\matcherProfile\domain\RelationAccessContext;

/**
 * Implementations must intersect owner sharing choices, object access,
 * formal activity membership and the verified entry before pagination. Group titles or
 * participant counts cannot identify an IdeaActivity; message bodies are never summaries.
 */
interface ProfileRelationReader
{
    /** @return array{items:list<array{kind:string,id:string,title:string,summary:?string,href:string,event_id:?string,membership_role:?string}>,next_cursor:?string} */
    public function read(RelationAccessContext $context, string $kind, ?string $cursor = null, int $limit = 24): array;
}
