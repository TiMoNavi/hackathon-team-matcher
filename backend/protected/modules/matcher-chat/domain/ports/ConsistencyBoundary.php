<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain\ports;

interface ConsistencyBoundary
{
    /**
     * All AccessReader and ReadRepository operations must share this boundary.
     * A production adapter must lock/recheck authority and roll back read-state on
     * any exception. A repeatable-read snapshot alone cannot prevent revocation races.
     */
    public function run(callable $operation): mixed;
}
