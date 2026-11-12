<?php
declare(strict_types=1);
namespace humhub\modules\matcherChatUi\application;

final class ShellPolicy
{
    public static function enabled(bool $configured, mixed $stored): bool
    {
        return $configured && ($stored === null || in_array($stored, [true, 1, '1', 'true'], true));
    }

    /** A deep link is a location only; it never grants permission to a conversation. */
    public static function allowsPath(mixed $path): bool
    {
        if ($path === '') { return true; }
        if (!is_string($path) || preg_match('~^conversations/([1-9][0-9]{0,18})$~D', $path, $match) !== 1) {
            return false;
        }
        $id = $match[1];
        $maximum = (string) PHP_INT_MAX;
        return strlen($id) < strlen($maximum) || (strlen($id) === strlen($maximum) && strcmp($id, $maximum) <= 0);
    }

    /** Fail closed before Yii dispatch, including direct action URLs and unsupported verbs. */
    public static function rejectionStatus(bool $enabled, mixed $path, string $method): ?int
    {
        if (!$enabled || !self::allowsPath($path)) { return 404; }
        return $method === 'GET' ? null : 405;
    }

    public static function allowsAssetBase(string $url): bool
    {
        return preg_match('~^/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*)(?:/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$~D', $url) === 1;
    }
}
