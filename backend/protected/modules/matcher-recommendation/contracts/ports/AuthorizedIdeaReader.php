<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;

interface AuthorizedIdeaReader
{
    /**
     * Revalidate current Space and allowed query purpose. A current_idea context is NOT a candidate collection.
     * Explicit confirmed gaps only; do not invent team membership/capacity or read others' private background.
     * @return array{idea_id:string,space_id:int,features:array,revision:int,permission_version:int}
     */
    public function read(CurrentEventContext $context, string $ideaId): array;
}
