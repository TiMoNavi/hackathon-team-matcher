<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendationAi\adapters\provider;
use humhub\modules\matcherRecommendationAi\adapters\gateway\ProviderException;

/** Small closed input/output vocabulary. Text is data and cannot introduce tools or authority. */
final class ProtocolShape
{
    public const OPERATORS = ['similarity', 'supply_demand', 'coverage_gain', 'explicit_preference', 'interval_overlap'];
    public static function keys(mixed $value, array $required, array $optional = []): void
    {
        if (!is_array($value) || array_diff($required, array_keys($value)) !== [] || array_diff(array_keys($value), array_merge($required, $optional)) !== []) { self::bad(); }
    }
    public static function text(mixed $text, int $bytes): void
    {
        if (!is_string($text) || $text === '' || trim($text) === '' || strlen($text) > $bytes || !preg_match('//u', $text) || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $text)) { self::bad(); }
    }
    public static function token(mixed $value): void
    {
        if (!is_string($value) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/D', $value)) { self::bad(); }
    }
    public static function value(mixed $value, string $operator): void
    {
        if ($operator !== 'interval_overlap') {
            $values = is_string($value) ? [$value] : $value;
            if (!is_array($values) || !array_is_list($values) || $values === [] || count($values) > 32) { self::bad(); }
            foreach ($values as $item) { self::text($item, 1024); }
            return;
        }
        if (!is_array($value) || !array_is_list($value) || $value === [] || count($value) > 32) { self::bad(); }
        foreach ($value as $interval) {
            self::keys($interval, ['starts_at', 'ends_at']); $dates = [];
            foreach (['starts_at', 'ends_at'] as $key) {
                $text = $interval[$key];
                if (!is_string($text) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/D', $text)) { self::bad(); }
                try { $date = new \DateTimeImmutable($text); } catch (\Throwable) { self::bad(); }
                $errors = \DateTimeImmutable::getLastErrors();
                if ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) { self::bad(); }
                $dates[] = $date;
            }
            if ($dates[0] >= $dates[1]) { self::bad(); }
        }
    }
    public static function json(#[\SensitiveParameter] mixed $value): string
    {
        try { return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION, 32); }
        catch (\Throwable) { self::bad(); }
    }
    public static function object(array $properties): array { return ['type' => 'object', 'properties' => $properties, 'required' => array_keys($properties), 'additionalProperties' => false]; }
    public static function bad(): never { throw new ProviderException('invalid_input'); }
}
