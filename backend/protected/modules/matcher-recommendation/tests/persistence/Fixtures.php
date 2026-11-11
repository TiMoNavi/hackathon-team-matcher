<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\tests\persistence;
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;
use humhub\modules\matcherRecommendation\contracts\ports\CurrentEventAccess;
use humhub\modules\matcherRecommendation\adapters\persistence\RecommendationStorageSchema;
use humhub\modules\matcherRecommendation\domain\DiscoveryBatch;
use humhub\modules\matcherRecommendation\tests\policy\Fixtures as PF;
use yii\db\Connection;

final class CountingConnection extends Connection
{
    public array $observations = [];
    public function createCommand($sql = null, $params = [])
    {
        $this->observations[] = ['master' => !$this->enableSlaves, 'cache_disabled' => $this->getQueryCacheInfo(null, null) === null, 'logging' => $this->enableLogging, 'profiling' => $this->enableProfiling];
        return parent::createCommand($sql, $params);
    }
}
final class MutableEvents implements CurrentEventAccess
{
    public int $checks = 0;
    public ?int $failAt = null;
    public function resolve(int $viewerId, ?int $requestedSpaceId = null): CurrentEventContext { return PF::context(); }
    public function assertCurrent(CurrentEventContext $context): void
    {
        $this->checks++;
        if ($this->checks === $this->failAt || $context->viewerId !== 1 || $context->spaceId !== 7) { throw new \RuntimeException('Synthetic activity revoked.'); }
    }
}
final class Fixtures
{
    public static function database(): CountingConnection
    {
        $db = new CountingConnection(['dsn' => 'sqlite::memory:', 'enableLogging' => false, 'enableProfiling' => false, 'enableSchemaCache' => false, 'schemaCache' => null, 'queryCache' => new \yii\caching\ArrayCache()]);
        $db->open();
        $db->createCommand('CREATE TABLE native_sentinel (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')->execute();
        $db->createCommand()->insert('native_sentinel', ['id' => 1, 'value' => 'synthetic-original-unchanged'])->execute();
        RecommendationStorageSchema::install($db); $db->observations = [];
        return $db;
    }
    public static function batch(int $size = 2, bool $legacy = false, ?\DateTimeImmutable $created = null, ?\DateTimeImmutable $expires = null): DiscoveryBatch
    {
        $ids = $size === 0 ? [] : array_map('strval', range(2, $size + 1)); $projection = []; $relationships = [];
        foreach ($ids as $id) { $projection[$id] = hash('sha256', 'synthetic-projection-' . $id); $relationships[$id] = 'synthetic-relation-' . $id; }
        $created ??= new \DateTimeImmutable('2026-11-11T10:11:12.123456', new \DateTimeZone('Asia/Shanghai'));
        $expires ??= $created->add(new \DateInterval('PT15M'));
        return new DiscoveryBatch(PF::context(), hash('sha256', 'synthetic-query'), 'synthetic-policy-v1', $ids, $projection, $relationships, $created, $expires, $legacy ? null : hash('sha256', 'synthetic-policy-payload'));
    }
}
