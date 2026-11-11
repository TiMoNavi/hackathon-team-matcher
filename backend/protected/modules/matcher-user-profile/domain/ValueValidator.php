<?php
declare(strict_types=1);

namespace humhub\modules\matcherProfile\domain;

/** Evaluates the bounded JSON Schema subset emitted by FieldCatalog. */
final class ValueValidator
{
    public static function validate(mixed $value, array $schema, string $path = 'value', bool $complete = true): array
    {
        $type = $schema['type'];
        $validType = match ($type) {
            'string' => is_string($value),
            'number' => (is_int($value) || is_float($value)) && is_finite((float) $value),
            'integer' => is_int($value),
            'array' => is_array($value) && array_is_list($value),
            'object' => is_array($value) && ($value === [] || !array_is_list($value)),
            default => throw new \LogicException('Unsupported catalog schema type'),
        };
        if (!$validType) {
            return [$path . ' must have type ' . $type];
        }
        $errors = [];
        if (isset($schema['enum']) && !in_array($value, $schema['enum'], true)) {
            $errors[] = $path . ' has an unknown code';
        }
        if ($type === 'string') {
            if (!mb_check_encoding($value, 'UTF-8')) {
                return [$path . ' must be valid UTF-8'];
            }
            $length = mb_strlen($value, 'UTF-8');
            if ($complete && isset($schema['minLength']) && mb_strlen(trim($value), 'UTF-8') < $schema['minLength']) {
                $errors[] = $path . ' is too short';
            }
            if (isset($schema['maxLength']) && $length > $schema['maxLength']) {
                $errors[] = $path . ' is too long';
            }
            if (isset($schema['format']) && !self::validFormat($value, $schema['format'])) {
                $errors[] = $path . ' has invalid ' . $schema['format'] . ' format';
            }
        }
        if ($type === 'number' || $type === 'integer') {
            if (isset($schema['minimum']) && $value < $schema['minimum']) {
                $errors[] = $path . ' is below its minimum';
            }
            if (isset($schema['maximum']) && $value > $schema['maximum']) {
                $errors[] = $path . ' is above its maximum';
            }
        }
        if ($type === 'array') {
            if (isset($schema['maxItems']) && count($value) > $schema['maxItems']) {
                $errors[] = $path . ' has too many items';
            }
            $seen = [];
            foreach ($value as $i => $item) {
                if (($schema['uniqueItems'] ?? false) && in_array($item, $seen, true)) {
                    $errors[] = $path . ' has duplicate items';
                }
                $seen[] = $item;
                array_push($errors, ...self::validate($item, $schema['items'], $path . '[' . $i . ']', $complete));
            }
        }
        if ($type === 'object') {
            if ($complete) {
                foreach ($schema['required'] ?? [] as $required) {
                    if (!array_key_exists($required, $value)) {
                        $errors[] = $path . '.' . $required . ' is required';
                    }
                }
                if (isset($schema['minProperties']) && count($value) < $schema['minProperties']) {
                    $errors[] = $path . ' needs at least one property';
                }
            }
            foreach ($value as $key => $item) {
                if (!array_key_exists($key, $schema['properties'])) {
                    $errors[] = $path . ' has unknown property ' . $key;
                    continue;
                }
                array_push($errors, ...self::validate($item, $schema['properties'][$key], $path . '.' . $key, $complete));
            }
            if (isset($value['value'], $value['precision']) && ($schema['properties']['value']['format'] ?? null) === 'partial-date' && is_string($value['value']) && is_string($value['precision'])) {
                $expected = ['year' => 4, 'month' => 7, 'day' => 10][$value['precision']] ?? 0;
                if (strlen($value['value']) !== $expected) {
                    $errors[] = $path . ' date value must match its precision';
                }
            }
        }
        return $errors;
    }

    private static function validFormat(string $value, string $format): bool
    {
        if ($format === 'email') {
            return filter_var($value, FILTER_VALIDATE_EMAIL) !== false;
        }
        if ($format === 'http-url') {
            return filter_var($value, FILTER_VALIDATE_URL) !== false && in_array(strtolower((string) parse_url($value, PHP_URL_SCHEME)), ['http', 'https'], true);
        }
        if ($format === 'timezone') {
            return in_array($value, \DateTimeZone::listIdentifiers(\DateTimeZone::ALL_WITH_BC), true);
        }
        if ($format === 'partial-date') {
            if (!preg_match('/^([0-9]{4})(?:-([0-9]{2})(?:-([0-9]{2}))?)?$/D', $value, $m)) {
                return false;
            }
            return checkdate((int) ($m[2] ?? 1), (int) ($m[3] ?? 1), (int) $m[1]);
        }
        if ($format === 'date-time') {
            if (!preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:[.][0-9]{1,6})?(?:Z|[+-][0-9]{2}:[0-9]{2})$/D', $value, $m)) {
                return false;
            }
            if (!checkdate((int) $m[2], (int) $m[3], (int) $m[1]) || (int) $m[4] > 23 || (int) $m[5] > 59 || (int) $m[6] > 59) {
                return false;
            }
            try {
                new \DateTimeImmutable($value);
                return true;
            } catch (\Exception) {
                return false;
            }
        }
        throw new \LogicException('Unsupported catalog format');
    }
}
