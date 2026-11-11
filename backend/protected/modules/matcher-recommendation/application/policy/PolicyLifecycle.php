<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\application\policy;
use humhub\modules\matcherRecommendation\contracts\ports\{PolicyAdministrationAccess, PolicyReplaySuiteProvider, PolicyRevisionStore, ProfileFieldCatalog, RuleEvaluator};
use humhub\modules\matcherRecommendation\domain\config\{PolicyDraft, PolicyValidator, ReplayReport};
use humhub\modules\matcherRecommendation\domain\RulePolicy;

/** Draft -> validate -> actually execute replay -> CAS publication. No framework, model or database dependency. */
final class PolicyLifecycle
{
    public function __construct(
        private readonly PolicyRevisionStore $store,
        private readonly ProfileFieldCatalog $catalog,
        private readonly PolicyReplaySuiteProvider $suites,
        private readonly RuleEvaluator $evaluator,
        private readonly PolicyAdministrationAccess $access,
    ) {}

    public function createDraft(int $actorId, string $draftId, array $parameters): PolicyDraft
    {
        $this->authorize($actorId); $draft = new PolicyDraft($draftId, 1, $parameters);
        $this->store->transaction(function () use ($actorId, $draft): void { $this->authorize($actorId); $this->store->save($draft, null); });
        return $draft;
    }
    public function edit(int $actorId, string $draftId, int $expectedRevision, array $parameters): PolicyDraft
    {
        $this->authorize($actorId);
        return $this->store->transaction(function () use ($actorId, $draftId, $expectedRevision, $parameters): PolicyDraft {
            $this->expected($draftId, $expectedRevision);
            $next = new PolicyDraft($draftId, $expectedRevision + 1, $parameters);
            $this->authorize($actorId); $this->store->save($next, $expectedRevision); return $next;
        });
    }
    public function validate(int $actorId, string $draftId, int $expectedRevision): PolicyDraft
    {
        $this->authorize($actorId);
        return $this->store->transaction(function () use ($actorId, $draftId, $expectedRevision): PolicyDraft {
            $draft = $this->expected($draftId, $expectedRevision); $catalog = $this->catalog->read();
            PolicyValidator::validate($draft->parameters, $catalog);
            $next = new PolicyDraft($draft->id, $draft->revision + 1, $draft->parameters, $draft->digest(), PolicyValidator::catalogFingerprint($catalog));
            $this->authorize($actorId); $this->store->save($next, $expectedRevision); return $next;
        });
    }
    public function replay(int $actorId, string $draftId, int $expectedRevision): PolicyDraft
    {
        $this->authorize($actorId);
        // Pure synthetic work occurs outside the write transaction; a stale revision cannot commit its report.
        $draft = $this->expected($draftId, $expectedRevision); $catalog = $this->catalog->read();
        $catalogDigest = PolicyValidator::catalogFingerprint($catalog);
        PolicyValidator::validate($draft->parameters, $catalog);
        if ($draft->validatedDigest !== $draft->digest() || $draft->catalogDigest !== $catalogDigest) { throw new \RuntimeException('Validate the current draft and catalog before replay.'); }
        $suite = $this->suites->current(); $assertions = []; $policy = $draft->policy();
        foreach ($suite->cases as $case) {
            try {
                $result = $this->evaluator->evaluate($case->context, $case->intent, $case->candidate, $policy, $case->routeRanks);
                $passed = $result->qualifies === $case->expectedQualifies && $result->sortScore + 1e-9 >= $case->minimumScore && $result->sortScore - 1e-9 <= $case->maximumScore && count($result->reasons) >= $case->minimumReasons;
                $assertions[] = ['id' => $case->id, 'passed' => $passed, 'qualifies' => $result->qualifies, 'score' => $result->sortScore, 'reason_count' => count($result->reasons), 'error' => null];
            } catch (\Throwable) {
                // Do not persist raw exception/source text in an administrative report.
                $assertions[] = ['id' => $case->id, 'passed' => false, 'qualifies' => null, 'score' => null, 'reason_count' => 0, 'error' => 'evaluation_failed'];
            }
        }
        $report = new ReplayReport($draft->id, $draft->revision + 1, $draft->digest(), $catalogDigest, $suite->version, $suite->digest(), $assertions);
        return $this->store->transaction(function () use ($actorId, $draft, $expectedRevision, $report): PolicyDraft {
            $this->authorize($actorId); $this->expected($draft->id, $expectedRevision);
            $this->assertCurrentSources($report);
            $next = new PolicyDraft($draft->id, $draft->revision + 1, $draft->parameters, $draft->validatedDigest, $draft->catalogDigest, $report);
            $this->authorize($actorId); $this->store->save($next, $expectedRevision); return $next;
        });
    }
    public function publish(int $actorId, string $draftId, int $expectedRevision, ?string $expectedActiveVersion): RulePolicy
    {
        $this->authorize($actorId);
        return $this->store->transaction(function () use ($actorId, $draftId, $expectedRevision, $expectedActiveVersion): RulePolicy {
            $this->authorize($actorId); $draft = $this->expected($draftId, $expectedRevision);
            $catalog = $this->catalog->read(); PolicyValidator::validate($draft->parameters, $catalog);
            $report = $draft->replay;
            if ($report === null || !$report->passed() || $report->draftId !== $draft->id || $report->draftRevision !== $draft->revision || $report->policyDigest !== $draft->digest() || $draft->validatedDigest !== $draft->digest() || $draft->catalogDigest !== $report->catalogDigest || PolicyValidator::catalogFingerprint($catalog) !== $report->catalogDigest) { throw new \RuntimeException('A successful current server-executed replay is required.'); }
            $this->assertCurrentSources($report);
            $policy = $draft->policy();
            $this->authorize($actorId); $this->store->publish($draftId, $expectedRevision, $expectedActiveVersion, $policy);
            return $policy;
        });
    }
    public function rollback(int $actorId, string $publishedVersion, string $newDraftId, ?string $expectedActiveVersion): RulePolicy
    {
        $this->authorize($actorId);
        $old = $this->store->published($publishedVersion) ?? throw new \RuntimeException('Unknown published policy.');
        // Historical approval is not current approval: rollback runs exactly the same validation/replay gates.
        $draft = $this->createDraft($actorId, $newDraftId, $old->parameters);
        $draft = $this->validate($actorId, $draft->id, $draft->revision);
        $draft = $this->replay($actorId, $draft->id, $draft->revision);
        return $this->publish($actorId, $draft->id, $draft->revision, $expectedActiveVersion);
    }
    private function expected(string $draftId, int $expectedRevision): PolicyDraft
    {
        $draft = $this->store->draft($draftId) ?? throw new \RuntimeException('Unknown draft.');
        if ($draft->revision !== $expectedRevision) { throw new \RuntimeException('Draft revision conflict.'); }
        return $draft;
    }
    private function assertCurrentSources(ReplayReport $report): void
    {
        $suite = $this->suites->current();
        if ($suite->version !== $report->suiteVersion || $suite->digest() !== $report->suiteDigest || PolicyValidator::catalogFingerprint($this->catalog->read()) !== $report->catalogDigest) { throw new \RuntimeException('Catalog or replay suite changed.'); }
    }
    private function authorize(int $actorId): void
    {
        if ($actorId < 1) { throw new \InvalidArgumentException('A real administrative actor is required.'); }
        $this->access->assertCanManage($actorId);
    }
}
