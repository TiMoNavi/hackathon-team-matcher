<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\config;

final class Fingerprint
{
    public static function of(mixed $value): string
    {
        json_encode($value, JSON_THROW_ON_ERROR);
        return hash('sha256', json_encode(self::canonical($value), JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION));
    }
    private static function canonical(mixed $value): mixed
    {
        if (is_array($value) && array_is_list($value)) { return array_map(self::canonical(...), $value); }
        if (is_array($value) || is_object($value)) {
            $properties = is_array($value) ? $value : get_object_vars($value);
            ksort($properties, SORT_STRING); $result = new \stdClass();
            foreach ($properties as $key => $item) { $result->{(string)$key} = self::canonical($item); }
            return $result;
        }
        return $value;
    }
}
