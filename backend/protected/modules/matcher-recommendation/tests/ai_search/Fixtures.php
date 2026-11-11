<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\tests\ai_search;

use humhub\modules\matcherRecommendation\application\ai\SearchAiCandidates;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CandidateRequest, CurrentEventContext, QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\{CandidateProjectionReader, CandidateRetriever, ContactEligibilityReader, CurrentEventAccess, PolicyStore, RuleEvaluator};
use humhub\modules\matcherRecommendation\domain\{RuleAssessment, RulePolicy};
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;
use humhub\modules\matcherRecommendation\tests\rules\Fixtures as R;

/** Synthetic in-memory ports, including explicitly supported synthetic sent history. No HumHub or real database. */
final class Fixtures implements CurrentEventAccess, CandidateRetriever, CandidateProjectionReader, ContactEligibilityReader, PolicyStore, RuleEvaluator
{
    public CurrentEventContext $context;
    public QueryIntent $intent;
    public array $parameters;
    public string $policyVersion = 'synthetic-ai-search-v1';
    public array $rows = [];
    public array $projections = [];
    public array $relationships = [];
    public array $histories = [];
    public bool $historyCapable = true;
    public array $calls = [];
    public array $order = [];
    public array $requests = [];
    /** @var array<string,\Closure> Synthetic mutation/failure hooks, never production callbacks. */
    public array $hooks = [];
    public ?\Closure $assessment = null;

    public function __construct(int $count = 1)
    {
        $this->context = R::context();
        $this->intent = new QueryIntent('person', [R::condition('topics', 'similarity', ['robotics'])]);
        $this->parameters = R::parameters();
        if ($count > 120) { $this->parameters['enabled_routes'][] = 'semantic'; }
        for ($index = 0; $index < $count; ++$index) {
            $id = (string)(101 + $index);
            [$route, $rank] = $index < 80 ? ['structured', $index + 1]
                : ($index < 120 ? ['fulltext', $index - 79] : ['semantic', $index - 119]);
            $this->rows[] = ['target_type' => 'person', 'id' => $id, 'routes' => [$route => $rank]];
            $this->projections[] = R::candidate(['topics' => ['robotics']], $this->parameters, [], $id);
            $this->relationships[$id] = self::relationship();
            $this->histories[$id] = self::history();
        }
    }
    public static function relationship(): array { return ['blocked' => false, 'friend' => false, 'pending_in' => false, 'pending_out' => false, 'version' => 'synthetic-contact-1']; }
    public static function history(): array { return ['ever_sent' => false, 'version' => 'synthetic-history-1']; }
    public function search(): array { return $this->service()->search($this->context, $this->intent); }
    public function service(): SearchAiCandidates { return new SearchAiCandidates($this, $this, $this, $this, $this, $this); }
    private function tick(string $stage): void
    {
        $this->calls[$stage] = ($this->calls[$stage] ?? 0) + 1;
        $this->order[] = $stage;
        if (isset($this->hooks[$stage])) { ($this->hooks[$stage])($this, $this->calls[$stage]); }
    }
    public function resolve(int $viewerId, ?int $requestedSpaceId = null): CurrentEventContext
    {
        throw new \LogicException('Search receives an already server-resolved context and must not resolve model-supplied IDs.');
    }
    public function assertCurrent(CurrentEventContext $context): void
    {
        $this->tick('context');
        if ($context != $this->context) { throw new \RuntimeException('Synthetic current context changed.'); }
    }
    public function recall(CurrentEventContext $context, QueryIntent $intent): array
    {
        $this->requests['recall'][] = [$context, $intent]; $this->tick('recall'); return $this->rows;
    }
    public function read(CandidateRequest $request): array
    {
        $this->requests['profiles'][] = $request; $this->tick('profiles'); return $this->projections;
    }
    public function readCurrent(CandidateRequest $request): array
    {
        $this->requests['relationships'][] = $request; $this->tick('relationships'); return $this->relationships;
    }
    public function supportsSentHistory(): bool { $this->tick('capability'); return $this->historyCapable; }
    public function readSentHistory(CandidateRequest $request): array
    {
        $this->requests['history'][] = $request; $this->tick('history'); return $this->histories;
    }
    public function current(CurrentEventContext $context): RulePolicy
    {
        $this->tick('policy'); return new RulePolicy($this->policyVersion, $this->parameters);
    }
    public function evaluate(CurrentEventContext $context, QueryIntent $intent, CandidateProjection $candidate, RulePolicy $policy, array $routeRanks): RuleAssessment
    {
        $this->tick('evaluate');
        if ($this->assessment !== null) { return ($this->assessment)($context, $intent, $candidate, $policy, $routeRanks); }
        return (new DeterministicRuleEvaluator())->evaluate($context, $intent, $candidate, $policy, $routeRanks);
    }
}
