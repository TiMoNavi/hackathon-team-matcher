<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\tests\batch_replay;
use humhub\modules\matcherRecommendation\adapters\cursor\HmacDiscoveryCursorCodec;
use humhub\modules\matcherRecommendation\application\ReadDiscoveryBatch;
use humhub\modules\matcherRecommendation\contracts\{CandidateRequest, CurrentEventContext};
use humhub\modules\matcherRecommendation\contracts\ports\{CandidateProjectionReader, Clock, ContactEligibilityReader, CurrentEventAccess, DiscoveryBatchStore, DiscoveryCursorCodec, PolicyStore};
use humhub\modules\matcherRecommendation\domain\{DiscoveryBatch, RulePolicy};
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;
use humhub\modules\matcherRecommendation\tests\support\FixtureEnvironment;

final class Events implements CurrentEventAccess
{
    public CurrentEventContext $context;
    public ?\Closure $onAssert = null;
    public ?CurrentEventContext $override = null;
    public int $checks = 0;
    public function __construct() { $this->context = new CurrentEventContext(1, 7, 'synthetic-access-a', 'synthetic-event-policy'); }
    public function resolve(int $viewerId, ?int $requestedSpaceId = null): CurrentEventContext
    {
        if ($this->override !== null) { return $this->override; }
        if ($viewerId !== $this->context->viewerId || ($requestedSpaceId !== null && $requestedSpaceId !== $this->context->spaceId)) { throw new \RuntimeException('synthetic-access-denied'); }
        return $this->context;
    }
    public function assertCurrent(CurrentEventContext $context): void
    {
        $this->checks++;
        if ($this->onAssert !== null) { ($this->onAssert)($this); }
        if (Fingerprint::of($context) !== Fingerprint::of($this->context)) { throw new \RuntimeException('synthetic-context-changed'); }
    }
}
final class Profiles implements CandidateProjectionReader
{
    public array $rows = [];
    public array $requests = [];
    public ?\Closure $onRead = null;
    public ?array $override = null;
    public function read(CandidateRequest $request): array
    {
        $this->requests[] = $request->targetIds;
        if ($this->onRead !== null) { ($this->onRead)($this, $request); }
        return $this->override ?? array_values(array_intersect_key($this->rows, array_flip($request->targetIds)));
    }
}
final class Relationships implements ContactEligibilityReader
{
    public array $rows = [];
    public array $requests = [];
    public ?\Closure $onRead = null;
    public ?array $override = null;
    public function readCurrent(CandidateRequest $request): array
    {
        $this->requests[] = $request->targetIds;
        if ($this->onRead !== null) { ($this->onRead)($this, $request); }
        return $this->override ?? array_intersect_key($this->rows, array_flip($request->targetIds));
    }
    public function supportsSentHistory(): bool { throw new \RuntimeException('Replay must not request AI sent-history capability.'); }
    public function readSentHistory(CandidateRequest $request): array { throw new \RuntimeException('Replay must not request AI sent history.'); }
}
final class Policies implements PolicyStore
{
    public RulePolicy $policy;
    public ?\Closure $onCurrent = null;
    public int $reads = 0;
    public function __construct() { $this->policy = new RulePolicy('synthetic-replay-policy-1', ['synthetic_only' => true]); }
    public function current(CurrentEventContext $context): RulePolicy
    {
        $this->reads++;
        if ($this->onCurrent !== null) { ($this->onCurrent)($this); }
        return $this->policy;
    }
}
final class Batches implements DiscoveryBatchStore
{
    public array $rows = [];
    public ?\Closure $onGet = null;
    public int $reads = 0;
    public int $writes = 0;
    public function put(DiscoveryBatch $batch): string { $this->writes++; $id = 'synthetic-batch-' . $this->writes; $this->rows[$id] = $batch; return $id; }
    public function get(string $batchId): ?DiscoveryBatch
    {
        $this->reads++;
        if ($this->onGet !== null) { ($this->onGet)($this, $batchId); }
        return $this->rows[$batchId] ?? null;
    }
}
final class TestClock implements Clock
{
    public \DateTimeImmutable $time;
    public ?\Closure $onNow = null;
    public function __construct() { $this->time = new \DateTimeImmutable('2026-11-11T00:00:01.123456Z'); }
    public function now(): \DateTimeImmutable { if ($this->onNow !== null) { ($this->onNow)($this); } return $this->time; }
}
final class Fixtures
{
    public const KEY = 'synthetic-only-signing-key-with-at-least-32-bytes';
    public Events $events;
    public Profiles $profiles;
    public Relationships $relationships;
    public Policies $policies;
    public Batches $batches;
    public TestClock $clock;
    public DiscoveryCursorCodec $cursors;
    public string $batchId = 'synthetic-batch-1';

    public function __construct(int $size = 30)
    {
        $this->events = new Events(); $this->profiles = new Profiles(); $this->relationships = new Relationships();
        $this->policies = new Policies(); $this->batches = new Batches(); $this->clock = new TestClock(); $this->cursors = new HmacDiscoveryCursorCodec(self::KEY);
        $ids = $size === 0 ? [] : array_reverse(array_map(strval(...), range(2, $size + 1)));
        $fingerprints = []; $relations = [];
        foreach ($ids as $id) {
            $this->profiles->rows[$id] = FixtureEnvironment::person($id);
            $this->relationships->rows[$id] = FixtureEnvironment::relationship(version: 'synthetic-relationship-' . $id);
            $fingerprints[$id] = Fingerprint::of($this->profiles->rows[$id]);
            $relations[$id] = $this->relationships->rows[$id]['version'];
        }
        $created = new \DateTimeImmutable('2026-11-11T00:00:00.123456Z');
        $this->batches->rows[$this->batchId] = new DiscoveryBatch($this->events->context, Fingerprint::of(['synthetic-query-binding']), $this->policies->policy->version, $ids, $fingerprints, $relations, $created, $created->add(new \DateInterval('PT15M')), Fingerprint::of($this->policies->policy));
    }
    public function service(): ReadDiscoveryBatch { return new ReadDiscoveryBatch($this->events, $this->profiles, $this->relationships, $this->policies, $this->batches, $this->clock, $this->cursors); }
    public function batch(): DiscoveryBatch { return $this->batches->rows[$this->batchId]; }
    public function replace(array $changes): DiscoveryBatch
    {
        $v = array_replace(get_object_vars($this->batch()), $changes);
        return $this->batches->rows[$this->batchId] = new DiscoveryBatch($v['context'], $v['queryHash'], $v['policyVersion'], $v['targetIds'], $v['projectionFingerprints'], $v['relationshipVersions'], $v['createdAt'], $v['expiresAt'], $v['policyFingerprint']);
    }
}
