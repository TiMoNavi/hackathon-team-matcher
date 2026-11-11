<?php
declare(strict_types=1);
namespace humhub\modules\matcherIdeas\adapters\memory;
use humhub\modules\matcherIdeas\domain\IdeaException;
use humhub\modules\matcherIdeas\domain\ports\IdeaRepository;

final class InMemoryIdeaRepository implements IdeaRepository
{
    public array $ideas = [];
    public array $activities = [];
    public array $bindings = [];
    public array $drafts = [];
    public function transaction(callable $work): mixed
    {
        $before = [$this->ideas, $this->activities, $this->bindings, $this->drafts];
        try { return $work(); } catch (\Throwable $error) { [$this->ideas, $this->activities, $this->bindings, $this->drafts] = $before; throw $error; }
    }
    public function idea(int $ideaId, bool $lock = false): ?array { return $this->ideas[$ideaId] ?? null; }
    public function createIdea(int $ownerId, string $title, string $summary): array
    {
        $id = count($this->ideas) + 1;
        return $this->ideas[$id] = ['id' => $id, 'creator_id' => $ownerId, 'title' => $title, 'summary' => $summary, 'status' => 'active', 'version' => 1];
    }
    public function updateIdea(int $ideaId, int $expectedVersion, array $changes): array
    {
        $this->version($this->idea($ideaId), $expectedVersion);
        return $this->ideas[$ideaId] = array_replace($this->ideas[$ideaId], array_intersect_key($changes, array_flip(['title', 'summary', 'status'])), ['version' => $expectedVersion + 1]);
    }
    public function activity(int $activityId, bool $lock = false): ?array { return $this->activities[$activityId] ?? null; }
    public function activityFor(int $ideaId, int $spaceId): ?array
    {
        foreach ($this->activities as $item) { if ($item['idea_id'] === $ideaId && $item['space_id'] === $spaceId) { return $item; } }
        return null;
    }
    public function createActivity(int $ideaId, int $spaceId): array
    {
        if ($this->activityFor($ideaId, $spaceId) !== null) { throw new IdeaException('IDEA_ACTIVITY_EXISTS', 'This idea is already associated.', 409); }
        $id = count($this->activities) + 1;
        return $this->activities[$id] = ['id' => $id, 'idea_id' => $ideaId, 'space_id' => $spaceId, 'message_id' => null, 'members_visible' => false, 'status' => 'published', 'version' => 1];
    }
    public function updateActivity(int $activityId, int $expectedVersion, array $changes): array
    {
        $this->version($this->activity($activityId), $expectedVersion);
        return $this->activities[$activityId] = array_replace($this->activities[$activityId], array_intersect_key($changes, ['members_visible' => true, 'status' => true]), ['version' => $expectedVersion + 1]);
    }
    public function bindingForMessage(int $messageId): ?array { return $this->bindings[$messageId] ?? null; }
    public function bindMessage(int $activityId, int $messageId): void
    {
        if (isset($this->bindings[$messageId]) || $this->activities[$activityId]['message_id'] !== null) { throw new IdeaException('IDEA_CONVERSATION_ALREADY_BOUND', 'The conversation cannot be rebound.', 409); }
        $this->bindings[$messageId] = ['activity_id' => $activityId, 'message_id' => $messageId];
        $this->activities[$activityId]['message_id'] = $messageId;
    }
    public function candidates(int $spaceId, int $afterId, int $limit): array
    {
        $items = [];
        foreach ($this->activities as $activity) {
            if ($activity['space_id'] !== $spaceId || $activity['id'] <= $afterId || $activity['message_id'] === null || $activity['status'] !== 'published') { continue; }
            $idea = $this->ideas[$activity['idea_id']];
            if ($idea['status'] !== 'active') { continue; }
            $items[] = $activity + ['creator_id' => $idea['creator_id'], 'title' => $idea['title'], 'summary' => $idea['summary'], 'idea_version' => $idea['version']];
        }
        usort($items, static fn(array $a, array $b): int => $a['id'] <=> $b['id']);
        return array_slice($items, 0, $limit);
    }
    private function version(?array $record, int $expectedVersion): void
    {
        if ($record === null || $expectedVersion < 1 || $record['version'] !== $expectedVersion) { throw new IdeaException('IDEA_VERSION_CONFLICT', 'The record has changed.', 409); }
    }
    public function ownedIdeas(int $ownerId, int $limit): array
    { return array_slice(array_values(array_filter($this->ideas, static fn(array $i): bool => $i['creator_id'] === $ownerId)), 0, $limit); }
    public function draft(int $draftId, bool $lock = false): ?array { return $this->drafts[$draftId] ?? null; }
    public function createDraft(int $ownerId, ?int $ideaId, ?int $baseVersion, array $fields, string $rawText): array
    {
        $id = count($this->drafts) + 1;
        return $this->drafts[$id] = ['id' => $id, 'owner_id' => $ownerId, 'idea_id' => $ideaId, 'base_version' => $baseVersion, 'fields' => $fields, 'raw_text' => $rawText, 'status' => 'editing', 'version' => 1, 'confirmed_idea_id' => null];
    }
    public function updateDraft(int $draftId, int $expectedVersion, array $changes): array
    {
        $this->version($this->draft($draftId), $expectedVersion);
        return $this->drafts[$draftId] = array_replace($this->drafts[$draftId], array_intersect_key($changes, array_flip(['fields', 'raw_text', 'status', 'confirmed_idea_id'])), ['version' => $expectedVersion + 1]);
    }
}
