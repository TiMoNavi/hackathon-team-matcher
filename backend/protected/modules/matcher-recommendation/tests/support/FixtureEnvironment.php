<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\tests\support;

use humhub\modules\matcherRecommendation\application\DiscoverPeople;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CandidateRequest, CurrentEventContext, EvidenceRef, ProjectionVersions, QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\{CurrentEventAccess, ProfileFieldCatalog, CandidateRetriever, CandidateProjectionReader, ContactEligibilityReader, RuleEvaluator, PolicyStore, DiscoveryBatchStore, Clock};
use humhub\modules\matcherRecommendation\domain\{DiscoveryBatch, MatchReason, RuleAssessment, RulePolicy};

/** Entirely synthetic test doubles. Never referenced or installed by the production Module. */
final class FixtureEnvironment
{
    public CurrentEventAccess $events;
    public ProfileFieldCatalog $catalog;
    public CandidateRetriever $retriever;
    public CandidateProjectionReader $profiles;
    public ContactEligibilityReader $relationships;
    public RuleEvaluator $rules;
    public PolicyStore $policies;
    public DiscoveryBatchStore $batches;
    public Clock $clock;

    private function __construct() {}

    public static function create(): self
    {
        $env = new self();
        $env->events = new class implements CurrentEventAccess {
            public string $version = 'access-fixture-1';
            public bool $available = true;
            public int $checks = 0;
            public ?CurrentEventContext $resolveOverride = null;
            public function resolve(int $viewerId, ?int $requestedSpaceId = null): CurrentEventContext
            {
                if (!$this->available) { throw new \RuntimeException('Activity dependency unavailable.'); }
                if ($this->resolveOverride !== null) { return $this->resolveOverride; }
                if ($viewerId !== 1 || ($requestedSpaceId !== null && $requestedSpaceId !== 7)) { throw new \RuntimeException('Current Space access denied.'); }
                return new CurrentEventContext(1, 7, $this->version, 'event-fixture-1');
            }
            public function assertCurrent(CurrentEventContext $context): void
            {
                $this->checks++;
                if (!$this->available || $context->viewerId !== 1 || $context->spaceId !== 7 || $context->accessVersion !== $this->version || $context->policyVersion !== 'event-fixture-1') {
                    throw new \RuntimeException('Activity context revoked or stale.');
                }
            }
        };
        $env->retriever = new class($env->events) implements CandidateRetriever {
            public array $rows;
            public bool $available = true;
            public ?\Closure $onRecall = null;
            public function __construct(private CurrentEventAccess $events)
            {
                $this->rows = array_map(static fn(int $id, int $rank): array => ['target_type' => 'person', 'id' => (string)$id, 'routes' => ['structured' => $rank]], [1, 101, 102, 103, 104], [1, 2, 3, 4, 5]);
            }
            public function recall(CurrentEventContext $context, QueryIntent $intent): array
            {
                $this->events->assertCurrent($context);
                if (!$this->available) { throw new \RuntimeException('Recall dependency unavailable.'); }
                if ($this->onRecall !== null) { return ($this->onRecall)($context, $intent); }
                return $this->rows;
            }
        };
        $env->catalog = new class implements ProfileFieldCatalog {
            public int $version = 2;
            public array $fields = [
                'synthetic_topics' => ['key' => 'synthetic_topics', 'scope' => 'global', 'value_schema' => ['type' => 'string'], 'cardinality' => 'one'],
            ];
            public function read(): array { return ['schema_version' => $this->version, 'fields' => $this->fields]; }
        };
        $env->profiles = new class($env->events, $env->catalog) implements CandidateProjectionReader {
            public array $rows = [];
            public array $bindings = ['fixture_topic' => 'synthetic_topics'];
            public array $requests = [];
            public bool $available = true;
            public ?\Closure $onRead = null;
            public int $reads = 0;
            public function __construct(private CurrentEventAccess $events, private ProfileFieldCatalog $catalog) {}
            public function read(CandidateRequest $request): array
            {
                $this->events->assertCurrent($request->context);
                if (!$this->available) { throw new \RuntimeException('Projection dependency unavailable.'); }
                if ($request->targetType !== 'person') { throw new \InvalidArgumentException('Person projection required.'); }
                $this->requests[] = $request->targetIds; $this->reads++;
                // Adversarial overrides deliberately allow testing application rejection of a broken adapter.
                if ($this->onRead !== null) { return ($this->onRead)($request, $this->reads); }
                $out = [];
                foreach ($request->targetIds as $id) {
                    if (!isset($this->rows[$id])) { continue; }
                    $row = $this->rows[$id]; $features = [];
                    foreach ($row->features as $logicalKey => $feature) {
                        $sourceKey = $this->bindings[$logicalKey] ?? null;
                        if ($sourceKey !== null && isset($this->catalog->read()['fields'][$sourceKey])) { $features[$logicalKey] = $feature; }
                    }
                    $out[] = new CandidateProjection($row->targetType, $row->targetId, $row->spaceId, $row->versions, $features, $row->unknownFeatures);
                }
                return $out;
            }
        };
        foreach (['101', '102', '103', '104'] as $id) { $env->profiles->rows[$id] = self::person($id); }
        $env->relationships = new class($env->events) implements ContactEligibilityReader {
            public array $states = [];
            public bool $available = true;
            public int $reads = 0;
            public int $historyCalls = 0;
            public int $capabilityCalls = 0;
            public ?\Closure $onRead = null;
            public function __construct(private CurrentEventAccess $events) {}
            public function readCurrent(CandidateRequest $request): array
            {
                $this->events->assertCurrent($request->context);
                if (!$this->available) { throw new \RuntimeException('Relationship dependency unavailable.'); }
                if ($request->targetType !== 'person') { throw new \InvalidArgumentException('Person relationship required.'); }
                $this->reads++;
                if ($this->onRead !== null) { return ($this->onRead)($request, $this->reads); }
                $out = [];
                foreach ($request->targetIds as $id) { if (isset($this->states[$id])) { $out[$id] = $this->states[$id]; } }
                return $out;
            }
            public function supportsSentHistory(): bool { $this->capabilityCalls++; return false; }
            public function readSentHistory(CandidateRequest $request): array { $this->historyCalls++; throw new \RuntimeException('No AI history provider is installed.'); }
        };
        $env->relationships->states = [
            '101' => self::relationship(friend: true),
            '102' => self::relationship(pendingIn: true),
            '103' => self::relationship(pendingOut: true),
            '104' => self::relationship(blocked: true),
        ];
        $env->rules = new class implements RuleEvaluator {
            public bool $available = true;
            public array $seen = [];
            public array $scores = ['101' => 0.7, '102' => 0.9, '103' => 0.9, '104' => 1.0];
            public ?\Closure $onEvaluate = null;
            public function evaluate(CurrentEventContext $context, QueryIntent $intent, CandidateProjection $candidate, RulePolicy $policy, array $routeRanks): RuleAssessment
            {
                if (!$this->available) { throw new \RuntimeException('Rule evaluator unavailable.'); }
                $this->seen[] = ['context' => $context, 'intent' => $intent, 'candidate_id' => $candidate->targetId, 'policy' => $policy, 'route_ranks' => $routeRanks];
                if ($this->onEvaluate !== null) { return ($this->onEvaluate)($context, $intent, $candidate, $policy, $routeRanks); }
                // Synthetic equality example only. The R2 production policy, scoring and dimension logic are absent.
                foreach ($intent->conditions as $condition) {
                    if ($condition['strength'] === 'hard' && (!isset($candidate->features[$condition['feature']]) || $candidate->features[$condition['feature']]['value'] !== $condition['value'])) {
                        return new RuleAssessment(false, 0.0);
                    }
                }
                if (!isset($candidate->features['fixture_topic'])) { return new RuleAssessment(false, 0.0); }
                return new RuleAssessment(true, $this->scores[$candidate->targetId] ?? 0.5, [new MatchReason('synthetic_topic', 'Synthetic shared topic fixture', $candidate->features['fixture_topic']['evidence'])]);
            }
        };
        $env->policies = new class implements PolicyStore {
            public RulePolicy $policy;
            public bool $available = true;
            public ?\Closure $onCurrent = null;
            public int $reads = 0;
            public function __construct() { $this->policy = new RulePolicy('fixture-policy-1', ['fixture_only' => true]); }
            public function current(CurrentEventContext $context): RulePolicy
            {
                if (!$this->available) { throw new \RuntimeException('Policy dependency unavailable.'); }
                $this->reads++;
                return $this->onCurrent !== null ? ($this->onCurrent)($context, $this->reads) : $this->policy;
            }
        };
        $env->batches = new class implements DiscoveryBatchStore {
            public array $records = [];
            public bool $available = true;
            public function put(DiscoveryBatch $batch): string
            {
                if (!$this->available) { throw new \RuntimeException('Batch storage unavailable.'); }
                $id = 'fixture-batch-' . (count($this->records) + 1);
                $this->records[$id] = $batch;
                return $id;
            }
            public function get(string $batchId): ?DiscoveryBatch { return $this->records[$batchId] ?? null; }
        };
        $env->clock = new class implements Clock {
            public \DateTimeImmutable $time;
            public function __construct() { $this->time = new \DateTimeImmutable('2026-11-11T00:00:00Z'); }
            public function now(): \DateTimeImmutable { return $this->time; }
            public function advance(int $seconds): void { $this->time = $this->time->modify(sprintf('%+d seconds', $seconds)); }
        };
        return $env;
    }

    public function service(): DiscoverPeople
    {
        return new DiscoverPeople($this->events, $this->retriever, $this->profiles, $this->relationships, $this->rules, $this->policies, $this->batches, $this->clock);
    }

    public static function query(): QueryIntent
    {
        return new QueryIntent('person', [['feature' => 'fixture_topic', 'operator' => 'fixture_equals', 'value' => 'robotics', 'strength' => 'hard', 'origin' => 'user_confirmed']]);
    }

    public static function person(string $id, int $spaceId = 7, int $revision = 3, string $topic = 'robotics'): CandidateProjection
    {
        $versions = new ProjectionVersions(['global' => ['revision' => $revision, 'permission_version' => 1], 'space:' . $spaceId => ['revision' => 2, 'permission_version' => 1]], 2, 'profile-fixture-1', 1);
        $ref = new EvidenceRef('person', $id, 'profile_attribute', 'attribute-fixture-' . $id, 'global', $revision, 1);
        return new CandidateProjection('person', $id, $spaceId, $versions, ['fixture_topic' => ['value' => $topic, 'evidence' => [$ref]]], ['collaboration_style']);
    }

    public static function relationship(bool $friend = false, bool $pendingIn = false, bool $pendingOut = false, bool $blocked = false, string $version = 'relationship-fixture-1'): array
    {
        return ['blocked' => $blocked, 'friend' => $friend, 'pending_in' => $pendingIn, 'pending_out' => $pendingOut, 'version' => $version];
    }
}
