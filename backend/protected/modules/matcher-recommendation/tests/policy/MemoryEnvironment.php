<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\tests\policy;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CurrentEventContext, QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\{PolicyAdministrationAccess, PolicyReplaySuiteProvider, PolicyRevisionStore, ProfileFieldCatalog, RuleEvaluator};
use humhub\modules\matcherRecommendation\domain\{RuleAssessment, RulePolicy};
use humhub\modules\matcherRecommendation\domain\config\{Fingerprint, PolicyDraft, ProfileProjectionMapper, ReplayCase, ReplaySuite};
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;

/** Test-only transaction/CAS adapter. No runtime registration or fallback. */
final class MemoryEnvironment implements PolicyRevisionStore, ProfileFieldCatalog, PolicyReplaySuiteProvider, PolicyAdministrationAccess, RuleEvaluator
{
    public array $drafts = [];
    public array $history = [];
    public ?RulePolicy $activePolicy = null;
    public array $catalog;
    public ReplaySuite $suite;
    public bool $authorized = true;
    public int $evaluations = 0;
    public array $observedContextPolicyVersions = [];
    public mixed $duringEvaluation = null;
    public mixed $duringTransaction = null;
    public mixed $duringDraftRead = null;
    public function __construct()
    {
        $this->catalog = Fixtures::catalog();
        $candidate = (new ProfileProjectionMapper())->project(Fixtures::context(), '22', Fixtures::versions(), Fixtures::policy(), $this->catalog, Fixtures::attributes());
        $condition = static fn(string $feature, string $operator, array $value, string $strength = 'soft'): array => ['feature' => $feature, 'operator' => $operator, 'value' => $value, 'strength' => $strength, 'origin' => 'user_confirmed'];
        $ranks = ['structured' => 1, 'fulltext' => 1];
        $unknown = new CandidateProjection('person', '22', 7, Fixtures::versions(), [], array_keys(Fixtures::parameters()['bindings']));
        $this->suite = new ReplaySuite('synthetic-suite-1', [
            new ReplayCase('positive-match', Fixtures::context(), new QueryIntent('person', [$condition('topics', 'similarity', ['social']), $condition('needs', 'supply_demand', ['backend'])]), $candidate, $ranks, true, 1, 1, 2),
            new ReplayCase('no-positive-evidence', Fixtures::context(), new QueryIntent('person', [$condition('topics', 'similarity', ['unrelated'])]), $candidate, $ranks, false, .2, .2),
            new ReplayCase('hard-conflict', Fixtures::context(), new QueryIntent('person', [$condition('topics', 'similarity', ['social']), $condition('needs', 'supply_demand', ['accounting'], 'hard')]), $candidate, $ranks, false, .6, .6, 1),
            new ReplayCase('unknown-is-not-positive', Fixtures::context(), new QueryIntent('person', [$condition('topics', 'similarity', ['social'])]), $unknown, $ranks, false, .6, .6),
        ]);
    }
    public function transaction(callable $operation): mixed
    {
        $snapshot = [$this->drafts, $this->history, $this->activePolicy];
        try {
            if ($this->duringTransaction !== null) { $callback = $this->duringTransaction; $this->duringTransaction = null; $callback(); }
            return $operation();
        } catch (\Throwable $error) { [$this->drafts, $this->history, $this->activePolicy] = $snapshot; throw $error; }
    }
    public function draft(string $draftId): ?PolicyDraft
    {
        if ($this->duringDraftRead !== null) { $callback = $this->duringDraftRead; $this->duringDraftRead = null; $callback(); }
        return $this->drafts[$draftId] ?? null;
    }
    public function save(PolicyDraft $draft, ?int $expectedRevision): void
    {
        if (($this->drafts[$draft->id]->revision ?? null) !== $expectedRevision || $draft->revision !== ($expectedRevision ?? 0) + 1) { throw new \RuntimeException('Draft CAS conflict.'); }
        $this->drafts[$draft->id] = $draft;
    }
    public function active(): ?RulePolicy { return $this->activePolicy; }
    public function published(string $version): ?RulePolicy { return $this->history[$version] ?? null; }
    public function publish(string $draftId, int $expectedRevision, ?string $expectedActiveVersion, RulePolicy $policy): void
    {
        $draft = $this->drafts[$draftId] ?? null;
        if ($draft?->revision !== $expectedRevision || $this->activePolicy?->version !== $expectedActiveVersion || $draft->policy()->version !== $policy->version || $draft->digest() !== Fingerprint::of($policy->parameters)) { throw new \RuntimeException('Publication CAS conflict.'); }
        if (isset($this->history[$policy->version]) && Fingerprint::of($this->history[$policy->version]->parameters) !== Fingerprint::of($policy->parameters)) { throw new \RuntimeException('Published version is immutable.'); }
        $this->history[$policy->version] = $policy; $this->activePolicy = $policy;
    }
    public function read(): array { return $this->catalog; }
    public function current(): ReplaySuite { return $this->suite; }
    public function assertCanManage(int $actorId): void { if (!$this->authorized || $actorId !== 1) { throw new \RuntimeException('Management denied.'); } }
    public function evaluate(CurrentEventContext $context, QueryIntent $intent, CandidateProjection $candidate, RulePolicy $policy, array $routeRanks): RuleAssessment
    {
        $this->evaluations++;
        $this->observedContextPolicyVersions[] = $context->policyVersion;
        if ($this->duringEvaluation !== null) { $callback = $this->duringEvaluation; $this->duringEvaluation = null; $callback(); }
        return (new DeterministicRuleEvaluator())->evaluate($context, $intent, $candidate, $policy, $routeRanks);
    }
}
