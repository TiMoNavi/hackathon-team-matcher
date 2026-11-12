<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebapp\application;

final class ShellPolicy
{
    public static function enabled(bool $configured, mixed $stored): bool
    {
        return $configured && ($stored === null || in_array($stored, [true, 1, '1', 'true'], true));
    }

    /** Deep links are local client routes, never backend routes or redirect targets. */
    public static function allowsPath(string $path): bool
    {
        if ($path === '') { return true; }
        return strlen($path) <= 180 && preg_match(
            '~^(?:home|discover|profile|onboarding|messages|ideas|settings|login|events|invitations)(?:/[A-Za-z0-9_-]{1,64}){0,4}$~D',
            $path,
        ) === 1;
    }

    public static function allowsAssetBase(string $url): bool
    {
        return preg_match('~^/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*)(?:/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$~D', $url) === 1;
    }
}
