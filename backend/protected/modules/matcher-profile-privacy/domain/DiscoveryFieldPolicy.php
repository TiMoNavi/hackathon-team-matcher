<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\domain;

use humhub\modules\matcherProfile\domain\{FieldCatalog, ProfileException};

/** Reviewed discovery uses only. This is not a viewer grant or a recommendation scoring policy. */
final class DiscoveryFieldPolicy
{
    public const VERSION = 'discovery-fields-v2';
    public const SCHEMA_VERSION = 2;
    public const KEYS = [
        'direction', 'interest', 'event_goal', 'headline', 'bio', 'seeking',
        'role', 'skill', 'project', 'event_role', 'event_contribution', 'event_seeking',
        'mbti', 'personality', 'collaboration_preference', 'communication_preference',
        'event_contact_preference', 'event_collaboration_mode', 'event_availability',
    ];

    /** @param list<string> $keys */
    public function assertKeys(array $keys): void
    {
        if (FieldCatalog::VERSION !== self::SCHEMA_VERSION) {
            throw new ProfileException('PROFILE_DEPENDENCY_UNAVAILABLE', 'Discovery field policy requires schema review.', 503);
        }
        if (!array_is_list($keys) || count($keys) > count(self::KEYS)) { $this->invalid(); }
        $seen = []; $catalog = FieldCatalog::definitions();
        foreach ($keys as $key) {
            if (!is_string($key) || !in_array($key, self::KEYS, true) || !isset($catalog[$key]) || isset($seen[$key])) { $this->invalid(); }
            $seen[$key] = true;
        }
    }

    public static function assertIds(int $viewerId, int $spaceId, array $ownerIds): void
    {
        if ($viewerId < 1 || $spaceId < 1 || !array_is_list($ownerIds) || count($ownerIds) > 200) { self::invalid(); }
        $seen = [];
        foreach ($ownerIds as $id) {
            if (!is_int($id) || $id < 1 || isset($seen[$id])) { self::invalid(); }
            $seen[$id] = true;
        }
    }

    private static function invalid(): never
    {
        throw new ProfileException('INVALID_DISCOVERY_REQUEST', 'Use a bounded explicit discovery request.', 422);
    }
}
