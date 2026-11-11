<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\tests\live_recall;

use humhub\modules\matcherProfile\tests\discovery_batch\{CountingConnection, Fixtures as PF};
use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\application\DiscoveryProfileBatchReader;
use humhub\modules\matcherProfile\adapters\persistence\SqlDiscoveryProfileBatchSource;
use humhub\modules\matcherPrivacy\application\DiscoveryBatchService;
use humhub\modules\matcherPrivacy\adapters\native\NativeDiscoveryRelations;
use humhub\modules\matcherRecommendation\adapters\composition\NativeRuleDiscoveryFactory;
use humhub\modules\matcherRecommendation\adapters\profile\{P1FieldCatalogAdapter, P1SourcePurposePolicy};
use humhub\modules\matcherRecommendation\adapters\index\CandidateIndexSchema;
use humhub\modules\matcherRecommendation\adapters\native\{CurrentEventSelectionSchema, SqlCurrentEventSelectionStore, ServerActorSessionSource, NativeCurrentEventAccess};
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;
use humhub\modules\matcherRecommendation\contracts\ports\{PolicyStore, DiscoveryBatchStore, Clock};
use humhub\modules\matcherRecommendation\domain\{RulePolicy, DiscoveryBatch};
use humhub\modules\matcherRecommendation\tests\native_access\{Fixtures as NF, MutableSelection};
use humhub\modules\matcherRecommendation\tests\policy\Fixtures as PolicyFixtures;

/** Test-only policy publication and batch persistence. No production defaults or HTTP claims. */
final class MemoryPolicies implements PolicyStore
{
    public ?\Closure $onRead = null;
    public int $reads = 0;
    public function __construct(public RulePolicy $policy) {}
    public function current(CurrentEventContext $context): RulePolicy
    {
        $this->reads++;
        if ($this->onRead !== null) { ($this->onRead)($this); }
        return $this->policy;
    }
}
final class MemoryBatches implements DiscoveryBatchStore
{
    public array $rows = [];
    public function put(DiscoveryBatch $batch): string { $id = 'synthetic-batch-' . (count($this->rows) + 1); $this->rows[$id] = $batch; return $id; }
    public function get(string $batchId): ?DiscoveryBatch { return $this->rows[$batchId] ?? null; }
}
final class FixedClock implements Clock
{
    public function now(): \DateTimeImmutable { return new \DateTimeImmutable('2026-11-11T00:00:00+08:00'); }
}

final class Fixtures
{
    public static function database(int $candidates): CountingConnection
    {
        $db = PF::database($candidates + 1);
        foreach (['contentcontainer_id INTEGER', 'status INTEGER DEFAULT 1', 'visibility INTEGER DEFAULT 1', 'updated_at TEXT'] as $column) {
            $db->createCommand('ALTER TABLE user ADD COLUMN ' . $column)->execute();
        }
        foreach ([
            'CREATE TABLE space (id INTEGER PRIMARY KEY, contentcontainer_id INTEGER, status INTEGER, visibility INTEGER, join_policy INTEGER, updated_at TEXT)',
            'CREATE TABLE space_membership (id INTEGER PRIMARY KEY AUTOINCREMENT, space_id INTEGER, user_id INTEGER, status INTEGER, group_id TEXT, created_at TEXT, updated_at TEXT)',
            'CREATE TABLE contentcontainer_blocked_users (contentcontainer_id INTEGER, user_id INTEGER, PRIMARY KEY(contentcontainer_id,user_id))',
            'CREATE TABLE user_friendship (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, friend_user_id INTEGER, created_at TEXT)',
        ] as $sql) { $db->createCommand($sql)->execute(); }
        foreach ([7, 8] as $space) { $db->createCommand()->insert('space', ['id' => $space, 'contentcontainer_id' => 1000 + $space, 'status' => 1, 'visibility' => 0, 'join_policy' => 1])->execute(); }
        for ($id = 1; $id <= $candidates + 1; $id++) {
            $db->createCommand()->update('user', ['contentcontainer_id' => 10000 + $id], ['id' => $id])->execute();
            NF::member($db, $id);
            PF::attribute($db, $id, 'global', 'interest', ['code' => 'social', 'label' => 'Social']);
        }
        NF::member($db, 1, 8);
        $db->schemaCache = null;
        CandidateIndexSchema::install($db); \humhub\modules\matcherRecommendation\adapters\index\CandidateIndexLifecycleSchema::install($db);
        CurrentEventSelectionSchema::install($db);
        $db->selects = [];
        return $db;
    }

    public static function policy(): RulePolicy
    {
        $catalog = (new P1FieldCatalogAdapter(fn() => ['schema_version' => FieldCatalog::VERSION, 'fields' => FieldCatalog::definitions()]))->read();
        $grants = (new P1SourcePurposePolicy())->sourceGrants($catalog);
        $p = PolicyFixtures::parameters();
        $p['bindings'] = ['topics' => $grants['interest'], 'skills' => $grants['skill'], 'offers' => $grants['event_role'], 'availability' => $grants['event_availability']];
        $p['rules'] = [ ...array_slice($p['rules'], 0, 4), $p['rules'][6] ];
        return new RulePolicy('synthetic-live-policy-v1', $p);
    }

    public static function factory(CountingConnection $db, ?MemoryPolicies $policies = null, ?MutableSelection $selection = null, int $capacity = 2000): array
    {
        if ($selection === null) {
            $actor = new class implements ServerActorSessionSource {
                public function read(): array { return ['actor_id' => 1, 'session_hash' => hash('sha256', 'synthetic-server-session')]; }
            };
            $selection = new SqlCurrentEventSelectionStore($db, $actor, 'synthetic-activity-policy-1');
            $selection->select(7, null);
            $events = new NativeCurrentEventAccess($db, $selection, 'synthetic-activity-policy-1');
        } else {
            $events = NF::events($db, $selection);
        }
        $profiles = new DiscoveryProfileBatchReader(new SqlDiscoveryProfileBatchSource($db));
        $privacy = new DiscoveryBatchService(new NativeDiscoveryRelations($db), [$profiles, 'read']);
        $batches = new MemoryBatches();
        $policies ??= new MemoryPolicies(self::policy());
        $factory = new NativeRuleDiscoveryFactory($db, $events,
            new P1FieldCatalogAdapter(fn() => ['schema_version' => FieldCatalog::VERSION, 'fields' => FieldCatalog::definitions()]),
            [$privacy, 'read'], $policies, $batches, new FixedClock(), $capacity);
        return [$factory, $policies, $batches, $events];
    }

    public static function topic(CountingConnection $db, int $id, string $code): void
    {
        $db->createCommand()->update('matcher_profile_attribute', ['value_json' => json_encode(['code' => $code, 'label' => $code])], ['state_id' => $id . '-global', 'field_key' => 'interest'])->execute();
    }

    public static function time(CountingConnection $db, int $id, string $start, string $end, string $suffix = 'one'): void
    {
        PF::attribute($db, $id, 'space:7', 'event_availability', ['starts_at' => $start, 'ends_at' => $end, 'timezone' => 'Asia/Shanghai'], ['attribute_id' => $id . '-availability-' . $suffix]);
    }

    public static function clean(CountingConnection $db): bool
    {
        return (int)$db->createCommand('SELECT COUNT(*) FROM matcher_recommendation_search_term')->queryScalar() === 0
            && (int)$db->createCommand('SELECT COUNT(*) FROM matcher_recommendation_search_interval')->queryScalar() === 0
            && (int)$db->createCommand('SELECT COUNT(*) FROM matcher_recommendation_index_generation')->queryScalar() === 0;
    }
}
