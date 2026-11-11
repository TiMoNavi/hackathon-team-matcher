<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\native;

/** Server-owned authenticated identity. This interface must never be implemented using request actor/session hints. */
interface ServerActorSessionSource
{
    /** @return array{actor_id:int,session_hash:string} No raw session credential leaves this boundary. */
    public function read(): array;
}
