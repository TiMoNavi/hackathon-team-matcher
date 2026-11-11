<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\index;

use humhub\modules\matcherRecommendation\adapters\native\NativeEligibilityQuery;
use humhub\modules\matcherRecommendation\contracts\{AuthorizedIndexSnapshot, CandidateProjection, CandidateRequest, ContractShape, CurrentEventContext};
use humhub\modules\matcherRecommendation\contracts\ports\{CandidateProjectionReader, Clock, CurrentEventAccess, ManagedCandidateIndexAccess, PolicyStore};
use humhub\modules\matcherRecommendation\adapters\time\SystemClock;
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\domain\config\{Fingerprint, PolicyValidator};
use yii\db\{Connection, PdoValue, Query};

/**
 * A fresh request-owned generation, never a reusable authorization cache. Every candidate is read
 * through the authorized batch port; no profile/contact/raw-source tables are queried here.
 * Before returning recall, assertCurrent repeats the complete observation. This detects committed
 * changes visible to those reads; it does not claim an atomic cross-batch snapshot or monotonic epoch.
 */
final class SqlCandidateIndexAccess implements ManagedCandidateIndexAccess
{
    /** @var array<string,array{snapshot:AuthorizedIndexSnapshot,source:string,index:string,created:int,expires:int}> */
    private array $active = [];
    private readonly Clock $clock;
    /** @var \WeakMap<AuthorizedIndexSnapshot,bool> */
    private \WeakMap $released;

    public function __construct(
        private readonly Connection $db,
        private readonly NativeEligibilityQuery $native,
        private readonly CurrentEventAccess $events,
        private readonly CandidateProjectionReader $projections,
        private readonly PolicyStore $policies,
        private readonly string $sourcePurposeVersion,
        private readonly int $maxSubjects = 2000,
        private readonly int $maxIndexRows = 250000,
        ?Clock $clock = null,
        private readonly int $leaseSeconds = 300,
    ) {
        ContractShape::token($sourcePurposeVersion);
        if ($maxSubjects < 1 || $maxSubjects > 2000 || $maxIndexRows < 1 || $maxIndexRows > 250000) { throw new \InvalidArgumentException('Complete-build limits may only narrow the supported bounds.'); }
        if ($leaseSeconds < 1 || $leaseSeconds > 900) { throw new \InvalidArgumentException('Index lifetime must be between 1 and 900 seconds.'); }
        $this->clock = $clock ?? new SystemClock();
        $this->released = new \WeakMap();
    }

    public function acquire(CurrentEventContext $context, RulePolicy $policy): AuthorizedIndexSnapshot
    {
        $snapshot = null;
        try {
            $aliases = $this->aliases($policy);
            $created = IndexLeaseTime::microseconds($this->clock->now());
            if ($created > PHP_INT_MAX - $this->leaseSeconds * 1000000) { throw new CandidateIndexException('dependency_unavailable'); }
            $expires = $created + $this->leaseSeconds * 1000000;
            $generation = 'g-' . bin2hex(random_bytes(24));
            $snapshot = new AuthorizedIndexSnapshot($generation, $context->spaceId, Fingerprint::of($context), Fingerprint::of($policy), $this->sourcePurposeVersion, 'sha256');
            $captured = $this->capture($context, $policy, $aliases, $generation);
            $this->assertDeadline($created, $expires);
            $this->publish($generation, $created, $expires, $captured['terms'], $captured['intervals']);
            // Register immediately after commit, so failures in the final current-context check clean up.
            $this->active[$generation] = ['snapshot' => $snapshot, 'source' => $captured['source'], 'index' => self::rowsFingerprint($captured['terms'], $captured['intervals']), 'created' => $created, 'expires' => $expires];
            $this->assertRequest($context, $policy);
            $this->assertLease($snapshot, $this->active[$generation]);
            return $snapshot;
        } catch (\Throwable $error) {
            if ($snapshot !== null && isset($this->active[$snapshot->generation])) { $this->release($snapshot); }
            // Reconstruct at the public boundary. Passing the original exception into a throwing
            // helper could retain it in trace arguments when zend.exception_ignore_args is off.
            throw new CandidateIndexException($error instanceof CandidateIndexException ? $error->reason : 'dependency_unavailable');
        }
    }

    public function assertCurrent(CurrentEventContext $context, RulePolicy $policy, AuthorizedIndexSnapshot $snapshot): void
    {
        try {
            $entry = $this->owned($snapshot);
            $this->assertLease($snapshot, $entry);
            if ($snapshot->spaceId !== $context->spaceId || $snapshot->contextFingerprint !== Fingerprint::of($context)
                || $snapshot->policyFingerprint !== Fingerprint::of($policy) || $snapshot->sourcePurposeVersion !== $this->sourcePurposeVersion
                || $snapshot->termEncoding !== 'sha256') { throw new CandidateIndexException('snapshot_invalid'); }
            $captured = $this->capture($context, $policy, $this->aliases($policy));
            if ($captured['source'] !== $entry['source']) { throw new CandidateIndexException('source_changed'); }
            $terms = $this->native->run((new Query())->from(CandidateIndexSchema::TERM_TABLE)->where(['generation' => $snapshot->generation])->limit($this->maxIndexRows + 1));
            $intervals = $this->intervalRows((new Query())->from(CandidateIndexSchema::INTERVAL_TABLE)->where(['generation' => $snapshot->generation])->limit($this->maxIndexRows + 1));
            if (count($terms) + count($intervals) > $this->maxIndexRows || self::rowsFingerprint($terms, $intervals) !== $entry['index']) {
                throw new CandidateIndexException('index_changed');
            }
            $this->assertRequest($context, $policy);
            $this->assertLease($snapshot, $entry);
        } catch (\Throwable $error) { throw new CandidateIndexException($error instanceof CandidateIndexException ? $error->reason : 'dependency_unavailable'); }
    }

    public function release(AuthorizedIndexSnapshot $snapshot): void
    {
        if (isset($this->released[$snapshot])) { return; }
        $this->owned($snapshot);
        try {
            $this->write(function (Connection $db) use ($snapshot): void {
                // Use the same header -> children lock order as maintenance cleanup.
                $db->createCommand()->delete(CandidateIndexLifecycleSchema::TABLE, ['generation' => $snapshot->generation])->execute();
                $db->createCommand()->delete(CandidateIndexSchema::TERM_TABLE, ['generation' => $snapshot->generation])->execute();
                $db->createCommand()->delete(CandidateIndexSchema::INTERVAL_TABLE, ['generation' => $snapshot->generation])->execute();
            });
            unset($this->active[$snapshot->generation]);
            $this->released[$snapshot] = true;
        } catch (\Throwable $error) { throw new CandidateIndexException($error instanceof CandidateIndexException ? $error->reason : 'dependency_unavailable'); }
    }

    /** Best effort only: normal callers must use explicit finally release and observe its errors. */
    public function __destruct()
    {
        foreach ($this->active as $entry) {
            try { $this->release($entry['snapshot']); } catch (\Throwable) { /* No private exception logging. */ }
        }
    }

    private function owned(AuthorizedIndexSnapshot $snapshot): array
    {
        $entry = $this->active[$snapshot->generation] ?? null;
        if ($entry === null || $entry['snapshot'] !== $snapshot) { throw new CandidateIndexException('snapshot_invalid'); }
        return $entry;
    }

    private function assertRequest(CurrentEventContext $context, RulePolicy $policy): void
    {
        if ($this->db->getTransaction()?->isActive) { throw new CandidateIndexException('transaction_unsupported'); }
        $this->events->assertCurrent($context);
        if (Fingerprint::of($this->policies->current($context)) !== Fingerprint::of($policy)) { throw new CandidateIndexException('policy_changed'); }
    }

    /** Full roster uses max+1 only to reject overflow, never to return a silently partial activity. */
    private function roster(CurrentEventContext $context): array
    {
        $rows = $this->native->run($this->native->candidateQuery($context)->orderBy(['u.id' => SORT_ASC])->limit($this->maxSubjects + 1));
        if (count($rows) > $this->maxSubjects) { throw new CandidateIndexException('capacity_exceeded'); }
        $seen = [];
        foreach ($rows as $row) {
            $id = (string)($row['id'] ?? '');
            if (!preg_match('/^[1-9][0-9]*$/D', $id) || filter_var($id, FILTER_VALIDATE_INT) === false || isset($seen[$id])) { throw new CandidateIndexException('invalid_projection'); }
            $seen[$id] = true;
        }
        return $rows;
    }

    /** Only content fingerprints survive each batch; source values never become persistent index payloads. */
    private function capture(CurrentEventContext $context, RulePolicy $policy, array $aliases, ?string $generation = null): array
    {
        $this->assertRequest($context, $policy);
        $roster = $this->roster($context);
        $ids = array_map(static fn(array $row): string => (string)$row['id'], $roster);
        $digests = []; $terms = []; $intervals = [];
        foreach (array_chunk($ids, CandidateRequest::MAX_CANDIDATES) as $batch) {
            $projected = $this->projections->read(new CandidateRequest($context, 'person', $batch));
            if (!array_is_list($projected) || count($projected) > count($batch)) { throw new CandidateIndexException('invalid_projection'); }
            foreach ($projected as $projection) {
                if (!$projection instanceof CandidateProjection || $projection->targetType !== 'person' || $projection->spaceId !== $context->spaceId
                    || !in_array($projection->targetId, $batch, true) || isset($digests[$projection->targetId])
                    || array_diff(array_keys($projection->features), array_keys($policy->parameters['bindings'])) !== []
                    || array_diff($projection->unknownFeatures, array_keys($policy->parameters['bindings'])) !== []
                    || array_diff(array_keys($policy->parameters['bindings']), array_merge(array_keys($projection->features), $projection->unknownFeatures)) !== []) {
                    throw new CandidateIndexException('invalid_projection');
                }
                // Includes independent scope/content/permission/schema/identity/P8-policy versions and evidence.
                $digests[$projection->targetId] = Fingerprint::of($projection);
                if ($generation !== null) {
                    [$newTerms, $newIntervals] = $this->derive($projection, $policy, $aliases, $generation);
                    if (count($terms) + count($intervals) + count($newTerms) + count($newIntervals) > $this->maxIndexRows) { throw new CandidateIndexException('capacity_exceeded'); }
                    array_push($terms, ...$newTerms); array_push($intervals, ...$newIntervals);
                }
            }
        }
        if (Fingerprint::of($this->roster($context)) !== Fingerprint::of($roster)) { throw new CandidateIndexException('source_changed'); }
        $this->assertRequest($context, $policy);
        ksort($digests, SORT_STRING);
        return ['source' => Fingerprint::of([$roster, $digests, $context, $policy, $this->sourcePurposeVersion]), 'terms' => $terms, 'intervals' => $intervals];
    }

    private function aliases(RulePolicy $policy): array
    {
        try { PolicyValidator::assertParameters($policy->parameters); }
        catch (\Throwable) { throw new CandidateIndexException('invalid_policy'); }
        if (in_array('semantic', $policy->parameters['enabled_routes'], true)) { throw new CandidateIndexException('invalid_policy'); }
        $features = [];
        foreach ($policy->parameters['rules'] as $rule) {
            $aliases = [];
            foreach ($rule['aliases'] as $alias => $canonical) {
                $alias = strtolower(trim($alias)); $canonical = strtolower(trim($canonical));
                if ($alias !== $canonical) { $aliases[$alias] = $canonical; }
            }
            ksort($aliases, SORT_STRING);
            foreach ($rule['candidate_features'] as $feature) {
                if (isset($features[$feature]) && $features[$feature] !== $aliases) { throw new CandidateIndexException('invalid_policy'); }
                $features[$feature] = $aliases;
            }
        }
        return $features;
    }

    private function derive(CandidateProjection $projection, RulePolicy $policy, array $aliases, string $generation): array
    {
        $terms = []; $intervals = [];
        foreach ($aliases as $feature => $featureAliases) {
            if (!isset($projection->features[$feature])) { continue; }
            $binding = $policy->parameters['bindings'][$feature];
            $value = $projection->features[$feature]['value'];
            $scope = $binding['scope'] === 'event' ? 'space:' . $projection->spaceId : 'global';
            foreach ($projection->features[$feature]['evidence'] as $evidence) {
                if ($evidence->scope !== $scope) { throw new CandidateIndexException('invalid_projection'); }
            }
            $base = ['generation' => $generation, 'space_id' => $projection->spaceId, 'target_id' => (int)$projection->targetId];
            if ($binding['transform'] === 'interval') {
                foreach (self::intervals($value) as [$start, $end]) { $intervals[] = $base + ['feature' => $feature, 'starts_at' => $start, 'ends_at' => $end]; }
                continue;
            }
            $values = is_string($value) ? [$value] : $value;
            if (!is_array($values) || !array_is_list($values)) { throw new CandidateIndexException('invalid_projection'); }
            $digests = [];
            foreach ($values as $token) {
                if (!is_string($token) || trim($token) === '') { throw new CandidateIndexException('invalid_projection'); }
                $token = strtolower(trim($token));
                // Exactly one alias substitution, shared with deterministic evaluator and SQL query.
                $digests[hash('sha256', $featureAliases[$token] ?? $token)] = true;
            }
            $routes = ['structured']; // Hard predicates also require this route when only fulltext is enabled.
            if (in_array('fulltext', $policy->parameters['enabled_routes'], true) && in_array($binding['purpose'], ['topic', 'contribution'], true)) { $routes[] = 'fulltext'; }
            foreach ($routes as $route) { foreach (array_keys($digests) as $digest) { $terms[] = $base + ['route' => $route, 'feature' => $feature, 'term' => $digest]; } }
        }
        return [$terms, $intervals];
    }

    /** Same timezone validation, float UTC conversion and touching-interval union as the rule evaluator. */
    private static function intervals(mixed $value): array
    {
        if (!is_array($value) || !array_is_list($value)) { throw new CandidateIndexException('invalid_projection'); }
        $intervals = [];
        foreach ($value as $interval) {
            if (!is_array($interval)) { throw new CandidateIndexException('invalid_projection'); }
            $keys = array_keys($interval); sort($keys);
            if ($keys !== ['ends_at', 'starts_at']) { throw new CandidateIndexException('invalid_projection'); }
            $ends = [];
            foreach (['starts_at', 'ends_at'] as $key) {
                $text = $interval[$key];
                if (!is_string($text) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/D', $text)) { throw new CandidateIndexException('invalid_projection'); }
                try { $date = new \DateTimeImmutable($text); }
                catch (\Throwable) { throw new CandidateIndexException('invalid_projection'); }
                $errors = \DateTimeImmutable::getLastErrors();
                if ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) { throw new CandidateIndexException('invalid_projection'); }
                $ends[] = (float)$date->format('U.u');
            }
            if ($ends[0] >= $ends[1]) { throw new CandidateIndexException('invalid_projection'); }
            $intervals[] = $ends;
        }
        usort($intervals, static fn(array $a, array $b): int => ($a[0] <=> $b[0]) ?: ($a[1] <=> $b[1]));
        $merged = [];
        foreach ($intervals as $interval) {
            $last = count($merged) - 1;
            if ($last >= 0 && $interval[0] <= $merged[$last][1]) { $merged[$last][1] = max($merged[$last][1], $interval[1]); }
            else { $merged[] = $interval; }
        }
        return $merged;
    }

    private function assertDeadline(int $created, int $expires): void
    {
        $now = IndexLeaseTime::microseconds($this->clock->now());
        if ($now < $created) { throw new CandidateIndexException('snapshot_invalid'); }
        if ($now >= $expires) { throw new CandidateIndexException('lease_expired'); }
    }

    private function assertLease(AuthorizedIndexSnapshot $snapshot, array $entry): void
    {
        $this->assertDeadline($entry['created'], $entry['expires']);
        $rows = $this->native->run((new Query())->from(CandidateIndexLifecycleSchema::TABLE)->where(['generation' => $snapshot->generation])->limit(2));
        if (count($rows) !== 1 || IndexLeaseTime::stored($rows[0]['created_at_us'] ?? null) !== $entry['created'] || IndexLeaseTime::stored($rows[0]['expires_at_us'] ?? null) !== $entry['expires']) {
            throw new CandidateIndexException('snapshot_invalid');
        }
        $this->assertDeadline($entry['created'], $entry['expires']);
    }

    private function publish(string $generation, int $created, int $expires, array $terms, array $intervals): void
    {
        $this->write(function (Connection $db) use ($generation, $created, $expires, $terms, $intervals): void {
            $db->createCommand()->insert(CandidateIndexLifecycleSchema::TABLE, ['generation' => $generation, 'created_at_us' => $created, 'expires_at_us' => $expires])->execute();
            foreach ([[CandidateIndexSchema::TERM_TABLE, $terms], [CandidateIndexSchema::INTERVAL_TABLE, $intervals]] as [$table, $rows]) {
                foreach (array_chunk($rows, 100) as $batch) {
                    $values = array_map(static function (array $row): array {
                        // PHP's default float-to-string precision can drop microseconds around Unix epochs.
                        // Bind explicit decimal seconds while preserving the evaluator's float semantics.
                        if (isset($row['starts_at'], $row['ends_at'])) {
                            $row['starts_at'] = new PdoValue(sprintf('%.6F', $row['starts_at']), \PDO::PARAM_STR);
                            $row['ends_at'] = new PdoValue(sprintf('%.6F', $row['ends_at']), \PDO::PARAM_STR);
                        }
                        return array_values($row);
                    }, $batch);
                    $db->createCommand()->batchInsert($table, array_keys($batch[0]), $values)->execute();
                }
            }
        });
    }

    /** Yii enables stringified PDO fetches; SQLite's REAL-to-text conversion loses microseconds. */
    private function intervalRows(Query $query): array
    {
        return $this->db->useMaster(function (Connection $db) use ($query): array {
            $pdo = $db->getMasterPdo();
            $stringify = $pdo->getAttribute(\PDO::ATTR_STRINGIFY_FETCHES);
            try {
                $pdo->setAttribute(\PDO::ATTR_STRINGIFY_FETCHES, false);
                return $this->native->run($query);
            } finally { $pdo->setAttribute(\PDO::ATTR_STRINGIFY_FETCHES, $stringify); }
        });
    }

    /** No source reads occur here; this transaction owns only recommendation-derived writes. */
    private function write(callable $operation): void
    {
        if ($this->db->getTransaction()?->isActive) { throw new CandidateIndexException('transaction_unsupported'); }
        $logging = $this->db->enableLogging; $profiling = $this->db->enableProfiling;
        $this->db->enableLogging = false; $this->db->enableProfiling = false;
        try {
            $this->db->useMaster(function (Connection $db) use ($operation): void {
                $db->noCache(function (Connection $db) use ($operation): void {
                    $tx = $db->beginTransaction();
                    try { $operation($db); $tx->commit(); }
                    catch (\Throwable $error) { if ($tx->isActive) { $tx->rollBack(); } throw $error; }
                });
            });
        } catch (\Throwable $error) { throw new CandidateIndexException($error instanceof CandidateIndexException ? $error->reason : 'dependency_unavailable'); }
        finally { $this->db->enableLogging = $logging; $this->db->enableProfiling = $profiling; }
    }

    private static function rowsFingerprint(array $terms, array $intervals): string
    {
        $normalized = [];
        foreach ($terms as $row) {
            $normalized[] = ['term', (string)$row['generation'], (int)$row['space_id'], (int)$row['target_id'], (string)$row['route'], (string)$row['feature'], (string)$row['term']];
        }
        foreach ($intervals as $row) {
            $normalized[] = ['interval', (string)$row['generation'], (int)$row['space_id'], (int)$row['target_id'], (string)$row['feature'], (float)$row['starts_at'], (float)$row['ends_at']];
        }
        usort($normalized, static fn(array $a, array $b): int => strcmp(json_encode($a, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION), json_encode($b, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION)));
        return Fingerprint::of($normalized);
    }

}
