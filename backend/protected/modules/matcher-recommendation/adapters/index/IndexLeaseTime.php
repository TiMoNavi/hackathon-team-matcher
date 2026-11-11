<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\index;

/** Exact integer UTC microseconds; avoid floating point at lease boundaries. */
final class IndexLeaseTime
{
    public static function microseconds(\DateTimeImmutable $date): int
    {
        $seconds = filter_var($date->format('U'), FILTER_VALIDATE_INT);
        if ($seconds === false || $seconds < 0 || $seconds > intdiv(PHP_INT_MAX - 999999, 1000000)) {
            throw new CandidateIndexException('dependency_unavailable');
        }
        return $seconds * 1000000 + (int)$date->format('u');
    }

    public static function stored(mixed $value): int
    {
        if (!is_int($value) && (!is_string($value) || !preg_match('/^(?:0|[1-9][0-9]*)$/D', $value))) {
            throw new CandidateIndexException('snapshot_invalid');
        }
        $number = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
        if ($number === false) { throw new CandidateIndexException('snapshot_invalid'); }
        return $number;
    }
}
