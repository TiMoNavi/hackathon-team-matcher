<?php
declare(strict_types=1);
namespace humhub\modules\matcherIdeas\application;

use humhub\modules\matcherIdeas\domain\{IdeaContent, IdeaException};
use humhub\modules\matcherIdeas\domain\ports\{IdeaRepository, NativeRelations, CurrentSpaceAccess};

/** S7.2 formal metadata and explicit binding only; never creates chat or participants. */
final class IdeaService
{
    public function __construct(private IdeaRepository $repository, private NativeRelations $native, private CurrentSpaceAccess $spaces) {}

    public function create(int $actorId, string $title, string $summary): array
    {
        $content = new IdeaContent($title, $summary);
        return $this->repository->transaction(function () use ($actorId, $content): array {
            $this->active($actorId);
            return $this->repository->createIdea($actorId, $content->title, $content->summary);
        });
    }

    public function update(int $actorId, int $ideaId, int $expectedVersion, string $title, string $summary): array
    {
        $content = new IdeaContent($title, $summary);
        return $this->repository->transaction(function () use ($actorId, $ideaId, $expectedVersion, $content): array {
            $this->owned($actorId, $ideaId);
            return $this->repository->updateIdea($ideaId, $expectedVersion, ['title' => $content->title, 'summary' => $content->summary]);
        });
    }

    public function associateSpace(int $actorId, int $ideaId, int $expectedVersion, int $spaceId, bool $membersVisible = false): array
    {
        return $this->repository->transaction(function () use ($actorId, $ideaId, $expectedVersion, $spaceId, $membersVisible): array {
            $idea = $this->owned($actorId, $ideaId);
            $this->version($idea, $expectedVersion);
            $stamp = $this->spaces->stamp($actorId, $spaceId);
            $this->member($actorId, $spaceId);
            if ($this->repository->activityFor($ideaId, $spaceId) !== null) {
                throw new IdeaException('IDEA_ACTIVITY_EXISTS', 'This idea is already associated with the Space.', 409);
            }
            $result = $this->repository->createActivity($ideaId, $spaceId);
            if ($membersVisible) { $result = $this->repository->updateActivity($result['id'], 1, ['members_visible' => true]); }
            if ($stamp !== $this->spaces->stamp($actorId, $spaceId)) { throw new IdeaException('CURRENT_EVENT_CHANGED', 'The current Space changed.', 409); }
            return $result;
        });
    }

    public function bindConversation(int $actorId, int $activityId, int $expectedVersion, int $messageId): array
    {
        return $this->repository->transaction(function () use ($actorId, $activityId, $expectedVersion, $messageId): array {
            $activity = $this->ownedActivity($actorId, $activityId);
            $this->version($activity, $expectedVersion);
            if ($activity['status'] !== 'published') { throw new IdeaException('IDEA_ACTIVITY_ARCHIVED', 'The Space publication is archived.', 409); }
            $stamp = $this->spaces->stamp($actorId, $activity['space_id']);
            if ($activity['message_id'] !== null || $this->repository->bindingForMessage($messageId) !== null) {
                throw new IdeaException('IDEA_CONVERSATION_ALREADY_BOUND', 'A conversation binding is permanent and cannot be reused.', 409);
            }
            $conversation = $this->native->conversation($messageId);
            if ($conversation === null || $conversation['creator_id'] !== $actorId || !in_array($actorId, $conversation['participant_ids'], true)) {
                throw new IdeaException('IDEA_CONVERSATION_DENIED', 'Only the participating conversation creator may bind it.', 403);
            }
            foreach ($conversation['participant_ids'] as $participantId) {
                $this->member($participantId, $activity['space_id']);
                if ($this->native->isBlocked($actorId, $participantId)) {
                    throw new IdeaException('IDEA_CONVERSATION_DENIED', 'The conversation is unavailable.', 403);
                }
            }
            $this->repository->bindMessage($activityId, $messageId);
            $result = $this->repository->updateActivity($activityId, $expectedVersion, []);
            if ($stamp !== $this->spaces->stamp($actorId, $activity['space_id'])) { throw new IdeaException('CURRENT_EVENT_CHANGED', 'The current Space changed.', 409); }
            return $result;
        });
    }

    /** Object-level member-list setting, separate from each profile owner's sharing choice. */
    public function setMemberVisibility(int $actorId, int $activityId, int $expectedVersion, bool $visible): array
    { return $this->updatePublication($actorId, $activityId, $expectedVersion, $visible); }

    public function updatePublication(int $actorId, int $activityId, int $expectedVersion, ?bool $membersVisible = null, ?string $status = null): array
    {
        if ($status !== null && !in_array($status, ['published', 'archived'], true)) { throw new IdeaException('IDEA_VALIDATION_FAILED', 'Publication status must be published or archived.'); }
        if ($membersVisible === null && $status === null) { throw new IdeaException('IDEA_VALIDATION_FAILED', 'Choose a publication change explicitly.'); }
        return $this->repository->transaction(function () use ($actorId, $activityId, $expectedVersion, $membersVisible, $status): array {
            $activity = $this->ownedActivity($actorId, $activityId);
            $stamp = $this->spaces->stamp($actorId, $activity['space_id']);
            $changes = [];
            if ($membersVisible !== null) { $changes['members_visible'] = $membersVisible; }
            if ($status !== null) { $changes['status'] = $status; }
            $result = $this->repository->updateActivity($activityId, $expectedVersion, $changes);
            if ($stamp !== $this->spaces->stamp($actorId, $activity['space_id'])) { throw new IdeaException('CURRENT_EVENT_CHANGED', 'The current Space changed.', 409); }
            return $result;
        });
    }

    public function setStatus(int $actorId, int $ideaId, int $expectedVersion, string $status): array
    {
        if (!in_array($status, ['active', 'archived'], true)) { throw new IdeaException('IDEA_VALIDATION_FAILED', 'Invalid idea status.'); }
        return $this->repository->transaction(function () use ($actorId, $ideaId, $expectedVersion, $status): array {
            $this->owned($actorId, $ideaId, true);
            return $this->repository->updateIdea($ideaId, $expectedVersion, ['status' => $status]);
        });
    }

    private function owned(int $actorId, int $ideaId, bool $allowArchived = false): array
    {
        $this->active($actorId);
        $idea = $this->repository->idea($ideaId, true);
        if ($idea === null || $idea['creator_id'] !== $actorId) { throw new IdeaException('IDEA_NOT_FOUND', 'The idea is unavailable.', 404); }
        if (!$allowArchived && $idea['status'] !== 'active') { throw new IdeaException('IDEA_ARCHIVED', 'The idea is archived.', 409); }
        return $idea;
    }
    private function ownedActivity(int $actorId, int $activityId): array
    {
        $activity = $this->repository->activity($activityId, true);
        if ($activity === null) { throw new IdeaException('IDEA_ACTIVITY_NOT_FOUND', 'The idea activity is unavailable.', 404); }
        $this->owned($actorId, $activity['idea_id']);
        $this->spaces->stamp($actorId, $activity['space_id']);
        $this->member($actorId, $activity['space_id']);
        return $activity;
    }
    private function active(int $actorId): void
    {
        if (!$this->native->isActive($actorId)) { throw new IdeaException('IDEA_ACCESS_DENIED', 'An active authenticated account is required.', $actorId < 1 ? 401 : 403); }
    }
    private function member(int $actorId, int $spaceId): void
    {
        if (!$this->native->isSpaceMember($actorId, $spaceId)) { throw new IdeaException('IDEA_SPACE_DENIED', 'An active formal Space membership is required.', 403); }
    }
    private function version(array $record, int $expectedVersion): void
    {
        if ($expectedVersion < 1 || $record['version'] !== $expectedVersion) { throw new IdeaException('IDEA_VERSION_CONFLICT', 'The record has changed.', 409); }
    }
}
