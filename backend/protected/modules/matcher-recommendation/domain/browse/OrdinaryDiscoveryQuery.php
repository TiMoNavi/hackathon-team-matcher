<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\browse;

/** Same field values OR; fields AND. Only reviewed public structured values participate. */
final class OrdinaryDiscoveryQuery
{
    public readonly array $filters;
    private const CODES = ['direction', 'role', 'skill', 'interest', 'event_role'];
    public function __construct(array $filters = [], public readonly string $sort = 'recent', public readonly int $limit = 24, public readonly ?string $cursor = null, string $targetType = 'person')
    {
        if ($targetType !== 'person' || !in_array($sort, ['recent', 'relevance'], true) || $limit < 1 || $limit > 48
            || ($cursor !== null && ($cursor === '' || strlen($cursor) > 4096))
            || array_diff(array_keys($filters), [...self::CODES, 'event_seeking', 'event_availability']) !== []) { self::invalid(); }
        $canonical = [];
        foreach ($filters as $key => $value) {
            if (in_array($key, self::CODES, true)) { $canonical[$key] = self::codes($value); }
            elseif ($key === 'event_seeking') {
                if (!is_array($value) || $value === [] || array_diff(array_keys($value), ['role_codes', 'skill_codes']) !== []) { self::invalid(); }
                foreach ($value as $part => $codes) { $canonical[$key][$part] = self::codes($codes); }
                ksort($canonical[$key]);
            } else {
                if (!is_array($value) || !array_is_list($value) || $value === [] || count($value) > 20) { self::invalid(); }
                $canonical[$key] = [];
                foreach ($value as $interval) {
                    if (!is_array($interval) || count($interval) !== 2 || !isset($interval['starts_at'], $interval['ends_at'])) { self::invalid(); }
                    $start = self::date($interval['starts_at']); $end = self::date($interval['ends_at']);
                    if ($start >= $end) { self::invalid(); }
                    $canonical[$key][] = ['starts_at' => $start->format('Y-m-d\TH:i:s.u\Z'), 'ends_at' => $end->format('Y-m-d\TH:i:s.u\Z')];
                }
                usort($canonical[$key], static fn(array $a, array $b): int => $a <=> $b);
            }
        }
        ksort($canonical); $this->filters = $canonical;
    }

    /** null means a hard filter failed; score counts public requested codes matched, never compatibility. */
    public function match(array $card): ?int
    {
        $values = [];
        foreach (['global', 'space'] as $scope) {
            foreach ($card[$scope]['attributes'] as $item) { $values[$item['key']][] = $item['value']; }
        }
        $score = 0;
        foreach ($this->filters as $field => $wanted) {
            if ($field === 'event_availability') {
                if (!self::covers($values[$field] ?? [], $wanted)) { return null; }
                continue;
            }
            $groups = $field === 'event_seeking' ? $wanted : ['code' => $wanted];
            foreach ($groups as $part => $codes) {
                $available = [];
                foreach ($values[$field] ?? [] as $value) {
                    $terms = $part === 'code' ? [($value['code'] ?? null)] : ($value[$part] ?? []);
                    foreach ($terms as $term) { if (is_string($term)) { $available[] = self::normalize($term); } }
                }
                $hits = array_intersect($codes, array_unique($available));
                if ($hits === []) { return null; }
                $score += count($hits);
            }
        }
        return $score;
    }

    private static function codes(mixed $value): array
    {
        if (!is_array($value) || !array_is_list($value) || $value === [] || count($value) > 30) { self::invalid(); }
        $result = [];
        foreach ($value as $code) {
            if (!is_string($code) || mb_strlen($code, 'UTF-8') > 64 || !mb_check_encoding($code, 'UTF-8') || preg_match('/[\x00-\x1F\x7F]/u', $code)) { self::invalid(); }
            $code = self::normalize($code); if ($code === '') { self::invalid(); } $result[] = $code;
        }
        $result = array_values(array_unique($result)); sort($result, SORT_STRING); return $result;
    }
    private static function normalize(string $code): string { return mb_strtolower(trim($code), 'UTF-8'); }
    private static function date(mixed $value): \DateTimeImmutable
    {
        if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/D', $value)) { self::invalid(); }
        try { $date = new \DateTimeImmutable($value); } catch (\Throwable) { self::invalid(); }
        $errors = \DateTimeImmutable::getLastErrors();
        if ($errors !== false && ($errors['warning_count'] || $errors['error_count'])) { self::invalid(); }
        return $date->setTimezone(new \DateTimeZone('UTC'));
    }
    /** Merge adjacent/overlapping UTC intervals, then require complete coverage of every requested window. */
    private static function covers(array $available, array $wanted): bool
    {
        $windows = [];
        foreach ($available as $value) { $windows[] = [(float)self::date($value['starts_at'])->format('U.u'), (float)self::date($value['ends_at'])->format('U.u')]; }
        usort($windows, static fn(array $a, array $b): int => $a <=> $b); $merged = [];
        foreach ($windows as $window) {
            $last = count($merged) - 1;
            if ($last >= 0 && $window[0] <= $merged[$last][1]) { $merged[$last][1] = max($merged[$last][1], $window[1]); }
            else { $merged[] = $window; }
        }
        foreach ($wanted as $window) {
            $start = (float)self::date($window['starts_at'])->format('U.u'); $end = (float)self::date($window['ends_at'])->format('U.u'); $covered = false;
            foreach ($merged as [$a, $b]) { if ($a <= $start && $b >= $end) { $covered = true; break; } }
            if (!$covered) { return false; }
        }
        return true;
    }
    private static function invalid(): never { throw new DiscoveryException('INVALID_DISCOVERY_QUERY', 'Use person, recent/relevance, limit 1–48 and supported structured public filters.'); }
}
