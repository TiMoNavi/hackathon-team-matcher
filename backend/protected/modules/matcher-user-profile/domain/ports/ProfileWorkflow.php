<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\ports;
/** Shared boundary for owner-only workflows. One transaction spans profiles, questions and sessions. */
interface ProfileWorkflow
{
    /** Lock global state then optional Space state, then validate live owner/Space permission. */
    public function transaction(int $ownerId, ?int $spaceId, callable $callback, bool $writable = true): mixed;
    /** ['global' => ProfileDTO, 'space' => ProfileDTO|null]; only confirmed current information. */
    public function profiles(int $ownerId, ?int $spaceId): array;
    /** Every call creates a separate onboarding draft; never resumes the user's manual draft. */
    public function createDraft(int $ownerId, ?int $spaceId): array;
    public function getDraft(int $ownerId, ?int $spaceId, string $id): array;
    public function updateDraft(int $ownerId, ?int $spaceId, string $id, int $expectedVersion, array $fields): array;
    public function confirmDraft(int $ownerId, ?int $spaceId, string $id, int $expectedVersion, int $expectedRevision, ?array $attributeIds = null): array;
}
