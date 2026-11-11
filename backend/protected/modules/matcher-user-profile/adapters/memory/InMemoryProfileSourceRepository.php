<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\memory;
use humhub\modules\matcherProfile\domain\ports\ProfileSourceRepository;
final class InMemoryProfileSourceRepository implements ProfileSourceRepository
{
    public array $sources = [], $snapshots = [], $jobs = [];
    public bool $failSnapshot = false;
    public function transaction(callable $callback): mixed
    {
        $backup = [$this->sources,$this->snapshots,$this->jobs];
        try { return $callback(); } catch (\Throwable $error) { [$this->sources,$this->snapshots,$this->jobs]=$backup; throw $error; }
    }
    public function listSources(int $ownerId): array { return array_values(array_filter($this->sources, static fn(array $s): bool => $s['owner_id']===$ownerId && $s['status']!=='deleted')); }
    public function hasSourceHistory(int $ownerId,string $kind): bool { foreach($this->sources as $s)if($s['owner_id']===$ownerId&&$s['kind']===$kind)return true;return false; }
    public function findSource(string $id, bool $lock = false): ?array { return $this->sources[$id]??null; }
    public function findSourceKey(int $ownerId,string $kind,string $key): ?array { foreach($this->sources as $s) { if($s['owner_id']===$ownerId && $s['kind']===$kind && $s['source_key']===$key && $s['status']!=='deleted')return $s; }return null; }
    public function saveSource(array $source): void { $this->sources[$source['id']]=$source; }
    public function findSnapshot(string $id): ?array { return $this->snapshots[$id]??null; }
    public function saveSnapshot(array $snapshot): void { if($this->failSnapshot)throw new \RuntimeException('Synthetic storage failure');$this->snapshots[$snapshot['id']]=$snapshot; }
    public function purgeSnapshots(string $sourceId): void { foreach($this->snapshots as $id=>$s)if($s['source_id']===$sourceId)unset($this->snapshots[$id]); }
    public function findJob(string $id): ?array { return $this->jobs[$id]??null; }
    public function saveJob(array $job): void { $this->jobs[$job['id']]=$job; }
    public function changeJobApplicability(string $sourceId,string $applicability): void { foreach($this->jobs as &$j)if($j['source_id']===$sourceId)$j['applicability']=$applicability;unset($j); }
}
