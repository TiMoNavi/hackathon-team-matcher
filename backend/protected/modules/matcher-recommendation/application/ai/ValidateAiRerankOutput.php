<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\application\ai;
use humhub\modules\matcherRecommendation\domain\MatchReason;
use humhub\modules\matcherRecommendation\domain\ai\{AiCandidatePool, AiRankedCandidate, AiRecommendationException};

/** Only validates a provider's selection. The run owner must reauthorize the whole pool again before publish. */
final class ValidateAiRerankOutput
{
    /** @return list<AiRankedCandidate> */
    public function validate(#[\SensitiveParameter] AiCandidatePool $pool, #[\SensitiveParameter] array $output): array
    {
        try {
            if ($pool->isEmpty() || !array_is_list($output) || count($output) > $pool->maxResults) { throw new \InvalidArgumentException('Invalid output size.'); }
            $seen = []; $result = []; $sent = [];
            foreach ($pool->summaries as $summary) { $sent[$summary['id']] = $summary; }
            foreach ($output as $rank => $row) {
                if (!is_array($row)) { throw new \InvalidArgumentException('Invalid output row.'); }
                $keys = array_keys($row); sort($keys, SORT_STRING);
                if ($keys !== ['evidence_ids', 'id', 'target_type'] || $row['target_type'] !== 'person' || !is_string($row['id']) || isset($seen[$row['id']])) { throw new \InvalidArgumentException('Invalid output identity.'); }
                $entry = $pool->entry($row['id']);
                if ($entry === null || !is_array($row['evidence_ids']) || !array_is_list($row['evidence_ids']) || $row['evidence_ids'] === []) { throw new \InvalidArgumentException('Invalid cited evidence.'); }
                $actualSent = []; $sentFacts = [];
                foreach ($sent[$row['id']]['facts'] ?? [] as $fact) {
                    foreach ($fact['evidence_ids'] as $alias) { $actualSent[$alias] = true; }
                    $sentFacts[AiCandidatePool::json($fact)] = true;
                }
                $aliases = [];
                foreach ($row['evidence_ids'] as $alias) {
                    if (!is_string($alias) || !preg_match('/^e-[a-f0-9]{64}$/D', $alias) || isset($aliases[$alias]) || !isset($entry['evidence'][$alias]) || !isset($actualSent[$alias])) { throw new \InvalidArgumentException('Evidence was not sent for this person.'); }
                    $aliases[$alias] = true;
                }
                $positive = false; $reasons = [];
                foreach ($entry['facts'] as $fact) {
                    if (array_diff($fact['evidence_ids'], array_keys($aliases)) !== [] || !isset($sentFacts[AiCandidatePool::json(['text' => $fact['text'], 'evidence_ids' => $fact['evidence_ids']])])) { continue; }
                    $positive = $positive || $fact['positive']; $references = [];
                    foreach ($fact['evidence_ids'] as $alias) { array_push($references, ...$entry['evidence'][$alias]); }
                    $reasons[] = new MatchReason('ai_evidence_' . $fact['feature'], '本次排序参考已确认事实：' . $fact['text'] . '。', $references);
                }
                if (!$positive || $reasons === []) { throw new \InvalidArgumentException('At least one actual positive topic or contribution fact is required.'); }
                $seen[$row['id']] = true;
                $result[] = new AiRankedCandidate('person', $row['id'], $entry['match']->assessment->sortScore, $rank + 1, array_keys($aliases), $reasons);
            }
            return $result;
        } catch (\Throwable) { throw new AiRecommendationException('invalid_model_output'); }
    }
}
