<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\application;

use humhub\modules\matcherPrivacy\domain\{DiscoveryFieldPolicy, VisibilityPolicy};
use humhub\modules\matcherPrivacy\domain\ports\DiscoveryRelations;
use humhub\modules\matcherProfile\domain\{FieldCatalog, ProfileException};

/**
 * Internal read-only discovery capability, not an HTTP endpoint or an administrator shortcut.
 * Caller must bind viewerId/spaceId to authenticated server-selected activity before and after read.
 * Only current-call authorization is established; outputs are not reusable permission tokens.
 */
final class DiscoveryBatchService
{
    public const POLICY_VERSION = VisibilityPolicy::VERSION . ':' . DiscoveryFieldPolicy::VERSION;
    private readonly \Closure $profiles;

    /** $profiles is the explicit P1 batch boundary, never a loop over single-profile reads. */
    public function __construct(
        private readonly DiscoveryRelations $relations,
        callable $profiles,
        private readonly DiscoveryFieldPolicy $fields = new DiscoveryFieldPolicy(),
    ) {
        $this->profiles = \Closure::fromCallable($profiles);
    }

    /** @param list<int> $ownerIds @param list<string> $sourceKeys */
    public function read(int $viewerId, int $spaceId, array $ownerIds, array $sourceKeys): array
    {
        DiscoveryFieldPolicy::assertIds($viewerId, $spaceId, $ownerIds);
        $this->fields->assertKeys($sourceKeys);
        $eligible = $this->eligible($viewerId, $spaceId, $ownerIds);
        $result = ['schema_version' => FieldCatalog::VERSION, 'profiles' => [], 'policy_version' => self::POLICY_VERSION];
        if ($eligible !== []) {
            $batch = $this->readProfiles($eligible, $spaceId, $sourceKeys);
            $result['profiles'] = $this->projectBatch($batch, $spaceId, $eligible, $sourceKeys);
        }
        // Includes empty batches: loss of the viewer's activity access cannot become empty success.
        $current = array_fill_keys($this->eligible($viewerId, $spaceId, $eligible), true);
        $result['profiles'] = array_intersect_key($result['profiles'], $current);
        if ($current !== []) {
            // Recheck source revisions/identity and content after relationship reads. This is bounded
            // observation, not a cross-table lock or a durable authorization epoch.
            $currentIds = array_keys($current);
            $verified = $this->projectBatch($this->readProfiles($currentIds, $spaceId, $sourceKeys), $spaceId, $currentIds, $sourceKeys);
            if ($verified !== $result['profiles']) {
                throw new ProfileException('PROFILE_BATCH_CHANGED', 'Discovery profiles changed during the read.', 409);
            }
            // A source recheck itself takes time. Recheck every subject again and do not read
            // profile values after this final native gate. No persistent snapshot claim is made.
            $finalIds = array_fill_keys($this->eligible($viewerId, $spaceId, $currentIds), true);
            $result['profiles'] = array_intersect_key($result['profiles'], $finalIds);
        }
        return $result;
    }

    private function readProfiles(array $ownerIds, int $spaceId, array $sourceKeys): mixed
    {
        try {
            return ($this->profiles)($ownerIds, $spaceId, $sourceKeys);
        } catch (ProfileException $error) {
            if ($error->errorCode === 'PROFILE_BATCH_CHANGED') {
                throw new ProfileException('PROFILE_BATCH_CHANGED', 'Discovery profiles changed during the read.', 409);
            }
            $this->unavailable();
        } catch (\Throwable) {
            $this->unavailable();
        }
    }

    private function eligible(int $viewerId, int $spaceId, array $ownerIds): array
    {
        try {
            $ids = $this->relations->eligibleOwnerIds($viewerId, $spaceId, $ownerIds);
        } catch (ProfileException $error) {
            if ($error->errorCode === 'PROFILE_ACCESS_DENIED') {
                throw new ProfileException('PROFILE_ACCESS_DENIED', 'Current activity membership is required.', 403);
            }
            if ($error->errorCode === 'DISCOVERY_TRANSACTION_UNSUPPORTED') {
                throw new ProfileException('DISCOVERY_TRANSACTION_UNSUPPORTED', 'Discovery needs an independent current-read boundary.', 503);
            }
            $this->unavailable();
        } catch (\Throwable) {
            $this->unavailable();
        }
        if (!array_is_list($ids) || count($ids) > count($ownerIds)) { $this->unavailable(); }
        $seen = [];
        foreach ($ids as $id) {
            if (!is_int($id) || $id === $viewerId || !in_array($id, $ownerIds, true) || isset($seen[$id])) { $this->unavailable(); }
            $seen[$id] = true;
        }
        return array_values(array_filter($ownerIds, static fn(int $id): bool => isset($seen[$id])));
    }

    private function projectBatch(mixed $batch, int $spaceId, array $ownerIds, array $sourceKeys): array
    {
        if (!is_array($batch) || ($batch['schema_version'] ?? null) !== FieldCatalog::VERSION || !is_array($batch['profiles'] ?? null)) { $this->unavailable(); }
        $requested = array_fill_keys($ownerIds, true); $output = [];
        foreach ($batch['profiles'] as $id => $profile) {
            if (!is_int($id) || !isset($requested[$id]) || !is_array($profile) || !is_array($profile['scopes'] ?? null)
                || !isset($profile['identity_version']) || !is_int($profile['identity_version']) || $profile['identity_version'] < 0) { $this->unavailable(); }
            $scopeKeys = array_keys($profile['scopes']); sort($scopeKeys);
            if ($scopeKeys !== ['global', 'space:' . $spaceId]) { $this->unavailable(); }
            $scopes = [];
            foreach ($profile['scopes'] as $scope => $state) {
                if (!is_array($state) || !isset($state['revision'], $state['permission_version'], $state['attributes'])
                    || !is_int($state['revision']) || $state['revision'] < 0
                    || !is_int($state['permission_version']) || $state['permission_version'] < 0
                    || !is_array($state['attributes']) || !array_is_list($state['attributes'])) { $this->unavailable(); }
                $scopes[$scope] = [
                    'revision' => $state['revision'], 'permission_version' => $state['permission_version'],
                    'attributes' => $this->projectAttributes($state['attributes'], $scope, $sourceKeys),
                ];
            }
            $output[$id] = ['scopes' => $scopes, 'identity_version' => $profile['identity_version']];
        }
        $ordered = [];
        foreach ($ownerIds as $id) { if (isset($output[$id])) { $ordered[$id] = $output[$id]; } }
        return $ordered;
    }

    private function projectAttributes(array $attributes, string $scope, array $sourceKeys): array
    {
        $catalog = FieldCatalog::definitions(); $result = []; $seen = [];
        foreach ($attributes as $item) {
            if (!is_array($item) || !is_string($item['key'] ?? null)) { $this->unavailable(); }
            $key = $item['key'];
            if (!in_array($key, $sourceKeys, true) || !in_array($key, DiscoveryFieldPolicy::KEYS, true)
                || ($item['confirmation'] ?? null) !== 'confirmed' || ($item['visibility'] ?? null) !== 'authenticated') { continue; }
            if (($catalog[$key]['scope'] ?? null) !== ($scope === 'global' ? 'global' : 'event')
                || !is_string($item['attribute_id'] ?? null) || $item['attribute_id'] === '' || isset($seen[$item['attribute_id']])
                || ($item['schema_version'] ?? null) !== FieldCatalog::VERSION || !array_key_exists('value', $item)) { $this->unavailable(); }
            if ($item['value'] === null) { continue; }
            try { $errors = FieldCatalog::validate($key, $item['value']); } catch (\Throwable) { $this->unavailable(); }
            if ($errors !== []) { $this->unavailable(); }
            $seen[$item['attribute_id']] = true;
            // No source text, provenance, storage bindings, draft/identity values or extra metadata.
            $result[] = array_intersect_key($item, array_flip(['attribute_id', 'key', 'value', 'visibility', 'confirmation', 'last_confirmed_at', 'schema_version']));
        }
        return $result;
    }

    private function unavailable(): never
    {
        throw new ProfileException('PROFILE_DEPENDENCY_UNAVAILABLE', 'Discovery profile projection is unavailable.', 503);
    }
}
