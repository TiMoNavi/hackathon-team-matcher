<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\retrieval;

use humhub\modules\matcherRecommendation\adapters\native\NativeEligibilityQuery;
use humhub\modules\matcherRecommendation\contracts\{AuthorizedIndexSnapshot, CurrentEventContext, QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\{CandidateIndexAccess, CandidateRetriever, CurrentEventAccess, ManagedCandidateIndexAccess, PolicyStore, RuleQueryValidator};
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;
use yii\db\{Expression, Query};

/** Read-only lexical/structured recall over this module's minimal, authorized derived index. */
final class SqlCandidateRetriever implements CandidateRetriever
{
    public const TERM_TABLE = '{{%matcher_recommendation_search_term}}';
    public const INTERVAL_TABLE = '{{%matcher_recommendation_search_interval}}';

    public function __construct(
        private readonly NativeEligibilityQuery $native,
        private readonly CurrentEventAccess $events,
        private readonly PolicyStore $policies,
        private readonly RuleQueryValidator $queryValidator,
        private readonly CandidateIndexAccess $indexAccess,
    ) {}

    public function recall(CurrentEventContext $context, QueryIntent $intent): array
    {
        $this->events->assertCurrent($context);
        $policy = $this->policies->current($context);
        $this->queryValidator->validateQuery($intent, $policy);
        $parameters = $policy->parameters;
        $featureAliases = [];
        foreach ($parameters['rules'] as $rule) {
            $aliases = [];
            foreach ($rule['aliases'] as $alias => $canonical) {
                $alias = strtolower(trim($alias)); $canonical = strtolower(trim($canonical));
                if ($alias !== $canonical) { $aliases[$alias] = $canonical; }
            }
            ksort($aliases, SORT_STRING);
            foreach ($rule['candidate_features'] as $feature) {
                if (isset($featureAliases[$feature]) && $featureAliases[$feature] !== $aliases) {
                    throw new \RuntimeException('This index requires one consistent alias normalization per candidate feature.');
                }
                $featureAliases[$feature] = $aliases;
            }
        }
        if (in_array('semantic', $parameters['enabled_routes'], true)) {
            throw new \RuntimeException('This SQL adapter has no authorized semantic recall provider.');
        }
        $snapshot = $this->indexAccess->acquire($context, $policy);
        try {
            if ($snapshot->spaceId !== $context->spaceId || $snapshot->contextFingerprint !== Fingerprint::of($context) || $snapshot->policyFingerprint !== Fingerprint::of($policy)) {
                throw new \UnexpectedValueException('Index snapshot belongs to a different context or policy.');
            }
            $conditions = $this->terms($intent, $parameters, $snapshot);
            $rows = []; $routeLimits = ['structured' => 80, 'fulltext' => 40];
            if ($conditions !== []) {
                foreach ($parameters['enabled_routes'] as $route) {
                    if (!isset($routeLimits[$route])) { throw new \UnexpectedValueException('Unsupported recall route.'); }
                    // Deduplicate facts before counting. Neither duplicate index rows nor native joins may
                    // increase relevance. The future index unique constraint is an additional safeguard.
                    $terms = (new Query())->select(['rt.space_id', 'rt.target_id', 'rt.feature', 'rt.term'])
                        ->from(['rt' => self::TERM_TABLE])->distinct()
                        ->where(['rt.space_id' => $context->spaceId, 'rt.generation' => $snapshot->generation, 'rt.route' => $route])
                        ->andWhere(array_merge(['or'], $conditions));
                    $eligible = $this->native->candidateQuery($context)->select(['id' => 'u.id', 'space_id' => 's.id'])->distinct();
                    foreach ($this->hardPredicates($intent, $parameters, $context, $snapshot) as $predicate) { $eligible->andWhere($predicate); }
                    $query = (new Query())->from(['eligible' => $eligible])
                        ->innerJoin(['rt' => $terms], '[[rt.target_id]] = [[eligible.id]] AND [[rt.space_id]] = [[eligible.space_id]]')
                        ->select(['id' => 'eligible.id', 'matched_terms' => new Expression('COUNT(*)')])
                        ->groupBy(['eligible.id'])
                        ->orderBy(['matched_terms' => SORT_DESC, 'eligible.id' => SORT_ASC])
                        ->limit(min($routeLimits[$route], $parameters['limits']['recall']));
                    $hits = $this->native->run($query);
                    foreach ($hits as $position => $hit) {
                        $id = (string)$hit['id'];
                        if (!preg_match('/^[1-9][0-9]*$/D', $id) || $id === (string)$context->viewerId) { throw new \UnexpectedValueException('Invalid recalled person ID.'); }
                        $rows[$id] ??= ['target_type' => 'person', 'id' => $id, 'routes' => []];
                        $rows[$id]['routes'][$route] = $position + 1;
                    }
                }
            }
            // No cached/replica authorization. A gate failure is not an empty successful search.
            $this->indexAccess->assertCurrent($context, $policy, $snapshot);
            $this->events->assertCurrent($context);
            if (Fingerprint::of($policy) !== Fingerprint::of($this->policies->current($context))) {
                throw new \RuntimeException('Recommendation policy changed during recall.');
            }
            $totalWeight = array_sum(array_intersect_key($parameters['route_weights'], array_flip($parameters['enabled_routes'])));
            $rrf = static function (array $row) use ($parameters, $totalWeight): float {
                $score = 0.0;
                foreach ($row['routes'] as $route => $rank) { $score += ($parameters['route_weights'][$route] / $totalWeight) * 61 / (60 + $rank); }
                return $score;
            };
            $rows = array_values($rows);
            usort($rows, static fn(array $a, array $b): int => ($rrf($b) <=> $rrf($a)) ?: strcmp($a['id'], $b['id']));
            return array_slice($rows, 0, $parameters['limits']['recall']);
        } finally {
            if ($this->indexAccess instanceof ManagedCandidateIndexAccess) { $this->indexAccess->release($snapshot); }
        }
    }

    /**
     * OR terms for explicit topic/contribution requirements. Missing soft preferences do not eliminate people.
     * Hard token predicates are applied independently before LIMIT; all rules are rechecked on fresh values. Index terms must
     * already be canonicalized for the bound policy; text indexing is exact lexical terms, not raw prose/AI.
     */
    private function terms(QueryIntent $intent, array $parameters, AuthorizedIndexSnapshot $snapshot): array
    {
        $rules = [];
        foreach ($parameters['rules'] as $rule) { $rules[$rule['query_feature'] . ':' . $rule['operator']] = $rule; }
        $features = [];
        foreach ($intent->conditions as $condition) {
            $rule = $rules[$condition['feature'] . ':' . $condition['operator']];
            if (!in_array($rule['dimension'], ['topic', 'contribution'], true)) { continue; }
            $values = is_string($condition['value']) ? [$condition['value']] : $condition['value'];
            $aliases = [];
            foreach ($rule['aliases'] as $alias => $canonical) { $aliases[strtolower(trim($alias))] = strtolower(trim($canonical)); }
            foreach ($values as $value) {
                $value = strtolower(trim($value)); $value = $aliases[$value] ?? $value;
                foreach ($rule['candidate_features'] as $feature) { $features[$feature]['t:' . $value] = $this->encode($value, $snapshot); }
            }
        }
        $conditions = []; ksort($features, SORT_STRING);
        foreach ($features as $feature => $terms) {
            $terms = array_values($terms); sort($terms, SORT_STRING);
            $conditions[] = ['rt.feature' => $feature, 'rt.term' => $terms];
        }
        return $conditions;
    }

    /** Every original hard condition retains its own feature sources and aliases, before any route limit. */
    private function hardPredicates(QueryIntent $intent, array $parameters, CurrentEventContext $context, AuthorizedIndexSnapshot $snapshot): array
    {
        $rules = [];
        foreach ($parameters['rules'] as $rule) { $rules[$rule['query_feature'] . ':' . $rule['operator']] = $rule; }
        $predicates = [];
        foreach ($intent->conditions as $condition) {
            if ($condition['strength'] !== 'hard') { continue; }
            $rule = $rules[$condition['feature'] . ':' . $condition['operator']];
            if ($rule['operator'] === 'interval_overlap') {
                array_push($predicates, ...$this->intervalPredicates($condition['value'], $rule['candidate_features'], $context, $snapshot));
                continue;
            }
            $aliases = [];
            foreach ($rule['aliases'] as $alias => $canonical) { $aliases[strtolower(trim($alias))] = strtolower(trim($canonical)); }
            $values = is_string($condition['value']) ? [$condition['value']] : $condition['value'];
            $tokens = [];
            foreach ($values as $value) { $value = strtolower(trim($value)); $tokens['t:' . ($aliases[$value] ?? $value)] = $this->encode($aliases[$value] ?? $value, $snapshot); }
            // Explicit preferences name alternatives (OR); all requested similarity/contribution tokens must be present.
            $sets = $rule['operator'] === 'explicit_preference' ? [array_values($tokens)] : array_map(static fn(string $token): array => [$token], array_values($tokens));
            foreach ($sets as $wanted) {
                $exists = (new Query())->select(new Expression('1'))->from(['hard_term' => self::TERM_TABLE])
                    ->where(['hard_term.generation' => $snapshot->generation, 'hard_term.space_id' => $context->spaceId, 'hard_term.route' => 'structured', 'hard_term.feature' => $rule['candidate_features'], 'hard_term.term' => $wanted])
                    ->andWhere('[[hard_term.target_id]] = [[u.id]]');
                $predicates[] = ['exists', $exists];
            }
        }
        return $predicates;
    }

    /**
     * Full union coverage, not merely any overlap. A finite union covers [start,end] iff
     * it covers the start and every interval endpoint inside the request is continued
     * by another interval. This also merges touching/overlapping pieces across the
     * rule's configured candidate features, without a recursive query or pre-LIMIT cap.
     * Inputs have already passed the pure evaluator's strict ISO/date validation.
     */
    private function intervalPredicates(array $intervals, array $features, CurrentEventContext $context, AuthorizedIndexSnapshot $snapshot): array
    {
        $wanted = [];
        foreach ($intervals as $interval) {
            $wanted[] = [(float)(new \DateTimeImmutable($interval['starts_at']))->format('U.u'), (float)(new \DateTimeImmutable($interval['ends_at']))->format('U.u')];
        }
        usort($wanted, static fn(array $a, array $b): int => ($a[0] <=> $b[0]) ?: ($a[1] <=> $b[1]));
        $merged = [];
        foreach ($wanted as $interval) {
            $last = count($merged) - 1;
            if ($last >= 0 && $interval[0] <= $merged[$last][1]) { $merged[$last][1] = max($merged[$last][1], $interval[1]); }
            else { $merged[] = $interval; }
        }
        $predicates = [];
        foreach ($merged as [$start, $end]) {
            // Preserve microseconds when PDO binds a float as text under PHP's precision setting.
            $start = sprintf('%.6F', $start); $end = sprintf('%.6F', $end);
            $first = $this->intervalQuery('first_interval', $features, $context, $snapshot)
                ->andWhere(['<=', 'first_interval.starts_at', $start])
                ->andWhere(['>', 'first_interval.ends_at', $start]);
            $continuation = $this->intervalQuery('next_interval', $features, $context, $snapshot)
                ->andWhere('[[next_interval.starts_at]] <= [[gap_interval.ends_at]]')
                ->andWhere('[[next_interval.ends_at]] > [[gap_interval.ends_at]]');
            $gap = $this->intervalQuery('gap_interval', $features, $context, $snapshot)
                ->andWhere(['>', 'gap_interval.ends_at', $start])
                ->andWhere(['<', 'gap_interval.ends_at', $end])
                ->andWhere(['not exists', $continuation]);
            $predicates[] = ['exists', $first];
            $predicates[] = ['not exists', $gap];
        }
        return $predicates;
    }

    private function intervalQuery(string $alias, array $features, CurrentEventContext $context, AuthorizedIndexSnapshot $snapshot): Query
    {
        return (new Query())->select(new Expression('1'))->from([$alias => self::INTERVAL_TABLE])
            ->where([$alias . '.generation' => $snapshot->generation, $alias . '.space_id' => $context->spaceId, $alias . '.feature' => $features])
            ->andWhere('[[' . $alias . '.target_id]] = [[u.id]]');
    }

    private function encode(string $value, AuthorizedIndexSnapshot $snapshot): string
    {
        return $snapshot->termEncoding === 'sha256' ? hash('sha256', $value) : $value;
    }
}
