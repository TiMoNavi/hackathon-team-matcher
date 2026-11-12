<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

final class Conversation
{
    public function __construct(public readonly int $id, public readonly string $type, public readonly ?string $title, public readonly int $version, public readonly ?int $spaceId = null, public readonly ?int $ideaActivityId = null)
    {
        SafeInteger::positive($id, 'conversation_id');
        SafeInteger::positive($version, 'version');
        self::assertType($type);
        if ($title !== null && !preg_match('//u', $title)) {
            throw new ChatException('INVALID_PROJECTION', 'The title is not valid text.', 503);
        }
        if ($type === 'discussion') {
            SafeInteger::positive($spaceId, 'space_id');
            SafeInteger::positive($ideaActivityId, 'idea_activity_id');
        } elseif ($spaceId !== null || $ideaActivityId !== null) {
            throw new ChatException('INVALID_PROJECTION', 'Only discussions have an activity context.', 503);
        }
    }

    public static function assertType(string $type): void
    {
        if (!in_array($type, ['direct', 'group', 'discussion'], true)) {
            throw new ChatException('UNADMITTED_CONVERSATION', 'The conversation type has not been admitted.', 503);
        }
    }

    public function activityFields(): array
    {
        return $this->type === 'discussion' ? ['space_id' => $this->spaceId, 'idea_activity_id' => $this->ideaActivityId] : [];
    }
}
