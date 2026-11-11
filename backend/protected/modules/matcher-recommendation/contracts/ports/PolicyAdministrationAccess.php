<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;

interface PolicyAdministrationAccess
{
    /** Revalidate current server-side management permission. An actor ID is not authorization. */
    public function assertCanManage(int $actorId): void;
}
