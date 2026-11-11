<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\application;
use humhub\modules\matcherPrivacy\domain\ports\{CurrentProfileEntry, RelationCandidateSource, RelationSharingRepository};
use humhub\modules\matcherPrivacy\domain\RelationCursor;
use humhub\modules\matcherProfile\domain\{ProfileException, RelationAccessContext};
use humhub\modules\matcherProfile\domain\ports\ProfileRelationReader;

/** Bounded authorized relation metadata. Messaging authorization remains in its owning module. */
final class ProfileRelationService implements ProfileRelationReader
{
    public const POLICY = 'profile-relations-v1';
    private \Closure $clock;
    public function __construct(private CurrentProfileEntry $entry, private RelationCandidateSource $source, private RelationSharingRepository $sharing, private RelationCursor $cursors, ?callable $clock = null)
    { $this->clock = $clock === null ? time(...) : \Closure::fromCallable($clock); }
    public function read(RelationAccessContext $context, string $kind, ?string $cursor = null, int $limit = 24): array
    {
        $this->kind($kind);
        if ($limit < 1 || $limit > 48) { throw new ProfileException('INVALID_LIMIT', 'Use limit from 1 to 48.'); }
        if ($context->currentSpaceId === null || !in_array($context->entryKind, ['self', 'event_card'], true)
            || $context->entryId !== (string)($context->entryKind === 'self' ? $context->ownerId : $context->currentSpaceId)) {
            throw new ProfileException('PROFILE_ACCESS_DENIED', 'A current activity profile entry is required.', 403);
        }
        $viewerId = $context->viewerId; $ownerId = $context->ownerId; $spaceId = $context->currentSpaceId;
        [$facts, $candidates, $choices] = $this->snapshot($viewerId, $ownerId, $spaceId, $kind);
        $fingerprint = $this->fingerprint([$facts, $candidates, $choices]);
        $binding = ['viewer_id' => $viewerId, 'owner_id' => $ownerId, 'space_id' => $spaceId, 'kind' => $kind, 'limit' => $limit, 'policy' => self::POLICY, 'snapshot' => $fingerprint];
        $now = ($this->clock)(); $created = $now; $position = 0;
        if ($cursor !== null) {
            $data = $this->cursors->decode($cursor);
            if (array_intersect_key($data, $binding) !== $binding || array_diff(array_keys($data), array_merge(array_keys($binding), ['position', 'created_at', 'expires_at'])) !== []
                || !is_int($data['position'] ?? null) || $data['position'] < 0 || !is_int($data['created_at'] ?? null) || !is_int($data['expires_at'] ?? null)
                || $data['created_at'] > $now || $data['expires_at'] !== $data['created_at'] + 900) { throw new ProfileException('RELATION_CURSOR_INVALID', 'The cursor no longer matches this viewer, activity, query or permissions.', 409); }
            if ($data['expires_at'] <= $now) { throw new ProfileException('RELATION_CURSOR_EXPIRED', 'The relation cursor expired. Start a new list.', 410); }
            $created = $data['created_at']; $position = $data['position'];
        }
        $visible = [];
        foreach ($candidates as $item) {
            $choice = $choices[$item['id']] ?? ['version' => 0, 'visibility' => 'private'];
            if ($viewerId === $ownerId || $choice['visibility'] === 'authenticated' || ($choice['visibility'] === 'friends' && $facts['friend'])) {
                $visible[] = $item + ['visibility' => $choice['visibility'], 'sharing_version' => $choice['version']];
            }
        }
        if ($position > count($visible)) { throw new ProfileException('RELATION_CURSOR_INVALID', 'The relation position is no longer available.', 409); }
        $items = array_slice($visible, $position, $limit); $next = $position + count($items); $more = $next < count($visible);
        if ($fingerprint !== $this->fingerprint($this->snapshot($viewerId, $ownerId, $spaceId, $kind))) { throw new ProfileException('PROFILE_RELATIONS_CHANGED', 'Relations or access changed during the read. Retry.', 409); }
        return ['owner_id' => $ownerId, 'space_id' => $spaceId, 'kind' => $kind, 'items' => $items, 'next_cursor' => $more ? $this->cursors->encode($binding + ['position' => $next, 'created_at' => $created, 'expires_at' => $created + 900]) : null, 'has_more' => $more, 'limit' => $limit, 'policy_version' => self::POLICY];
    }
    public function share(int $ownerId, int $spaceId, string $kind, string $objectId, int $expectedVersion, string $visibility): array
    {
        $this->kind($kind);
        if ($expectedVersion < 0 || !in_array($visibility, ['authenticated', 'friends', 'private'], true) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/D', $objectId)) { throw new ProfileException('INVALID_RELATION_SHARING', 'Provide a valid object, expected_version and visibility.'); }
        $first = $this->snapshot($ownerId, $ownerId, $spaceId, $kind);
        if (!in_array($objectId, array_column($first[1], 'id'), true)) { throw new ProfileException('RELATION_NOT_FOUND', 'The relation is unavailable in the current activity.', 404); }
        if ($first !== $this->snapshot($ownerId, $ownerId, $spaceId, $kind)) { throw new ProfileException('PROFILE_RELATIONS_CHANGED', 'Relation access changed. Retry.', 409); }
        $saved = $this->sharing->save($ownerId, $spaceId, $kind, $objectId, $expectedVersion, $visibility);
        try {
            $after = $this->snapshot($ownerId, $ownerId, $spaceId, $kind);
            if (array_slice($first, 0, 2) !== array_slice($after, 0, 2)) { throw new ProfileException('PROFILE_RELATIONS_CHANGED', 'Relation access changed while saving. Retry.', 409); }
        } catch (\Throwable $error) {
            // A later write by the owner wins. Compensate only this exact version with a newer CAS.
            try { $this->sharing->save($ownerId, $spaceId, $kind, $objectId, $saved['version'], $first[2][$objectId]['visibility'] ?? 'private'); } catch (\Throwable) {}
            throw $error;
        }
        return ['owner_id' => $ownerId, 'space_id' => $spaceId, 'kind' => $kind, 'object_id' => $objectId] + $saved;
    }
    private function snapshot(int $viewerId, int $ownerId, int $spaceId, string $kind): array
    {
        $facts = $this->entry->resolve($viewerId, $ownerId, $spaceId);
        try { $candidates = $this->source->readCandidates($viewerId, $ownerId, $spaceId, $kind); }
        catch (ProfileException $error) { throw $error; }
        catch (\Throwable) { throw new ProfileException('RELATION_SOURCE_UNAVAILABLE', 'The relation source is unavailable.', 503); }
        if (!array_is_list($candidates) || count($candidates) > 2000) { throw new ProfileException('RELATION_CAPACITY_EXCEEDED', 'Relation source exceeds the supported 2,000 objects. No objects were truncated.', 503); }
        $ids = []; $clean = [];
        foreach ($candidates as $item) {
            $expectedKind = $kind === 'activities' ? 'activity' : 'idea_group';
            if (!is_array($item) || ($item['kind'] ?? null) !== $expectedKind || !is_string($item['id'] ?? null) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/D', $item['id'])
                || isset($ids[$item['id']]) || ($item['event_id'] ?? null) !== (string)$spaceId || !is_string($item['title'] ?? null) || mb_strlen($item['title']) > 255
                || (!is_string($item['summary'] ?? null) && ($item['summary'] ?? null) !== null) || strlen($item['summary'] ?? '') > 16384
                || !is_string($item['href'] ?? null) || !str_starts_with($item['href'], '/') || str_starts_with($item['href'], '//')
                || !is_string($item['version'] ?? null) || !is_string($item['membership_role'] ?? null)) { $this->sourceInvalid(); }
            if ($kind === 'idea_groups' && (!is_string($item['idea_id'] ?? null) || !is_bool($item['conversation_available'] ?? null) || !in_array($item['membership_role'], ['creator', 'participant'], true)
                || $item['href'] !== '/api/v1/ideas/' . rawurlencode($item['idea_id']) . '?idea_activity_id=' . rawurlencode($item['id']))) { $this->sourceInvalid(); }
            $ids[$item['id']] = true;
            $clean[] = array_intersect_key($item, array_flip(['kind', 'id', 'title', 'summary', 'href', 'event_id', 'membership_role', 'idea_id', 'version', 'conversation_available']));
        }
        usort($clean, static fn(array $a, array $b): int => strcmp($a['id'], $b['id']));
        $choices = $this->sharing->read($ownerId, $spaceId, $kind); ksort($choices, SORT_STRING);
        if ($facts !== $this->entry->resolve($viewerId, $ownerId, $spaceId)) { throw new ProfileException('PROFILE_RELATIONS_CHANGED', 'Current activity entry changed during the read.', 409); }
        return [$facts, $clean, $choices];
    }
    private function kind(string $kind): void { if (!in_array($kind, ['activities', 'idea_groups'], true)) { throw new ProfileException('INVALID_RELATION_KIND', 'Use activities or idea_groups.'); } }
    private function fingerprint(array $data): string { return hash('sha256', json_encode($data, JSON_THROW_ON_ERROR)); }
    private function sourceInvalid(): never { throw new ProfileException('RELATION_SOURCE_UNAVAILABLE', 'The relation source returned invalid metadata.', 503); }
}
