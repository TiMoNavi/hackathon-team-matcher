<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\browse;
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;
use humhub\modules\matcherRecommendation\contracts\ports\{CurrentEventAccess, DiscoverySettingsStore};
use humhub\modules\matcherRecommendation\adapters\native\NativeEligibilityQuery;
use humhub\modules\matcherRecommendation\domain\browse\DiscoveryException;
use yii\db\{Connection, IntegrityException, Query};

final class SqlDiscoverySettingsStore implements DiscoverySettingsStore
{
    public function __construct(private readonly Connection $db, private readonly CurrentEventAccess $events) {}
    public function read(CurrentEventContext $context): array
    {
        $this->events->assertCurrent($context);
        $rows = (new NativeEligibilityQuery($this->db))->run((new Query())->select(['discoverable', 'version'])->from(DiscoverySettingsSchema::TABLE)
            ->where(['owner_id' => $context->viewerId, 'space_id' => $context->spaceId])->limit(2));
        if (count($rows) > 1) { throw new DiscoveryException('DISCOVERY_UNAVAILABLE', 'Discovery settings are unavailable.', 503); }
        $this->events->assertCurrent($context);
        return ['space_id' => $context->spaceId, 'discoverable' => $rows === [] ? false : (bool)$rows[0]['discoverable'], 'version' => $rows === [] ? 0 : (int)$rows[0]['version']];
    }
    public function change(CurrentEventContext $context, int $expectedVersion, bool $discoverable): array
    {
        if ($expectedVersion < 0 || $expectedVersion >= 2147483646) { throw new DiscoveryException('INVALID_VERSION', 'Use a valid expected_version.'); }
        $before = $this->read($context);
        if ($before['version'] !== $expectedVersion) { throw new DiscoveryException('DISCOVERY_VERSION_CONFLICT', 'Discovery settings changed. Read the current version.', 409); }
        $key = ['owner_id' => $context->viewerId, 'space_id' => $context->spaceId]; $version = $expectedVersion + 1;
        $changed = $this->mutate(function (Connection $db) use ($expectedVersion, $discoverable, $key, $version): int {
            if ($expectedVersion === 0) { return $db->createCommand()->insert(DiscoverySettingsSchema::TABLE, $key + ['discoverable' => $discoverable, 'version' => $version])->execute(); }
            return $db->createCommand()->update(DiscoverySettingsSchema::TABLE, ['discoverable' => $discoverable, 'version' => $version], $key + ['version' => $expectedVersion])->execute();
        });
        if ($changed !== 1) { throw new DiscoveryException('DISCOVERY_VERSION_CONFLICT', 'Discovery settings changed. Read the current version.', 409); }
        try { $this->events->assertCurrent($context); }
        catch (\Throwable $error) {
            // Restore only this write if the selection changed; never overwrite a later user action.
            $this->mutate(fn(Connection $db): int => $db->createCommand()->update(DiscoverySettingsSchema::TABLE,
                ['discoverable' => $before['discoverable'], 'version' => $version + 1], $key + ['version' => $version])->execute());
            throw $error;
        }
        return ['space_id' => $context->spaceId, 'discoverable' => $discoverable, 'version' => $version];
    }
    private function mutate(callable $operation): int
    {
        if ($this->db->getTransaction()?->isActive) { throw new DiscoveryException('DISCOVERY_UNAVAILABLE', 'Discovery settings require an independent current connection.', 503); }
        $logging = $this->db->enableLogging; $profiling = $this->db->enableProfiling; $this->db->enableLogging = false; $this->db->enableProfiling = false;
        try { return $this->db->useMaster(fn(Connection $db): int => $db->noCache($operation)); }
        catch (IntegrityException) { throw new DiscoveryException('DISCOVERY_VERSION_CONFLICT', 'Discovery settings changed. Read the current version.', 409); }
        catch (DiscoveryException $error) { throw $error; }
        catch (\Throwable) { throw new DiscoveryException('DISCOVERY_UNAVAILABLE', 'Discovery settings are unavailable.', 503); }
        finally { $this->db->enableLogging = $logging; $this->db->enableProfiling = $profiling; }
    }
}
