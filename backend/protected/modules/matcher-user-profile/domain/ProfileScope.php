<?php
declare(strict_types=1);

namespace humhub\modules\matcherProfile\domain;

/** Storage scope only. Event authorization must happen before creating an application context. */
final class ProfileScope
{
    private function __construct(public readonly ?int $spaceId)
    {
        if ($spaceId !== null && $spaceId <= 0) {
            throw new \InvalidArgumentException('Space ID must be positive');
        }
    }

    public static function global(): self { return new self(null); }
    public static function event(int $spaceId): self { return new self($spaceId); }
    public function key(): string { return $this->spaceId === null ? 'global' : 'space:' . $this->spaceId; }
    public function kind(): string { return $this->spaceId === null ? 'global' : 'event'; }
}
