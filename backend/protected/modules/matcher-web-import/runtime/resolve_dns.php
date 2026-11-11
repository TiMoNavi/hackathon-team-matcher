<?php
declare(strict_types=1);
// Invoked only by ProcessDnsResolver with a bounded lifetime and no shell/environment secrets.
$host = $argv[1] ?? '';
if (!preg_match('/^[a-z0-9.-]{1,253}$/D', $host)) { exit(2); }
$queue = [$host]; $seen = []; $addresses = [];
while ($queue !== [] && count($seen) < 8) {
    $name = array_shift($queue);
    if (isset($seen[$name])) { continue; } $seen[$name] = true;
    $records = @dns_get_record($name, DNS_A | DNS_AAAA | DNS_CNAME);
    if ($records === false) { exit(3); }
    foreach ($records as $record) {
        if (isset($record['ip'])) { $addresses[] = $record['ip']; }
        if (isset($record['ipv6'])) { $addresses[] = $record['ipv6']; }
        if (isset($record['target']) && ($record['type'] ?? '') === 'CNAME') {
            $target = strtolower(rtrim($record['target'], '.'));
            if (!preg_match('/^[a-z0-9.-]{1,253}$/D', $target)) { exit(4); }
            $queue[] = $target;
        }
    }
    if (count($addresses) > 64) { exit(5); }
}
if ($queue !== [] || $addresses === []) { exit(6); }
echo json_encode(array_values(array_unique($addresses)), JSON_THROW_ON_ERROR);
