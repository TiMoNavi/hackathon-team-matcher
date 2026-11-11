<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebImport\adapters\network;

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherWebImport\domain\ports\DnsResolver;

/** Isolate blocking system DNS so the parent can enforce a real wall-clock deadline. */
final class ProcessDnsResolver implements DnsResolver
{
    public function __construct(private ?string $phpBinary = null, private ?string $script = null) {}

    public function available(): bool
    {
        return function_exists('proc_open') && is_executable($this->binary())
            && is_file($this->script ?? dirname(__DIR__, 2) . '/runtime/resolve_dns.php');
    }

    public function resolve(string $host, int $timeoutMs): array
    {
        if (!$this->available()) { throw new ProfileException('WEB_RUNTIME_UNAVAILABLE', 'The bounded website resolver is unavailable.', 503); }
        if ($timeoutMs < 1 || !preg_match('/^[a-z0-9.-]{1,253}$/D', $host)) { throw new ProfileException('WEB_DNS_FAILED', 'The website hostname could not be resolved.', 502); }
        $start = hrtime(true); $pipes = [];
        $process = @proc_open([$this->binary(), '-n', $this->script ?? dirname(__DIR__, 2) . '/runtime/resolve_dns.php', $host],
            [0 => ['pipe','r'], 1 => ['pipe','w'], 2 => ['pipe','w']], $pipes, null, ['LANG' => 'C', 'LC_ALL' => 'C'], ['bypass_shell' => true]);
        if (!is_resource($process)) { throw new ProfileException('WEB_DNS_FAILED', 'The website hostname could not be resolved.', 502); }
        fclose($pipes[0]); stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
        $output = ''; $errors = ''; $timedOut = false; $overflow = false;
        try {
            while (true) {
                $output .= stream_get_contents($pipes[1]); $errors .= stream_get_contents($pipes[2]);
                if (strlen($output) > 16384 || strlen($errors) > 16384) { $overflow = true; proc_terminate($process, 9); break; }
                $status = proc_get_status($process);
                if (!$status['running']) { $output .= stream_get_contents($pipes[1]); break; }
                if ((hrtime(true) - $start) / 1e6 >= $timeoutMs) { $timedOut = true; proc_terminate($process, 9); break; }
                usleep(1000);
            }
        } finally { fclose($pipes[1]); fclose($pipes[2]); proc_close($process); }
        if ($timedOut || (hrtime(true) - $start) / 1e6 > $timeoutMs) { throw new ProfileException('WEB_DNS_TIMEOUT', 'The website hostname lookup exceeded its time limit.', 504); }
        $decoded = $overflow ? null : json_decode($output, true);
        if (!is_array($decoded) || !array_is_list($decoded) || $decoded === [] || count($decoded) > 64) { throw new ProfileException('WEB_DNS_FAILED', 'The website hostname could not be resolved.', 502); }
        foreach ($decoded as $ip) { if (!is_string($ip) || filter_var($ip, FILTER_VALIDATE_IP) === false) { throw new ProfileException('WEB_DNS_FAILED', 'The website hostname could not be resolved.', 502); } }
        return array_values(array_unique($decoded));
    }

    private function binary(): string
    { return $this->phpBinary ?? (in_array(PHP_SAPI, ['cli','cli-server'], true) ? PHP_BINARY : PHP_BINDIR . '/php'); }
}
