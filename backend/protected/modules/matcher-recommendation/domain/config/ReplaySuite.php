<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\config;
use humhub\modules\matcherRecommendation\contracts\ContractShape;
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;

final class ReplaySuite
{
    /** @param list<ReplayCase> $cases */
    public function __construct(public readonly string $version, public readonly array $cases)
    {
        ContractShape::token($version);
        if (!array_is_list($cases) || $cases === [] || count($cases) > 1000) { throw new \InvalidArgumentException('A bounded nonempty replay suite is required.'); }
        $ids = [];
        foreach ($cases as $case) {
            if (!$case instanceof ReplayCase || isset($ids[$case->id])) { throw new \InvalidArgumentException('Invalid or duplicate replay case.'); }
            $ids[$case->id] = true;
        }
    }
    public function digest(): string { return Fingerprint::of(['version' => $this->version, 'cases' => $this->cases]); }
}
