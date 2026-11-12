<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\native;

use humhub\modules\matcherChat\domain\{ChatException, SafeInteger};

final class NativeProjection
{
    public static function reference(string $value): string
    {
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/D', $value)) { throw new ChatException('INVALID_ADMISSION_REFERENCE', 'Provide a nonsecret admission evidence reference.'); }
        return $value;
    }

    public static function pair(array $pair): array
    {
        if (!array_is_list($pair) || count($pair) !== 2) { throw new ChatException('INVALID_DIRECT_PAIR', 'Explicitly provide two distinct members.'); }
        $pair = array_map(static fn ($id): int => SafeInteger::positive($id, 'member_id'), $pair);
        sort($pair, SORT_NUMERIC);
        if ($pair[0] === $pair[1]) { throw new ChatException('INVALID_DIRECT_PAIR', 'Explicitly provide two distinct members.'); }
        return $pair;
    }

    public static function membershipHash(array $members): string
    {
        $facts = [];
        foreach ($members as $row) {
            $facts[] = [SafeInteger::native($row['user_id'], 'native_member_id'), $row['created_at'], $row['created_by']];
        }
        return hash('sha256', json_encode($facts, JSON_THROW_ON_ERROR));
    }

    /** Native datetime has no zone. Its configured storage zone must be explicit. */
    public static function utc(mixed $value, string $timeZone): string
    {
        if (!is_string($value)) { throw new ChatException('INVALID_NATIVE_TIMESTAMP', 'The native message timestamp is unavailable.', 503); }
        try { $zone = new \DateTimeZone($timeZone); } catch (\Exception) { throw new ChatException('INVALID_NATIVE_TIMEZONE', 'The native storage timezone is invalid.', 503); }
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $value, $zone);
        if (!$date || $date->format('Y-m-d H:i:s') !== $value) { throw new ChatException('INVALID_NATIVE_TIMESTAMP', 'The native message timestamp is invalid.', 503); }
        return $date->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    }

    /** Conservative plain text: never return executable markup or rich-text attachment embeds. */
    public static function text(mixed $value): string
    {
        if (!is_string($value) || !preg_match('//u', $value)) { throw new ChatException('INVALID_NATIVE_TEXT', 'The native text is invalid.', 503); }
        $value = preg_replace('~<(script|style|iframe|object)\b[^>]*>.*?</\1\s*>~isu', '', $value);
        $value = preg_replace('~<(br\s*/?|/p|/div|/li)>~iu', "\n", $value);
        $value = html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        if (trim($value) === '') { throw new ChatException('UNSUPPORTED_NATIVE_MESSAGE', 'An empty or attachment-only native message is not admitted.', 503); }
        return $value;
    }
}
