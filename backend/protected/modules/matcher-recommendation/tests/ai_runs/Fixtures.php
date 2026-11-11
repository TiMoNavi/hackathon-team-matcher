<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\tests\ai_runs;
use humhub\modules\matcherRecommendation\application\ai\{AiProviderRegistry, AiRecommendationService};
use humhub\modules\matcherRecommendation\contracts\{CandidateRequest, CurrentEventContext, QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\{AiCandidateSearch, AiPlatformBudget, CandidateProjectionReader, CandidateReranker, Clock, ContactEligibilityReader, CurrentEventAccess, PolicyStore, QueryInterpreter};
use humhub\modules\matcherRecommendation\domain\{DiscoveryMatch, RulePolicy};
use humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException;
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;
use humhub\modules\matcherRecommendation\tests\rules\Fixtures as R;
use humhub\modules\matcherRecommendation\tests\support\FixtureEnvironment;

final class Events implements CurrentEventAccess
{
    public CurrentEventContext $context;
    public bool $available = true;
    public int $checks = 0;
    public ?\Closure $onCheck = null;
    public function __construct() { $this->context = R::context(); }
    public function resolve(int $viewerId, ?int $requestedSpaceId = null): CurrentEventContext
    {
        if (!$this->available || $viewerId !== $this->context->viewerId || ($requestedSpaceId !== null && $requestedSpaceId !== $this->context->spaceId)) { throw new AiRecommendationException('context_invalidated'); }
        return $this->context;
    }
    public function assertCurrent(CurrentEventContext $context): void
    {
        $this->checks++;
        if ($this->onCheck !== null) { ($this->onCheck)($this); }
        if (!$this->available || Fingerprint::of($context) !== Fingerprint::of($this->context)) { throw new AiRecommendationException('context_invalidated'); }
    }
}
final class Policies implements PolicyStore
{
    public RulePolicy $policy;
    public ?\Closure $onCurrent = null;
    public int $reads = 0;
    public function __construct() { $this->policy = new RulePolicy('synthetic-ai-run-policy-1', R::parameters()); }
    public function current(CurrentEventContext $context): RulePolicy
    {
        $this->reads++;
        if ($this->onCurrent !== null) { ($this->onCurrent)($this, $context); }
        return $this->policy;
    }
}
final class Profiles implements CandidateProjectionReader
{
    public array $rows = [];
    public array $requests = [];
    public ?\Closure $onRead = null;
    public function read(CandidateRequest $request): array
    {
        $this->requests[] = $request->targetIds;
        if ($this->onRead !== null) { ($this->onRead)($this, $request); }
        return array_values(array_intersect_key($this->rows, array_flip($request->targetIds)));
    }
}
final class Contacts implements ContactEligibilityReader
{
    public bool $historySupported = true;
    public array $current = [];
    public array $history = [];
    public array $currentRequests = [];
    public array $historyRequests = [];
    public ?\Closure $onCurrent = null;
    public ?\Closure $onHistory = null;
    public function supportsSentHistory(): bool { return $this->historySupported; }
    public function readCurrent(CandidateRequest $request): array
    {
        $this->currentRequests[] = $request->targetIds;
        if ($this->onCurrent !== null) { ($this->onCurrent)($this, $request); }
        return array_intersect_key($this->current, array_flip($request->targetIds));
    }
    public function readSentHistory(CandidateRequest $request): array
    {
        if (!$this->historySupported) { throw new AiRecommendationException('history_unavailable'); }
        $this->historyRequests[] = $request->targetIds;
        if ($this->onHistory !== null) { ($this->onHistory)($this, $request); }
        return array_intersect_key($this->history, array_flip($request->targetIds));
    }
}
final class Search implements AiCandidateSearch
{
    public array $calls = [];
    public ?\Closure $onSearch = null;
    public ?array $override = null;
    public function __construct(private readonly Events $events, private readonly Policies $policies, private readonly Profiles $profiles, private readonly Contacts $contacts) {}
    public function search(CurrentEventContext $context, QueryIntent $intent): array
    {
        $this->events->assertCurrent($context); $this->calls[] = ['context' => $context, 'intent' => $intent];
        if ($this->onSearch !== null) { ($this->onSearch)($this, $context, $intent); }
        if ($this->override !== null) { return $this->override; }
        $out = []; $evaluator = new DeterministicRuleEvaluator();
        foreach ($this->profiles->rows as $id => $profile) {
            $assessment = $evaluator->evaluate($context, $intent, $profile, $this->policies->policy, ['structured' => 1]);
            if ($assessment->qualifies) { $out[] = new DiscoveryMatch($profile, $assessment, $this->contacts->current[$id]); }
        }
        return $out;
    }
}
final class Platform implements AiPlatformBudget
{
    public int $remaining = 20;
    public array $reservations = [];
    public ?\Closure $onReserve = null;
    public function reserveAttempt(string $runId, string $stage, string $permitId): void
    {
        if ($this->onReserve !== null) { ($this->onReserve)($this, $runId, $stage, $permitId); }
        if ($this->remaining <= 0) { throw new AiRecommendationException('budget_exhausted'); }
        if (isset($this->reservations[$permitId])) { throw new AiRecommendationException('run_conflict'); }
        $this->remaining--; $this->reservations[$permitId] = ['run_id' => $runId, 'stage' => $stage, 'permit_id' => $permitId];
    }
    public function lastRunId(): string { $values = array_values($this->reservations); return $values[count($values) - 1]['run_id']; }
}
final class Interpreter implements QueryInterpreter
{
    public array $responses = [];
    public array $calls = [];
    public ?\Closure $onCall = null;
    public function interpret(array $minimalInput, string $callPermit): array
    {
        $this->calls[] = ['input' => $minimalInput, 'permit' => $callPermit];
        if ($this->onCall !== null) { ($this->onCall)($this, $minimalInput, $callPermit); }
        $response = $this->responses === [] ? Fixtures::ready() : array_shift($this->responses);
        if ($response instanceof \Throwable) { throw $response; }
        return $response instanceof \Closure ? $response($minimalInput, $callPermit, $this) : $response;
    }
}
final class Reranker implements CandidateReranker
{
    public array $responses = [];
    public array $calls = [];
    public ?\Closure $onCall = null;
    public function rerank(QueryIntent $intent, array $summaries, string $callPermit): array
    {
        $this->calls[] = ['intent' => $intent, 'summaries' => $summaries, 'permit' => $callPermit];
        if ($this->onCall !== null) { ($this->onCall)($this, $intent, $summaries, $callPermit); }
        $response = $this->responses === [] ? self::valid($summaries) : array_shift($this->responses);
        if ($response instanceof \Throwable) { throw $response; }
        return $response instanceof \Closure ? $response($intent, $summaries, $callPermit, $this) : $response;
    }
    public static function valid(array $summaries): array
    {
        return array_map(static fn(array $summary): array => ['target_type' => 'person', 'id' => $summary['id'], 'evidence_ids' => $summary['facts'][0]['evidence_ids']], array_slice($summaries, 0, 3));
    }
}
final class TestClock implements Clock
{
    public \DateTimeImmutable $time;
    public function __construct() { $this->time = new \DateTimeImmutable('2026-11-11T00:00:00Z'); }
    public function now(): \DateTimeImmutable { return $this->time; }
}
final class Fixtures
{
    public Events $events;
    public Policies $policies;
    public DeterministicRuleEvaluator $queryValidator;
    public Search $search;
    public Profiles $profiles;
    public Contacts $contacts;
    public Platform $platform;
    public AiProviderRegistry $providers;
    public TestClock $clock;
    public Interpreter $interpreter;
    public Reranker $reranker;
    private ?AiRecommendationService $instance = null;

    public static function create(int $size = 3): self { return new self($size); }
    private function __construct(int $size)
    {
        $this->events = new Events(); $this->policies = new Policies(); $this->queryValidator = new DeterministicRuleEvaluator();
        $this->profiles = new Profiles(); $this->contacts = new Contacts(); $this->platform = new Platform();
        $this->providers = new AiProviderRegistry(); $this->clock = new TestClock(); $this->interpreter = new Interpreter(); $this->reranker = new Reranker();
        foreach ($size === 0 ? [] : range(2, $size + 1) as $id) {
            $this->profiles->rows[$id] = R::candidate(['topics' => ['social', 'robotics'], 'offers' => ['backend', 'leadership'], 'preferences' => ['async']], id: (string)$id);
            $this->contacts->current[$id] = FixtureEnvironment::relationship(version: 'synthetic-relation-' . $id);
            $this->contacts->history[$id] = ['ever_sent' => false, 'version' => 'synthetic-history-' . $id];
        }
        $this->search = new Search($this->events, $this->policies, $this->profiles, $this->contacts);
        $this->providers->register('synthetic-ai-provider', $this->interpreter, $this->reranker);
    }
    public function service(): AiRecommendationService
    {
        return $this->instance ??= new AiRecommendationService($this->events, $this->policies, $this->queryValidator, $this->search, $this->profiles, $this->contacts, $this->platform, $this->providers, $this->clock);
    }
    public static function query(): QueryIntent { return new QueryIntent('person', [R::condition('topics', 'similarity', ['social'])]); }
    public static function ready(): array { return ['status' => 'ready', 'conditions' => [['feature' => 'topics', 'operator' => 'similarity', 'value' => ['social'], 'strength' => 'soft', 'origin' => 'interpreted_draft']], 'question' => null]; }
    public static function question(string $text = '你更关注共同兴趣还是本次贡献？'): array { return ['status' => 'clarification', 'conditions' => [], 'question' => ['text' => $text, 'options' => ['共同兴趣', '本次贡献']]]; }
    public static function invalidRank(): array { return [['target_type' => 'person', 'id' => '999', 'evidence_ids' => ['e-' . str_repeat('a', 64)]]]; }
    public function modelCalls(): int { return count($this->interpreter->calls) + count($this->reranker->calls); }
}
