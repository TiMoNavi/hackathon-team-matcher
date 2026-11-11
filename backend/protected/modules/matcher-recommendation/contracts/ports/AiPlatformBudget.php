<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;

interface AiPlatformBudget
{
    /** Atomically reserve platform allowance before one outbound attempt. Failure must throw; never retry implicitly. */
    public function reserveAttempt(string $runId, string $stage, string $permitId): void;
}
