<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\http;

use humhub\modules\matcherChat\domain\{ChatException, SafeInteger};

/** A client cache precondition, never a source of authenticated identity. */
final class ActorExpectation
{
    public static function assert(mixed $header, int $sessionViewerId): void
    {
        if ($header === null) { return; }
        if (!is_string($header) || !preg_match('/^[1-9][0-9]{0,15}$/D', $header) || (strlen($header) === 16 && strcmp($header, (string)SafeInteger::MAX) > 0) || (int)$header !== $sessionViewerId) {
            throw new ChatException('SESSION_CHANGED', 'The signed-in account has changed. Reload the chat page.', 401);
        }
    }
}
