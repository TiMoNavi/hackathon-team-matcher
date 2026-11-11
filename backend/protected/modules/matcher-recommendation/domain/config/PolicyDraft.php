<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\config;
use humhub\modules\matcherRecommendation\contracts\ContractShape;
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;
use humhub\modules\matcherRecommendation\domain\RulePolicy;

/** Internal immutable revision; only PolicyLifecycle may create validation/replay state at an API boundary. */
final class PolicyDraft
{
    public function __construct(
        public readonly string $id,
        public readonly int $revision,
        public readonly array $parameters,
        public readonly ?string $validatedDigest = null,
        public readonly ?string $catalogDigest = null,
        public readonly ?ReplayReport $replay = null,
    ) {
        ContractShape::token($id); ContractShape::jsonValue($parameters);
        if ($revision < 1) { throw new \InvalidArgumentException('Invalid draft revision.'); }
    }
    public function digest(): string { return Fingerprint::of($this->parameters); }
    /** A rollback restores parameters under a new publication identity; it cannot revive old batches. */
    public function policy(): RulePolicy { return new RulePolicy('policy-' . Fingerprint::of([$this->id, $this->revision, $this->digest()]), $this->parameters); }
}
