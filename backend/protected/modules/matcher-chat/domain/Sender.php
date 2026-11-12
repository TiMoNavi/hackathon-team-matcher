<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

final class Sender
{
    private function __construct(private readonly array $projection) {}

    public static function unavailable(): self
    {
        return new self(['status' => 'unavailable']);
    }

    public static function available(int $userId, string $displayName, ?string $avatarRef = null): self
    {
        SafeInteger::positive($userId, 'user_id');
        if (trim($displayName) === '' || !preg_match('//u', $displayName) || ($avatarRef !== null && ($avatarRef === '' || strlen($avatarRef) > 512 || !preg_match('//u', $avatarRef)))) {
            throw new ChatException('INVALID_PROJECTION', 'The sender projection is invalid.', 503);
        }
        return new self(['status' => 'available', 'user_id' => $userId, 'display_name' => $displayName, 'avatar_ref' => $avatarRef]);
    }

    public function dto(): array { return $this->projection; }
}
