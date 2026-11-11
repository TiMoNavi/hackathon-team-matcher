<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\ai;
use humhub\modules\matcherRecommendation\domain\DiscoveryMatch;
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;

/** In-memory packaging, not an authorization token. Only summaries may be sent to a provider. */
final class AiCandidatePool implements \JsonSerializable
{
    /** @param list<array> $summaries @param array<string,array{match:DiscoveryMatch,facts:array,evidence:array}> $entries */
    public function __construct(
        public readonly string $contextFingerprint,
        public readonly string $intentFingerprint,
        public readonly string $policyFingerprint,
        public readonly int $maxResults,
        #[\SensitiveParameter] public readonly array $summaries,
        #[\SensitiveParameter] private readonly array $entries,
    ) {
        foreach ([$contextFingerprint, $intentFingerprint, $policyFingerprint] as $value) {
            if (!preg_match('/^[a-f0-9]{64}$/D', $value)) { throw new \InvalidArgumentException('Invalid candidate pool binding.'); }
        }
        if ($maxResults < 1 || $maxResults > 5 || !array_is_list($summaries) || count($summaries) > 24 || count($entries) !== count($summaries)) {
            throw new \InvalidArgumentException('Invalid bounded AI candidate pool.');
        }
        $seen = [];
        foreach ($summaries as $summary) {
            $id = $summary['id'] ?? null;
            if (!is_string($id) || isset($seen[$id]) || !isset($entries[$id]) || !$entries[$id]['match'] instanceof DiscoveryMatch
                || $entries[$id]['match']->candidate->targetId !== $id || strlen(self::json($summary)) > 768) {
                throw new \InvalidArgumentException('Invalid AI candidate summary binding.');
            }
            $seen[$id] = true;
        }
    }

    public function targetIds(): array { return array_column($this->summaries, 'id'); }
    public function isEmpty(): bool { return $this->summaries === []; }
    /** Core-only provenance, never the model payload. */
    public function entry(string $id): ?array { return $this->entries[$id] ?? null; }
    public function projectionFingerprints(): array
    {
        $result = [];
        foreach ($this->entries as $id => $entry) { $result[$id] = Fingerprint::of($entry['match']->candidate); }
        return $result;
    }
    /** Accidental JSON serialization still excludes complete projections and provenance maps. */
    public function jsonSerialize(): array { return $this->summaries; }
    public function __debugInfo(): array { return ['candidate_count' => count($this->summaries), 'max_results' => $this->maxResults]; }
    public function __serialize(): array { throw new \LogicException('AI candidate pools are request-local authorized data, not persisted snapshots.'); }
    public function __unserialize(#[\SensitiveParameter] array $data): void { throw new \LogicException('AI candidate pools cannot be restored from serialized data.'); }
    public static function json(#[\SensitiveParameter] mixed $value): string { return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION); }
}
