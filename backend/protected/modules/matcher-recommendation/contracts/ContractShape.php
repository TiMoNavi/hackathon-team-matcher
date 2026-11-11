<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts;

/** Structural validation only. None of these helpers authorizes a read. */
final class ContractShape
{
    public static function token(string $value): void
    {
        if ($value === '' || trim($value) !== $value || preg_match('/[\x00-\x1f\x7f]/', $value)) {
            throw new \InvalidArgumentException('A nonempty stable identifier is required.');
        }
    }

    public static function target(string $value): void
    {
        if (!in_array($value, ['person', 'idea'], true)) {
            throw new \InvalidArgumentException('Unknown recommendation target type.');
        }
    }

    public static function scope(string $value): void
    {
        if ($value !== 'global' && !preg_match('/^space:[1-9][0-9]*$/D', $value)) {
            throw new \InvalidArgumentException('Use global or a positive Space scope.');
        }
    }

    /** @param list<string> $values */
    public static function identifiers(array $values, int $maximum): void
    {
        if (!array_is_list($values) || count($values) > $maximum) {
            throw new \InvalidArgumentException('Identifier collection exceeds its contract.');
        }
        foreach ($values as $value) {
            if (!is_string($value)) {
                throw new \InvalidArgumentException('Identifiers must be strings.');
            }
            self::token($value);
        }
        if (count(array_unique($values)) !== count($values)) {
            throw new \InvalidArgumentException('Duplicate identifiers are not allowed.');
        }
    }

    public static function jsonValue(mixed $value): void
    {
        // Detect recursive arrays, excessive depth and invalid numbers/UTF-8 once,
        // before walking the value. Walking first could recurse forever on an array reference.
        try { json_encode($value, JSON_THROW_ON_ERROR); }
        catch (\JsonException $error) { throw new \InvalidArgumentException('Invalid JSON value.', 0, $error); }
        self::assertPlainData($value);
    }

    private static function assertPlainData(mixed $value): void
    {
        if (is_object($value) || is_resource($value)) {
            throw new \InvalidArgumentException('Transport values must be plain JSON data.');
        }
        if (is_array($value)) {
            foreach ($value as $part) { self::assertPlainData($part); }
        }
    }
}
