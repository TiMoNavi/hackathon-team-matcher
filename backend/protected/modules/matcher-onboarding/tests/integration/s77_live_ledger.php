<?php
declare(strict_types=1);
/** Filesystem-only experiment ledger; no app, DB, credentials or model access. */
final class S77LiveLedger
{
    private $lock;
    public function __construct(private string $path)
    {
        $this->lock = fopen($path . '.lock', 'c+');
        if (!$this->lock || !flock($this->lock, LOCK_EX | LOCK_NB)) { throw new RuntimeException('S77 live ledger is locked.'); }
        chmod($path . '.lock', 0600);
    }
    public function read(): array
    {
        if (!file_exists($this->path)) { return ['schema_version' => 1, 'database' => 'humhub_profile_s77_test_root_f3a9d621', 'max_worker_attempts' => 6, 'attempts' => []]; }
        $raw = file_get_contents($this->path);
        // An existing empty/corrupt file is never treated as an unspent budget.
        if ($raw === false || $raw === '') { throw new RuntimeException('S77 existing ledger is unreadable.'); }
        $ledger = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        if (!is_array($ledger) || ($ledger['database'] ?? null) !== 'humhub_profile_s77_test_root_f3a9d621'
            || ($ledger['schema_version'] ?? null) !== 1 || ($ledger['max_worker_attempts'] ?? null) !== 6
            || !is_array($ledger['attempts'] ?? null) || !array_is_list($ledger['attempts']) || count($ledger['attempts']) > 6) {
            throw new RuntimeException('S77 ledger is invalid.');
        }
        $ids = [];
        foreach ($ledger['attempts'] as $attempt) {
            if (!is_array($attempt) || !is_string($attempt['job_id'] ?? null) || isset($ids[$attempt['job_id']]) || !is_array($attempt['metrics'] ?? null)) { throw new RuntimeException('S77 ledger entry is invalid.'); }
            $ids[$attempt['job_id']] = true;
        }
        return $ledger;
    }
    public function write(array $ledger): void
    {
        $encoded = json_encode($ledger, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        $temporary = $this->path . '.' . bin2hex(random_bytes(8)) . '.tmp';
        $handle = fopen($temporary, 'x+b');
        if (!$handle) { throw new RuntimeException('S77 temporary ledger could not open.'); }
        chmod($temporary, 0600);
        try {
            $offset = 0;
            while ($offset < strlen($encoded)) {
                $written = fwrite($handle, substr($encoded, $offset));
                if ($written === false || $written === 0) { throw new RuntimeException('S77 ledger write failed.'); }
                $offset += $written;
            }
            if (!fflush($handle) || !fsync($handle)) { throw new RuntimeException('S77 ledger flush failed.'); }
            fclose($handle); $handle = null;
            if (!rename($temporary, $this->path)) { throw new RuntimeException('S77 ledger replacement failed.'); }
        } finally {
            if (is_resource($handle)) { fclose($handle); }
            if (file_exists($temporary)) { unlink($temporary); }
        }
    }
    public function __destruct()
    { if (is_resource($this->lock)) { flock($this->lock, LOCK_UN); fclose($this->lock); } }
}
