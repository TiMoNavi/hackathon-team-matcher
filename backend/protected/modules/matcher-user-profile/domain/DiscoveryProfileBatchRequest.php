<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain;

/** Bounded internal read request. It carries no viewer or activity authorization. */
final class DiscoveryProfileBatchRequest
{
    public const MAX_OWNERS = 200;

    public function __construct(
        public readonly array $ownerIds,
        public readonly int $spaceId,
        public readonly array $sourceKeys,
    ) {
        if ($spaceId <= 0 || !array_is_list($ownerIds) || count($ownerIds) > self::MAX_OWNERS
            || !array_is_list($sourceKeys) || count($sourceKeys) > count(FieldCatalog::definitions())) { self::invalid(); }
        foreach ($ownerIds as $id) { if (!is_int($id) || $id <= 0) { self::invalid(); } }
        if (count(array_unique($ownerIds, SORT_REGULAR)) !== count($ownerIds)) { self::invalid(); }
        $catalog = FieldCatalog::definitions();
        foreach ($sourceKeys as $key) {
            if (!is_string($key) || !isset($catalog[$key]) || str_starts_with($key, 'contact_')) { self::invalid(); }
        }
        if (count(array_unique($sourceKeys, SORT_STRING)) !== count($sourceKeys)) { self::invalid(); }
    }

    private static function invalid(): never
    {
        throw new ProfileException('INVALID_PROFILE_BATCH', 'Use at most 200 unique positive owner IDs and known non-contact profile keys.', 422);
    }
}
