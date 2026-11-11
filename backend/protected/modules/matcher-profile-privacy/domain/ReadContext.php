<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\domain;

use humhub\modules\matcherProfile\domain\ProfileException;

final readonly class ReadContext
{
    public function __construct(public string $entryType, public ?int $spaceId = null, public ?int $postId = null, public string $purpose = 'detail')
    {
        if (!in_array($entryType, ['self', 'space', 'friendship', 'public_post', 'identity'], true)
            || !in_array($purpose, ['detail', 'contacts', 'summary', 'discovery', 'identity'], true)
            || ($spaceId !== null && $spaceId < 1) || ($postId !== null && $postId < 1)
            || ($entryType === 'space' && $spaceId === null) || ($entryType === 'public_post' && $postId === null)) {
            throw new ProfileException('INVALID_ACCESS_CONTEXT', 'Provide a valid profile entry context.');
        }
    }

    public static function fromArray(array $data): self
    {
        if (array_diff(array_keys($data), ['entry_type', 'space_id', 'post_id', 'purpose']) !== []
            || (isset($data['space_id']) && !is_int($data['space_id']))
            || (isset($data['post_id']) && !is_int($data['post_id']))
            || !is_string($data['entry_type'] ?? null) || (isset($data['purpose']) && !is_string($data['purpose']))) {
            throw new ProfileException('INVALID_ACCESS_CONTEXT', 'Invalid profile entry context.');
        }
        return new self($data['entry_type'], $data['space_id'] ?? null, $data['post_id'] ?? null, $data['purpose'] ?? 'detail');
    }

    public function toArray(): array { return ['entry_type' => $this->entryType, 'space_id' => $this->spaceId, 'post_id' => $this->postId, 'purpose' => $this->purpose]; }
}
