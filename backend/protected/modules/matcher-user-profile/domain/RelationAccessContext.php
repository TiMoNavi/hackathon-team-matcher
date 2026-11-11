<?php
declare(strict_types=1);

namespace humhub\modules\matcherProfile\domain;

/**
 * Internal request DTO, not an authorization grant. Only an application authorization
 * service may supply it. Adapters still revalidate current permissions at read time.
 */
final class RelationAccessContext
{
    public function __construct(
        public readonly int $ownerId,
        public readonly int $viewerId,
        public readonly string $entryKind,
        public readonly string $entryId,
        public readonly ?int $currentSpaceId,
    ) {
        if ($ownerId <= 0 || $viewerId <= 0 || ($currentSpaceId !== null && $currentSpaceId <= 0)) {
            throw new \InvalidArgumentException('Invalid relation context identity');
        }
        if (!in_array($entryKind, ['self', 'event_card', 'public_post', 'friend', 'existing_conversation'], true) || trim($entryId) === '') {
            throw new \InvalidArgumentException('A verified profile entry is required');
        }
        if ($entryKind === 'self' && $ownerId !== $viewerId) {
            throw new \InvalidArgumentException('Self entry must belong to the viewer');
        }
        if ($entryKind === 'event_card' && $currentSpaceId === null) {
            throw new \InvalidArgumentException('Activity entry requires current activity context');
        }
    }
}
