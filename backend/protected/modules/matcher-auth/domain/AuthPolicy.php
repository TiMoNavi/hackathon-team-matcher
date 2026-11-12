<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\domain;

final class AuthPolicy
{
    public const TTL = 600;
    public const RESEND = 60;
    public const SEND_LIMIT = 3;
    public const SEND_WINDOW = 600;
    public const ATTEMPT_LIMIT = 5;
    public const ATTEMPT_WINDOW = 900;
    public const NEXT_URL = '/matcher/app';

    public static function email(mixed $value): string
    {
        if (!is_string($value) || strlen($value) > 254 || trim($value) !== $value
            || preg_match('/[\x00-\x20\x7f]/', $value) || !filter_var($value, FILTER_VALIDATE_EMAIL)) {
            throw new AuthException('INVALID_EMAIL', 'Provide a valid email address.');
        }
        return strtolower($value);
    }

    public static function context(string $purpose, ?int $actorId, string $returnTo): void
    {
        if (!in_array($purpose, ['login', 'bind'], true) || $returnTo !== self::NEXT_URL) {
            throw new AuthException('INVALID_REQUEST', 'Provide a supported purpose and return path.');
        }
        if ($purpose === 'bind' && $actorId === null) { throw new AuthException('AUTHENTICATION_REQUIRED', 'Sign in before connecting an identity.', 401); }
        if ($purpose === 'login' && $actorId !== null) { throw new AuthException('INVALID_REQUEST', 'Use the explicit identity connection flow while signed in.'); }
    }

    public static function limited(int $seconds): AuthException
    {
        return new AuthException('RATE_LIMITED', 'Wait before trying again.', 429, ['retry_after' => max(1, $seconds)]);
    }
}
