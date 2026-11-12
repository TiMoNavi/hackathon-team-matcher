<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

final class SafeInteger
{
    public const MAX = 9007199254740991;

    public static function nonNegative(mixed $value, string $field): int
    {
        if (!is_int($value) || $value < 0 || $value > self::MAX) {
            throw new ChatException('INVALID_ARGUMENT', $field . ' must be a safe integer.');
        }
        return $value;
    }

    public static function positive(mixed $value, string $field): int
    {
        $value = self::nonNegative($value, $field);
        if ($value === 0) {
            throw new ChatException('INVALID_ARGUMENT', $field . ' must be positive.');
        }
        return $value;
    }

    /** Native DECIMAL/BIGINT text must be checked before casting, never rounded. */
    public static function native(mixed $value, string $field, bool $allowZero = false): int
    {
        if (is_string($value)) {
            if (!preg_match('/^(0|[1-9][0-9]*)$/D', $value) || strlen($value) > 16 || (strlen($value) === 16 && strcmp($value, (string) self::MAX) > 0)) {
                throw new ChatException('NATIVE_INTEGER_UNSUPPORTED', $field . ' is outside the supported integer range.', 503);
            }
            $value = (int) $value;
        }
        if (!is_int($value) || $value < ($allowZero ? 0 : 1) || $value > self::MAX) {
            throw new ChatException('NATIVE_INTEGER_UNSUPPORTED', $field . ' is outside the supported integer range.', 503);
        }
        return $value;
    }
}
