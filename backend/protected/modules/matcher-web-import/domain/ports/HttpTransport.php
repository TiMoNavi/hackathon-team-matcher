<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebImport\domain\ports;
interface HttpTransport
{
    /** Connect only to the approved IP, with no implicit redirects or proxy. */
    public function get(string $url, string $ip, int $timeoutMs, int $maxBytes): array;
}
