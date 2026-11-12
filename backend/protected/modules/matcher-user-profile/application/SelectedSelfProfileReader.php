<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\application;

use humhub\modules\matcherProfile\domain\{ProfileException, ProfileScope};
use humhub\modules\matcherProfile\domain\ports\ProfileAccessPolicy;

/**
 * Owner-only confirmed/authenticated values for an explicitly bounded downstream purpose.
 * Caller must supply the reviewed purpose keys and validate the server's current activity.
 * This never turns ordinary owner access to private/draft/source data into analysis consent.
 */
final class SelectedSelfProfileReader
{
    public const POLICY_VERSION = 'p1-selected-self-confirmed-authenticated-v1';
    public function __construct(private readonly ProfileAccessPolicy $access, private readonly DiscoveryProfileBatchReader $profiles) {}

    /** Selected analysis path: IDs always explicit, including [] for metadata-only verification. */
    public function read(int $actorId, int $spaceId, array $sourceKeys, array $attributeIds): array
    {
        return $this->project($actorId, $spaceId, $sourceKeys, $attributeIds);
    }

    /** Separate owner picker purpose. This list is not a saved analysis selection or consent. */
    public function options(int $actorId, int $spaceId, array $sourceKeys): array
    {
        return $this->project($actorId, $spaceId, $sourceKeys, null);
    }

    private function project(int $actorId, int $spaceId, array $sourceKeys, ?array $attributeIds): array
    {
        if ($actorId < 1 || $spaceId < 1) { throw new ProfileException('INVALID_PROFILE_BATCH', 'A signed-in owner and current activity are required.', 422); }
        $global = ProfileScope::global(); $event = ProfileScope::event($spaceId);
        $this->access->assertOwner($actorId, $actorId, $global); $this->access->assertOwner($actorId, $actorId, $event);
        $result = $this->profiles->read([$actorId], $spaceId, $sourceKeys, $attributeIds);
        $seen = [];
        foreach ($result['profiles'][$actorId]['scopes'] as &$scope) {
            foreach ($scope['attributes'] as &$attribute) {
                if (isset($seen[$attribute['attribute_id']])) { $this->unavailable(); }
                $seen[$attribute['attribute_id']] = true;
                // Share the minimal profile envelope, not editor/storage or display metadata.
                $attribute = array_intersect_key($attribute, array_flip(['attribute_id', 'key', 'value', 'confirmation', 'visibility', 'schema_version', 'last_confirmed_at']));
            }
            unset($attribute);
        }
        unset($scope);
        if ($attributeIds !== null && count($seen) !== count($attributeIds)) { $this->unavailable(); }
        $this->access->assertOwner($actorId, $actorId, $global); $this->access->assertOwner($actorId, $actorId, $event);
        $result['policy_version'] = self::POLICY_VERSION;
        return $result;
    }

    private function unavailable(): never
    {
        throw new ProfileException('PROFILE_SELECTION_UNAVAILABLE', 'One or more explicitly selected profile attributes are unavailable.', 409);
    }
}
