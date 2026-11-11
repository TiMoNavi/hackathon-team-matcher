<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\config;
use humhub\modules\matcherRecommendation\contracts\ContractShape;

/** Small fixed metadata dialect. No executable expressions, references or custom validators. */
final class ValueSchema
{
    public static function assertSchema(array $schema, int $depth = 0): void
    {
        if ($depth > 12) { self::fail('Schema nesting is too deep.'); }
        ContractShape::jsonValue($schema);
        $type = $schema['type'] ?? null;
        $allowed = match ($type) {
            'string' => ['type', 'enum', 'minLength', 'maxLength', 'format'],
            'array' => ['type', 'items', 'minItems', 'maxItems', 'uniqueItems'],
            'object' => ['type', 'properties', 'required', 'additionalProperties'],
            'integer', 'number' => ['type', 'minimum', 'maximum', 'enum'],
            'boolean' => ['type', 'enum'],
            default => throw new \InvalidArgumentException('Unsupported schema type.'),
        };
        if (array_diff(array_keys($schema), $allowed) !== []) { self::fail('Unsupported schema keyword.'); }
        foreach (['minLength', 'maxLength', 'minItems', 'maxItems'] as $key) {
            if (isset($schema[$key]) && (!is_int($schema[$key]) || $schema[$key] < 0 || $schema[$key] > 100000)) { self::fail('Invalid schema bound.'); }
            if (array_key_exists($key, $schema) && $schema[$key] === null) { self::fail('Null schema bound.'); }
        }
        foreach ([['minLength', 'maxLength'], ['minItems', 'maxItems'], ['minimum', 'maximum']] as [$min, $max]) {
            if (isset($schema[$min], $schema[$max]) && $schema[$min] > $schema[$max]) { self::fail('Reversed schema bounds.'); }
        }
        foreach (['minimum', 'maximum'] as $key) {
            if (array_key_exists($key, $schema) && ((!is_int($schema[$key]) && !is_float($schema[$key])) || !is_finite((float)$schema[$key]))) { self::fail('Invalid numeric bound.'); }
        }
        if (array_key_exists('format', $schema) && !in_array($schema['format'], ['date-time', 'timezone', 'partial-date', 'http-url', 'email'], true)) { self::fail('Unknown value format.'); }
        if ($type === 'array') {
            if (!isset($schema['items']) || !is_array($schema['items']) || (array_key_exists('uniqueItems', $schema) && !is_bool($schema['uniqueItems']))) { self::fail('Invalid array schema.'); }
            self::assertSchema($schema['items'], $depth + 1);
        }
        if ($type === 'object') {
            if (!isset($schema['properties'], $schema['required']) || !is_array($schema['properties']) || !is_array($schema['required']) || ($schema['additionalProperties'] ?? null) !== false || count($schema['properties']) > 64) { self::fail('Closed object schema is required.'); }
            ContractShape::identifiers($schema['required'], 64);
            foreach ($schema['properties'] as $key => $property) {
                if (!is_string($key) || !preg_match('/^[a-z][a-z0-9_]{0,63}$/D', $key) || !is_array($property)) { self::fail('Invalid schema property.'); }
                self::assertSchema($property, $depth + 1);
            }
            if (array_diff($schema['required'], array_keys($schema['properties'])) !== []) { self::fail('Unknown required property.'); }
        }
        if (array_key_exists('enum', $schema)) {
            if (!is_array($schema['enum']) || !array_is_list($schema['enum']) || $schema['enum'] === [] || count($schema['enum']) > 256) { self::fail('Invalid enum.'); }
            $seen = []; $withoutEnum = $schema; unset($withoutEnum['enum']);
            foreach ($schema['enum'] as $value) {
                self::checkValue($value, $withoutEnum); $fingerprint = Fingerprint::of($value);
                if (isset($seen[$fingerprint])) { self::fail('Duplicate enum value.'); }
                $seen[$fingerprint] = true;
            }
        }
    }

    public static function assertValue(mixed $value, array $schema): void
    {
        self::assertSchema($schema); ContractShape::jsonValue($value); self::checkValue($value, $schema);
    }

    private static function checkValue(mixed $value, array $schema): void
    {
        $valid = match ($schema['type']) {
            'string' => is_string($value),
            'number' => (is_int($value) || is_float($value)) && is_finite((float)$value),
            'integer' => is_int($value),
            'boolean' => is_bool($value),
            'array' => is_array($value) && array_is_list($value),
            'object' => is_array($value) && ($value === [] || !array_is_list($value)),
            default => false,
        };
        if (!$valid || (isset($schema['enum']) && !in_array($value, $schema['enum'], true))) { self::fail('Value does not match source schema.'); }
        if (is_string($value)) {
            $length = preg_match_all('/./us', $value);
            if ($length === false || $length < ($schema['minLength'] ?? 0) || $length > ($schema['maxLength'] ?? PHP_INT_MAX)) { self::fail('Invalid string length or encoding.'); }
            if (isset($schema['format']) && !self::format($value, $schema['format'])) { self::fail('Invalid formatted value.'); }
        }
        if (is_int($value) || is_float($value)) {
            if ($value < ($schema['minimum'] ?? -INF) || $value > ($schema['maximum'] ?? INF)) { self::fail('Number outside source bounds.'); }
        }
        if ($schema['type'] === 'array') {
            if (count($value) < ($schema['minItems'] ?? 0) || count($value) > ($schema['maxItems'] ?? PHP_INT_MAX)) { self::fail('Array outside source bounds.'); }
            $seen = [];
            foreach ($value as $item) {
                self::checkValue($item, $schema['items']); $fingerprint = Fingerprint::of($item);
                if (($schema['uniqueItems'] ?? false) && isset($seen[$fingerprint])) { self::fail('Duplicate source value.'); }
                $seen[$fingerprint] = true;
            }
        }
        if ($schema['type'] === 'object') {
            if (array_diff($schema['required'], array_keys($value)) !== [] || array_diff(array_keys($value), array_keys($schema['properties'])) !== []) { self::fail('Object properties do not match source schema.'); }
            foreach ($value as $key => $item) { self::checkValue($item, $schema['properties'][$key]); }
        }
    }

    private static function format(string $value, string $format): bool
    {
        if ($format === 'timezone') { return in_array($value, \DateTimeZone::listIdentifiers(\DateTimeZone::ALL_WITH_BC), true); }
        if ($format === 'email') { return filter_var($value, FILTER_VALIDATE_EMAIL) !== false; }
        if ($format === 'http-url') { return filter_var($value, FILTER_VALIDATE_URL) !== false && in_array(strtolower((string)parse_url($value, PHP_URL_SCHEME)), ['http', 'https'], true); }
        if ($format === 'partial-date') {
            if (!preg_match('/^([0-9]{4})(?:-([0-9]{2})(?:-([0-9]{2}))?)?$/D', $value, $parts)) { return false; }
            return checkdate((int)($parts[2] ?? 1), (int)($parts[3] ?? 1), (int)$parts[1]);
        }
        if (!preg_match('/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?(?:Z|[+-](?:(?:0[0-9]|1[0-3]):[0-5][0-9]|14:00))$/D', $value)) { return false; }
        try { new \DateTimeImmutable($value); $errors = \DateTimeImmutable::getLastErrors(); return $errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0); } catch (\Exception) { return false; }
    }
    private static function fail(string $message): never { throw new \InvalidArgumentException($message); }
}
