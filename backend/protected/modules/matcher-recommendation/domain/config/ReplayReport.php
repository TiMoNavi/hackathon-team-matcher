<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\config;

/** Service-generated execution evidence. Reports are never accepted as public API input. */
final class ReplayReport
{
    /** @param list<array{id:string,passed:bool,qualifies:?bool,score:?float,reason_count:int,error:?string}> $assertions */
    public function __construct(
        public readonly string $draftId,
        public readonly int $draftRevision,
        public readonly string $policyDigest,
        public readonly string $catalogDigest,
        public readonly string $suiteVersion,
        public readonly string $suiteDigest,
        public readonly array $assertions,
    ) {}
    public function passed(): bool
    {
        if ($this->assertions === []) { return false; }
        foreach ($this->assertions as $assertion) { if (($assertion['passed'] ?? null) !== true) { return false; } }
        return true;
    }
}
