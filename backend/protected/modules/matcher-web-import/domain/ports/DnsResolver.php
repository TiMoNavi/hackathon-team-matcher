<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebImport\domain\ports;
interface DnsResolver
{
    /** Resolve A/AAAA without exceeding the supplied wall-clock budget. */
    public function resolve(string $host, int $timeoutMs): array;
}
