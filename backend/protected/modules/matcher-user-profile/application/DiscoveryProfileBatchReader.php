<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\application;

use humhub\modules\matcherProfile\domain\{DiscoveryProfileBatchRequest, FieldCatalog, ProfileException};
use humhub\modules\matcherProfile\domain\ports\DiscoveryProfileBatchSource;

/** P1 internal batch use case. P8 supplies viewer/entry authorization; no admin bypass exists here. */
final class DiscoveryProfileBatchReader
{
    public function __construct(private readonly DiscoveryProfileBatchSource $source) {}

    public function read(array $ownerIds, int $spaceId, array $sourceKeys, ?array $attributeIds = null): array
    {
        $request = new DiscoveryProfileBatchRequest($ownerIds, $spaceId, $sourceKeys, $attributeIds);
        if ($ownerIds === []) { return ['schema_version' => FieldCatalog::VERSION, 'profiles' => []]; }
        $result = $this->source->read($request);
        if (($result['schema_version'] ?? null) !== FieldCatalog::VERSION || !is_array($result['profiles'] ?? null)) { self::invalidSource(); }
        $catalog = FieldCatalog::definitions();
        $profiles = [];
        foreach ($ownerIds as $ownerId) {
            $profile = $result['profiles'][$ownerId] ?? null;
            if (!is_array($profile) || !is_int($profile['identity_version'] ?? null) || $profile['identity_version'] < 0
                || !is_array($profile['scopes'] ?? null)) { self::invalidSource(); }
            $scopes = [];
            foreach (['global', 'space:' . $spaceId] as $scope) {
                $state = $profile['scopes'][$scope] ?? null;
                if (!is_array($state) || !is_int($state['revision'] ?? null) || $state['revision'] < 0
                    || !is_int($state['permission_version'] ?? null) || $state['permission_version'] < 0
                    || !is_array($state['attributes'] ?? null) || !array_is_list($state['attributes'])) { self::invalidSource(); }
                $attributes = []; $seen = []; $counts = [];
                foreach ($state['attributes'] as $item) {
                    $key = is_array($item) ? ($item['key'] ?? null) : null;
                    if (!is_string($key) || !in_array($key, $sourceKeys, true) || !isset($catalog[$key])
                        || ($catalog[$key]['scope'] === 'global') !== ($scope === 'global')
                        || ($item['visibility'] ?? null) !== 'authenticated' || ($item['confirmation'] ?? null) !== 'confirmed'
                        || !is_string($item['attribute_id'] ?? null) || $item['attribute_id'] === ''
                        || !is_string($item['last_confirmed_at'] ?? null) || $item['last_confirmed_at'] === ''
                        || !is_int($item['schema_version'] ?? null) || $item['schema_version'] < 1
                        || !is_int($item['sort_order'] ?? null) || !array_key_exists('value', $item)) { self::invalidSource(); }
                    if (isset($seen[$item['attribute_id']]) || ($attributeIds !== null && !in_array($item['attribute_id'], $attributeIds, true))) { self::invalidSource(); }
                    $seen[$item['attribute_id']] = true;
                    $counts[$key] = ($counts[$key] ?? 0) + 1;
                    if ($counts[$key] > $catalog[$key]['max_items']) { self::invalidSource(); }
                    // An unavailable/older-schema optional value stays unknown. Never substitute raw native data.
                    if ($item['value'] === null || $item['schema_version'] !== FieldCatalog::VERSION) { continue; }
                    if (FieldCatalog::validate($key, $item['value']) !== []) { self::invalidSource(); }
                    $attributes[] = array_intersect_key($item, array_flip(['attribute_id', 'key', 'value', 'visibility', 'confirmation', 'last_confirmed_at', 'display_label', 'sort_order', 'schema_version']));
                }
                $scopes[$scope] = ['revision' => $state['revision'], 'permission_version' => $state['permission_version'], 'attributes' => $attributes];
            }
            $profiles[$ownerId] = ['scopes' => $scopes, 'identity_version' => $profile['identity_version']];
        }
        if (count($result['profiles']) !== count($profiles)) { self::invalidSource(); }
        return ['schema_version' => FieldCatalog::VERSION, 'profiles' => $profiles];
    }

    private static function invalidSource(): never
    {
        throw new ProfileException('PROFILE_BATCH_UNAVAILABLE', 'The batch profile source returned an invalid projection.', 503);
    }
}
