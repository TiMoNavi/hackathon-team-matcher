<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\application;
use humhub\modules\matcherProfile\domain\{FieldCatalog, ProfileException};
use humhub\modules\matcherProfile\domain\ports\ConfirmedIdentityBatchSource;

/** No username, real-name, email or unconfirmed-upload fallback. */
final class ConfirmedIdentityBatchReader
{
    public function __construct(private readonly ConfirmedIdentityBatchSource $source) {}
    public function read(array $ownerIds): array
    {
        if (!array_is_list($ownerIds) || count($ownerIds) > 200 || count(array_unique($ownerIds, SORT_REGULAR)) !== count($ownerIds)) { self::invalid(); }
        foreach ($ownerIds as $id) { if (!is_int($id) || $id < 1) { self::invalid(); } }
        if ($ownerIds === []) { return []; }
        $identities = $this->source->read($ownerIds); $result = [];
        foreach ($identities as $id => $identity) {
            if (!is_int($id) || !in_array($id, $ownerIds, true) || !is_array($identity)
                || !is_string($identity['display_name'] ?? null) || FieldCatalog::validate('nickname', $identity['display_name']) !== []
                || !is_int($identity['identity_version'] ?? null) || $identity['identity_version'] < 1
                || !is_string($identity['confirmed_at'] ?? null)
                || !array_key_exists('avatar_ref', $identity)
                || ($identity['avatar_ref'] !== null && (!is_string($identity['avatar_ref']) || !preg_match('/^mpr_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/D', $identity['avatar_ref'])))) {
                throw new ProfileException('PROFILE_BATCH_UNAVAILABLE', 'The confirmed identity batch is unavailable.', 503);
            }
            $result[$id] = array_intersect_key($identity, array_flip(['display_name', 'identity_version', 'avatar_ref', 'confirmed_at']));
        }
        return $result;
    }
    private static function invalid(): never { throw new ProfileException('INVALID_PROFILE_BATCH', 'Use at most 200 unique owner IDs.', 422); }
}
