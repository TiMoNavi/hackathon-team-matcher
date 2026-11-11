<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\memory;
use humhub\modules\matcherProfile\domain\ports\ProfileAiJobRepository;
use humhub\modules\matcherProfile\domain\ports\ProfileAiJobSessionQuery;
final class InMemoryProfileAiJobRepository implements ProfileAiJobRepository, ProfileAiJobSessionQuery
{
    public array $jobs = [];
    public function transaction(callable $callback): mixed { $before=$this->jobs;try{return $callback();}catch(\Throwable $e){$this->jobs=$before;throw $e;} }
    public function find(string $id,bool $lock=false): ?array { return $this->jobs[$id]??null; }
    public function save(array $job): void { $this->jobs[$job['id']]=$job; }
    public function nextQueued(): ?string { foreach($this->jobs as $job)if($job['execution_status']==='queued'&&$job['applicability']==='current')return $job['id'];return null; }
    public function expiredRunning(string $before,?int $ownerId=null): array { return array_values(array_filter($this->jobs,fn($j)=>$j['execution_status']==='running'&&$j['started_at']!==null&&$j['started_at']<=$before&&($ownerId===null||$j['owner_id']===$ownerId))); }
    public function countActive(int $ownerId): int { return count(array_filter($this->jobs,fn($j)=>$j['owner_id']===$ownerId&&$j['applicability']==='current'&&in_array($j['execution_status'],['queued','running'],true))); }
    public function countSince(int $ownerId,string $since): int { return count(array_filter($this->jobs,fn($j)=>$j['owner_id']===$ownerId&&$j['created_at']>=$since)); }
    public function forSession(int $ownerId, string $sessionId, int $limit = 21): array
    {
        $rows = array_values(array_filter($this->jobs, static fn(array $j): bool => $j['owner_id'] === $ownerId && ($j['context']['session_id'] ?? null) === $sessionId));
        usort($rows, static function(array $a, array $b): int {
            $active = static fn(array $j): int => (int)($j['applicability'] === 'current' && in_array($j['execution_status'], ['queued', 'running'], true));
            return $active($b) <=> $active($a) ?: strcmp($b['updated_at'], $a['updated_at']) ?: strcmp($b['created_at'], $a['created_at']) ?: strcmp($b['id'], $a['id']);
        });
        return array_slice($rows, 0, max(1, min(21, $limit)));
    }
    public function revokeSource(string $sourceId): void { foreach($this->jobs as &$j)if(isset($j['context']['sources'][$sourceId])){$j['applicability']='revoked';$j['input']=[];$j['result']=[];$j['receipts']=[];if($j['execution_status']==='queued')$j['execution_status']='cancelled';}unset($j); }
}
