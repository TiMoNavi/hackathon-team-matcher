<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\index;
use humhub\modules\matcherRecommendation\contracts\ports\Clock;
use yii\db\{Connection, Query};

/** Explicit maintenance capability, not a scheduled task or a source of candidate authorization. */
final class SqlCandidateIndexCleanup
{
    public function __construct(private readonly Connection $db, private readonly Clock $clock) {}

    /** Fixed-deadline generations only; untracked legacy rows are deliberately not guessed or swept. */
    public function purgeExpired(int $limit = 100): int
    {
        if ($limit < 1 || $limit > 500) { throw new \InvalidArgumentException('Cleanup limit must be between 1 and 500.'); }
        if ($this->db->getTransaction()?->isActive) { throw new CandidateIndexException('transaction_unsupported'); }
        $logging = $this->db->enableLogging; $profiling = $this->db->enableProfiling;
        $this->db->enableLogging = false; $this->db->enableProfiling = false;
        try {
            $cutoff = IndexLeaseTime::microseconds($this->clock->now());
            return $this->db->useMaster(function (Connection $db) use ($cutoff, $limit): int {
                return $db->noCache(function (Connection $db) use ($cutoff, $limit): int {
                    $rows = (new Query())->select(['generation', 'expires_at_us'])->from(CandidateIndexLifecycleSchema::TABLE)
                        ->where(['<=', 'expires_at_us', $cutoff])->orderBy(['expires_at_us' => SORT_ASC, 'generation' => SORT_ASC])->limit($limit)->all($db);
                    $removed = 0;
                    foreach ($rows as $row) {
                        $generation = $row['generation'] ?? null;
                        if (!is_string($generation) || !preg_match('/^g-[a-f0-9]{48}$/D', $generation)) { throw new CandidateIndexException('snapshot_invalid'); }
                        $expiry = IndexLeaseTime::stored($row['expires_at_us'] ?? null);
                        if ($expiry > $cutoff) { throw new CandidateIndexException('snapshot_invalid'); }
                        $transaction = $db->beginTransaction();
                        try {
                            // The row may have been released or cleaned after selection. Only its CAS winner deletes children.
                            $claimed = $db->createCommand()->delete(CandidateIndexLifecycleSchema::TABLE, ['and', ['generation' => $generation, 'expires_at_us' => $expiry], ['<=', 'expires_at_us', $cutoff]])->execute();
                            if ($claimed === 1) {
                                $db->createCommand()->delete(CandidateIndexSchema::TERM_TABLE, ['generation' => $generation])->execute();
                                $db->createCommand()->delete(CandidateIndexSchema::INTERVAL_TABLE, ['generation' => $generation])->execute();
                                $removed++;
                            } elseif ($claimed !== 0) { throw new CandidateIndexException('snapshot_invalid'); }
                            $transaction->commit();
                        } catch (\Throwable $error) {
                            if ($transaction->isActive) { $transaction->rollBack(); }
                            throw $error;
                        }
                    }
                    return $removed;
                });
            });
        } catch (\Throwable $error) {
            throw new CandidateIndexException($error instanceof CandidateIndexException ? $error->reason : 'dependency_unavailable');
        } finally { $this->db->enableLogging = $logging; $this->db->enableProfiling = $profiling; }
    }
}
