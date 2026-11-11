<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\native;

/** Server-owned selection only. Implementations must not read event_id, cguid or other request inputs. */
interface ServerSelectionSource
{
    /** @return array{actor_id:int,space_id:int,selection_revision:string} */
    public function read(): array;
}
