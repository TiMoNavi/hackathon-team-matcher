<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\tests\self_analysis_selection;

use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileAccessPolicy;
use humhub\modules\matcherProfile\adapters\persistence\SqlDiscoveryProfileBatchSource;
use humhub\modules\matcherProfile\application\{DiscoveryProfileBatchReader, SelectedSelfProfileReader};
use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\tests\discovery_batch\{Fixtures as P1, CountingConnection};
use humhub\modules\matcherRecommendation\adapters\analysis\{SelfAnalysisSelectionSchema, SqlSelfSelectionStore};
use humhub\modules\matcherRecommendation\adapters\native\ServerActorSessionSource;
use humhub\modules\matcherRecommendation\adapters\profile\{P1FieldCatalogAdapter, P1SelfAnalysisProfileReader, P1SelectedSelfProjectionReader};
use humhub\modules\matcherRecommendation\application\analysis\ManageSelfAnalysisSelection;
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;
use humhub\modules\matcherRecommendation\contracts\ports\CurrentEventAccess;
use humhub\modules\matcherRecommendation\domain\analysis\AnalysisMapping;
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;

final class Events implements CurrentEventAccess
{
    public int $assertions = 0; public ?\Closure $onAssert = null;
    public CurrentEventContext $current;
    public function __construct() { $this->current = new CurrentEventContext(1, 7, 'synthetic-selection-1', 'synthetic-policy'); }
    public function resolve(int $viewerId, ?int $requestedSpaceId = null): CurrentEventContext
    {
        if ($viewerId !== $this->current->viewerId || ($requestedSpaceId !== null && $requestedSpaceId !== $this->current->spaceId)) { throw new \RuntimeException('Synthetic current context mismatch.'); }
        return $this->current;
    }
    public function assertCurrent(CurrentEventContext $context): void
    {
        $this->assertions++; if ($this->onAssert !== null) { ($this->onAssert)($this); }
        if (Fingerprint::of($context) !== Fingerprint::of($this->current)) { throw new \RuntimeException('Synthetic context changed.'); }
    }
}
final class Identity implements ServerActorSessionSource
{
    public int $actor = 1; public string $hash; public int $reads = 0; public ?\Closure $onRead = null;
    public function __construct() { $this->hash = str_repeat('a', 64); }
    public function read(): array { $this->reads++; if ($this->onRead !== null) { ($this->onRead)($this); } return ['actor_id' => $this->actor, 'session_hash' => $this->hash]; }
}
final class Fixture
{
    public CountingConnection $db; public Events $events; public Identity $identity;
    public InMemoryProfileAccessPolicy $access; public SelectedSelfProfileReader $p1;
    public P1SelfAnalysisProfileReader $profiles; public SqlSelfSelectionStore $store;
    public ManageSelfAnalysisSelection $manager; public P1SelectedSelfProjectionReader $selected;
    public AnalysisMapping $mapping; public array $bindings; public P1FieldCatalogAdapter $catalog;
    public function __construct(bool $install = true)
    {
        $this->db = P1::database(); $this->db->schemaCache = null;
        if ($install) { SelfAnalysisSelectionSchema::install($this->db); }
        P1::attribute($this->db, 1, 'space:7', 'event_seeking', ['role_codes' => ['developer'], 'skill_codes' => ['php']]);
        P1::attribute($this->db, 2, 'space:7', 'event_contribution', ['skill_codes' => ['php']]);
        P1::attribute($this->db, 1, 'global', 'project', ['title' => 'Synthetic private-title-for-analysis', 'tech_codes' => ['php']]);
        $this->events = new Events(); $this->identity = new Identity();
        $this->access = new InMemoryProfileAccessPolicy(); $this->access->users = [1, 2]; $this->access->memberships = [7 => [1, 2]];
        $this->p1 = new SelectedSelfProfileReader($this->access, new DiscoveryProfileBatchReader(new SqlDiscoveryProfileBatchSource($this->db)));
        $this->catalog = new P1FieldCatalogAdapter(fn() => ['schema_version' => FieldCatalog::VERSION, 'fields' => FieldCatalog::definitions()]);
        $this->mapping = new AnalysisMapping('self-test-v1', 2, ['capability_skills' => ['skills', 'projects'], 'needed_skills' => ['needs'], 'needed_roles' => ['need_roles'], 'offered_skills' => ['offers'], 'offered_roles' => ['roles']]);
        $this->bindings = ['skills' => 'declared_skills', 'projects' => 'project_technologies', 'needs' => 'event_needed_skills', 'need_roles' => 'event_needed_roles', 'offers' => 'event_offered_skills', 'roles' => 'event_offered_roles'];
        $this->profiles = new P1SelfAnalysisProfileReader($this->events, $this->catalog, $this->mapping, $this->bindings, $this->p1->read(...), $this->p1->options(...));
        $this->store = new SqlSelfSelectionStore($this->db, $this->events, $this->identity);
        $this->manager = new ManageSelfAnalysisSelection($this->events, $this->store, $this->profiles);
        $this->selected = new P1SelectedSelfProjectionReader($this->events, $this->store, $this->profiles);
        $this->db->selects = [];
    }
    public function row(): array|false { return $this->db->createCommand('SELECT * FROM matcher_recommendation_self_selection')->queryOne(); }
    public function attributeQueries(): array { return array_values(array_filter($this->db->selects, static fn($row) => str_contains($row['sql'], 'matcher_profile_attribute'))); }
}
