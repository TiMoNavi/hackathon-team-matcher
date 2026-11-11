<?php
declare(strict_types=1);
namespace humhub\modules\matcherIdeas\application;
use humhub\modules\matcherIdeas\domain\IdeaException;
use humhub\modules\matcherIdeas\domain\ports\{IdeaRepository, NativeRelations, CurrentSpaceAccess};

/** Internal object/participation facts. P8 must intersect the owner's disclosure choice and legitimate profile entry. */
final class IdeaRelationSource
{
    public const MAX_CANDIDATES = 2000;
    public function __construct(private IdeaRepository $repository, private NativeRelations $native, private CurrentSpaceAccess $spaces) {}

    public function readCandidates(int $viewerId, int $ownerId, int $spaceId): array
    {
        return $this->repository->transaction(fn(): array => $this->readCurrentCandidates($viewerId, $ownerId, $spaceId));
    }
    private function readCurrentCandidates(int $viewerId, int $ownerId, int $spaceId): array
    {
        $stamp = $this->spaces->stamp($viewerId, $spaceId);
        $this->pair($viewerId, $ownerId, $spaceId);
        $items = []; $afterId = 0; $scanned = 0;
        do {
            $batch = $this->repository->candidates($spaceId, $afterId, 200);
            foreach ($batch as $activity) {
                if (++$scanned > self::MAX_CANDIDATES) { throw new IdeaException('IDEA_RELATIONS_LIMIT_EXCEEDED', 'The relation set exceeds the supported bound.', 503); }
                $afterId = $activity['id'];
                if (!$activity['members_visible']) { continue; }
                $conversation = $this->validConversation($activity);
                if ($conversation === null || !in_array($ownerId, $conversation['participant_ids'], true)
                    || $this->native->isBlocked($viewerId, $activity['creator_id'])) { continue; }
                $items[] = $this->metadata($activity, $viewerId, $conversation) + [
                    'kind' => 'idea_group', 'id' => (string)$activity['id'],
                    'membership_role' => $activity['creator_id'] === $ownerId ? 'creator' : 'participant',
                ];
            }
        } while (count($batch) === 200);
        $this->pair($viewerId, $ownerId, $spaceId);
        if ($stamp !== $this->spaces->stamp($viewerId, $spaceId)) { throw new IdeaException('CURRENT_EVENT_CHANGED', 'The current Space changed.', 409); }
        return $items;
    }

    /** Formal published metadata only. A conversation URL or its identifier is never returned. */
    public function detail(int $viewerId, int $ideaId, int $activityId, int $spaceId): array
    {
        return $this->repository->transaction(fn(): array => $this->readCurrentDetail($viewerId, $ideaId, $activityId, $spaceId));
    }
    private function readCurrentDetail(int $viewerId, int $ideaId, int $activityId, int $spaceId): array
    {
        $stamp = $this->spaces->stamp($viewerId, $spaceId);
        $this->pair($viewerId, $viewerId, $spaceId);
        $activity = $this->repository->activity($activityId);
        $idea = $this->repository->idea($ideaId);
        if ($activity === null || $idea === null || $activity['idea_id'] !== $ideaId || $activity['space_id'] !== $spaceId || $activity['status'] !== 'published'
            || $idea['status'] !== 'active' || !$this->native->isSpaceMember($idea['creator_id'], $spaceId)
            || $this->native->isBlocked($viewerId, $idea['creator_id'])) {
            throw new IdeaException('IDEA_NOT_FOUND', 'The idea is unavailable in the current Space.', 404);
        }
        $activity += ['title' => $idea['title'], 'summary' => $idea['summary'], 'creator_id' => $idea['creator_id'], 'idea_version' => $idea['version']];
        $conversation = $activity['message_id'] === null ? null : $this->validConversation($activity);
        $result = $this->metadata($activity, $viewerId, $conversation) + ['idea_activity_id' => (string)$activityId];
        if ($stamp !== $this->spaces->stamp($viewerId, $spaceId)) { throw new IdeaException('CURRENT_EVENT_CHANGED', 'The current Space changed.', 409); }
        return $result;
    }

    private function pair(int $viewerId, int $ownerId, int $spaceId): void
    {
        if (!$this->native->isSpaceMember($viewerId, $spaceId) || !$this->native->isSpaceMember($ownerId, $spaceId)
            || $this->native->isBlocked($viewerId, $ownerId)) { throw new IdeaException('IDEA_RELATIONS_DENIED', 'The relation summary is unavailable.', $viewerId < 1 ? 401 : 403); }
    }
    private function validConversation(array $activity): ?array
    {
        $conversation = $this->native->conversation($activity['message_id']);
        if ($conversation === null || $conversation['creator_id'] !== $activity['creator_id']
            || !in_array($activity['creator_id'], $conversation['participant_ids'], true)) { return null; }
        foreach ($conversation['participant_ids'] as $participantId) {
            if (!$this->native->isSpaceMember($participantId, $activity['space_id']) || $this->native->isBlocked($activity['creator_id'], $participantId)) { return null; }
        }
        return $conversation;
    }
    private function metadata(array $activity, int $viewerId, ?array $conversation): array
    {
        return ['title' => $activity['title'], 'summary' => $activity['summary'],
            'href' => '/api/v1/ideas/' . $activity['idea_id'] . '?idea_activity_id=' . $activity['id'],
            'event_id' => (string)$activity['space_id'], 'idea_id' => (string)$activity['idea_id'],
            'version' => $activity['idea_version'] . ':' . $activity['version'],
            'conversation_available' => $conversation !== null && in_array($viewerId, $conversation['participant_ids'], true)];
    }
}
