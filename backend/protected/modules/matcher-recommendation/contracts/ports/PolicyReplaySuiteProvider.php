<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\domain\config\ReplaySuite;

interface PolicyReplaySuiteProvider
{
    /**
     * Trusted, versioned synthetic cases supplied by server code, never an administrator's passed=true input.
     * Production deployment must invalidate this version when evaluator semantics/build changes, so an old
     * successful report cannot stand in for replay against a newly deployed rule engine.
     */
    public function current(): ReplaySuite;
}
