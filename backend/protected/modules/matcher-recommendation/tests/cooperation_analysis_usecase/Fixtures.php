<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\tests\cooperation_analysis_usecase;

use humhub\modules\matcherRecommendation\application\analysis\AnalyzeCooperation;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CandidateRequest, CurrentEventContext, EvidenceRef, ProjectionVersions};
use humhub\modules\matcherRecommendation\contracts\analysis\{CooperationAnalysisException, CooperationAnalysisRequest, SelectedSelfAttributes};
use humhub\modules\matcherRecommendation\contracts\ports\{CandidateProjectionReader, CurrentEventAccess, ProfileFieldCatalog, SelectedSelfProjectionReader};
use humhub\modules\matcherRecommendation\domain\analysis\AnalysisMapping;
use humhub\modules\matcherRecommendation\domain\config\{Fingerprint, PolicyValidator};

final class MemoryEvents implements CurrentEventAccess
{
    public int $resolves = 0;
    public int $assertions = 0;
    public ?\Closure $onAssert = null;
    public function __construct(public CurrentEventContext $current) {}
    public function resolve(int $viewerId, ?int $requestedSpaceId = null): CurrentEventContext
    { $this->resolves++; return $this->current; }
    public function assertCurrent(CurrentEventContext $context): void
    {
        $this->assertions++; if ($this->onAssert !== null) { ($this->onAssert)($this->assertions, $this); }
        if (Fingerprint::of($context) !== Fingerprint::of($this->current)) { throw new CooperationAnalysisException('context_changed'); }
    }
}
final class MemoryCandidates implements CandidateProjectionReader
{
    public int $reads = 0;
    public array $requests = [];
    public ?\Closure $onRead = null;
    public function __construct(public array $rows) {}
    public function read(CandidateRequest $request): array
    {
        $this->reads++; $this->requests[] = $request;
        if ($this->onRead !== null) { ($this->onRead)($this->reads, $this, $request); }
        return $this->rows;
    }
}
final class MemorySelf implements SelectedSelfProjectionReader
{
    public int $reads = 0;
    public int $assertions = 0;
    public array $requests = [];
    public ?\Closure $onRead = null;
    public ?\Closure $onAssert = null;
    public function __construct(public SelectedSelfAttributes $authority, public CandidateProjection $projection) {}
    public function assertCurrent(CurrentEventContext $context, SelectedSelfAttributes $selection): void
    {
        $this->assertions++; if ($this->onAssert !== null) { ($this->onAssert)($this->assertions, $this); }
        $this->verify($context, $selection);
    }
    public function read(CurrentEventContext $context, SelectedSelfAttributes $selection): CandidateProjection
    {
        $this->reads++; $this->requests[] = $selection;
        if ($selection->references === []) { throw new \RuntimeException('Empty selection attempted an unauthorized value read.'); }
        if ($this->onRead !== null) { ($this->onRead)($this->reads, $this); }
        $this->verify($context, $selection);
        return $this->projection;
    }
    private function verify(CurrentEventContext $context, SelectedSelfAttributes $selection): void
    {
        if ($context->viewerId !== $selection->ownerId || $context->spaceId !== $selection->spaceId
            || Fingerprint::of($selection) !== Fingerprint::of($this->authority)) { throw new CooperationAnalysisException('selection_unavailable'); }
    }
}
final class MemoryCatalog implements ProfileFieldCatalog
{
    public int $reads = 0;
    public ?\Closure $onRead = null;
    public function __construct(public array $value) {}
    public function read(): array
    {
        $this->reads++; if ($this->onRead !== null) { ($this->onRead)($this->reads, $this); } return $this->value;
    }
}
final class Fixture
{
    public MemoryEvents $events;
    public MemoryCandidates $candidates;
    public MemorySelf $self;
    public MemoryCatalog $catalog;
    public AnalysisMapping $mapping;
    public CooperationAnalysisRequest $request;
    public AnalyzeCooperation $usecase;
    public string $catalogFingerprint;

    public function __construct(?array $selfValues = null, ?array $candidateValues = null)
    {
        $this->events = new MemoryEvents(new CurrentEventContext(1, 7, 'access-v1', 'event-policy-v1'));
        $this->mapping = new AnalysisMapping('analysis-usecase-v1', 2, [
            'topics' => ['topics'], 'capability_skills' => ['skills'], 'offered_skills' => ['offer_skills'],
            'needed_skills' => ['need_skills'], 'offered_roles' => ['offer_roles'], 'needed_roles' => ['need_roles'],
            'availability' => ['times'], 'collaboration_modes' => ['modes'], 'communication_preferences' => ['communication'],
        ]);
        $self = self::projection('1', $selfValues ?? ['topics' => ['robotics'], 'need_skills' => ['backend'], 'offer_roles' => ['product'], 'need_roles' => ['technical']]);
        $candidate = self::projection('2', $candidateValues ?? ['topics' => ['robotics'], 'skills' => ['backend'], 'offer_skills' => ['backend'], 'offer_roles' => ['technical'], 'need_roles' => ['product']]);
        $selection = self::selection($self);
        $this->self = new MemorySelf($selection, $self); $this->candidates = new MemoryCandidates([$candidate]);
        $this->catalog = new MemoryCatalog(['schema_version' => 2, 'fields' => [
            'reviewed_field' => ['key' => 'reviewed_field', 'scope' => 'global', 'cardinality' => 'many',
                'value_schema' => ['type' => 'string', 'maxLength' => 64]],
        ]]);
        $this->catalogFingerprint = PolicyValidator::catalogFingerprint($this->catalog->value);
        $this->request = new CooperationAnalysisRequest($this->events->current, '2', $candidate->versions, $selection, $this->mapping->fingerprint());
        $this->usecase = new AnalyzeCooperation($this->events, $this->candidates, $this->self, $this->catalog, $this->mapping, $this->catalogFingerprint);
    }
    public function run(): array { return $this->usecase->execute(1, $this->request); }
    public static function versions(int $space = 7, array $changes = []): ProjectionVersions
    {
        return new ProjectionVersions([
            'global' => ['revision' => $changes['global_revision'] ?? 4, 'permission_version' => $changes['global_permission'] ?? 2],
            'space:' . $space => ['revision' => $changes['event_revision'] ?? 6, 'permission_version' => $changes['event_permission'] ?? 3],
        ], $changes['schema'] ?? 2, $changes['policy'] ?? 'purpose-v1', $changes['identity'] ?? 1);
    }
    public static function projection(string $id, array $values, int $space = 7, array $versionChanges = []): CandidateProjection
    {
        $versions = self::versions($space, $versionChanges); $features = [];
        foreach ($values as $feature => $value) {
            $scope = in_array($feature, ['offer_skills', 'need_skills', 'offer_roles', 'need_roles', 'times', 'modes'], true) ? 'space:' . $space : 'global';
            $v = $versions->scopes[$scope];
            $features[$feature] = ['value' => $value, 'evidence' => [new EvidenceRef('person', $id, 'profile_attribute', 'synthetic-' . $id . '-' . $feature, $scope, $v['revision'], $v['permission_version'])]];
        }
        return new CandidateProjection('person', $id, $space, $versions, $features);
    }
    public static function selection(CandidateProjection $self, int $version = 1, ?array $references = null, string $id = 'selection-synthetic'): SelectedSelfAttributes
    {
        if ($references === null) { $references = []; foreach ($self->features as $feature) { array_push($references, ...$feature['evidence']); } }
        return new SelectedSelfAttributes((int)$self->targetId, $self->spaceId, $id, $version, $self->versions, $references);
    }
    public static function values(CandidateProjection $projection): array
    { $values = []; foreach ($projection->features as $key => $feature) { $values[$key] = $feature['value']; } return $values; }
}
