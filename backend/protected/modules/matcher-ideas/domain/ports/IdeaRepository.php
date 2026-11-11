<?php
declare(strict_types=1);
namespace humhub\modules\matcherIdeas\domain\ports;

interface IdeaRepository
{
    public function transaction(callable $work): mixed;
    public function idea(int $ideaId, bool $lock = false): ?array;
    public function createIdea(int $ownerId, string $title, string $summary): array;
    public function updateIdea(int $ideaId, int $expectedVersion, array $changes): array;
    public function activity(int $activityId, bool $lock = false): ?array;
    public function activityFor(int $ideaId, int $spaceId): ?array;
    public function createActivity(int $ideaId, int $spaceId): array;
    public function updateActivity(int $activityId, int $expectedVersion, array $changes): array;
    public function bindingForMessage(int $messageId): ?array;
    public function bindMessage(int $activityId, int $messageId): void;
    /** Metadata candidates only; caller must validate live native relationships before disclosure. */
    public function candidates(int $spaceId, int $afterId, int $limit): array;
    public function ownedIdeas(int $ownerId, int $limit): array;
    public function draft(int $draftId, bool $lock = false): ?array;
    public function createDraft(int $ownerId, ?int $ideaId, ?int $baseVersion, array $fields, string $rawText): array;
    public function updateDraft(int $draftId, int $expectedVersion, array $changes): array;
}
