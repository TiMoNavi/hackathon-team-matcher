<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboardingAi\domain;

/** JSON only: no fences, comments, trailing prose, duplicate property names or deep payloads. */
final class StrictJson
{
    public static function object(string $raw, int $maxBytes): array
    {
        if (strlen($raw) > $maxBytes || !str_starts_with(ltrim($raw), '{')) { throw new \UnexpectedValueException('Invalid structured response.'); }
        $value = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        if (!is_array($value) || ($value !== [] && array_is_list($value))) { throw new \UnexpectedValueException('Invalid structured response.'); }
        $stack = []; $length = strlen($raw);
        for ($i = 0; $i < $length; $i++) {
            $char = $raw[$i];
            if ($char === '"') {
                $start = $i; $escaped = false;
                while (++$i < $length) {
                    if ($escaped) { $escaped = false; continue; }
                    if ($raw[$i] === '\\') { $escaped = true; continue; }
                    if ($raw[$i] === '"') { break; }
                }
                $index = count($stack) - 1;
                if ($index >= 0 && $stack[$index]['kind'] === 'object' && $stack[$index]['key']) {
                    $key = json_decode(substr($raw, $start, $i - $start + 1), true, 2, JSON_THROW_ON_ERROR);
                    if (isset($stack[$index]['seen'][$key])) { throw new \UnexpectedValueException('Invalid structured response.'); }
                    $stack[$index]['seen'][$key] = true; $stack[$index]['key'] = false;
                }
            } elseif ($char === '{') { $stack[] = ['kind' => 'object','key' => true,'seen' => []]; }
            elseif ($char === '[') { $stack[] = ['kind' => 'array']; }
            elseif ($char === '}' || $char === ']') { array_pop($stack); }
            elseif ($char === ',' && $stack !== []) { $index = count($stack) - 1; if ($stack[$index]['kind'] === 'object') { $stack[$index]['key'] = true; } }
        }
        return $value;
    }
}
