<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\persistence;
use yii\db\{Connection, IntegrityException, Transaction};

/** Keeps storage I/O authoritative and quiet; never adopts or commits somebody else's transaction. */
final class SqlStorageSession
{
    private ?Transaction $owned = null;
    public function __construct(private readonly Connection $db) {}

    public function run(#[\SensitiveParameter] callable $operation): mixed
    {
        $active = $this->db->getTransaction();
        if ($active?->isActive && $active !== $this->owned) { throw new StorageException('transaction_unsupported'); }
        $logging = $this->db->enableLogging; $profiling = $this->db->enableProfiling;
        $this->db->enableLogging = false; $this->db->enableProfiling = false;
        try { return $this->db->useMaster(fn(Connection $db): mixed => $db->noCache($operation)); }
        catch (StorageException $error) { throw new StorageException($error->reason); }
        catch (IntegrityException) { throw new StorageException('cas_conflict'); }
        catch (\Throwable) { throw new StorageException('dependency_unavailable'); }
        finally { $this->db->enableLogging = $logging; $this->db->enableProfiling = $profiling; }
    }

    public function transaction(#[\SensitiveParameter] callable $operation): mixed
    {
        return $this->run(function (Connection $db) use ($operation): mixed {
            $previous = $this->owned;
            $tx = $db->beginTransaction();
            $this->owned = $tx;
            try { $result = $operation(); $tx->commit(); return $result; }
            catch (\Throwable $error) {
                if ($tx->isActive) { $tx->rollBack(); }
                throw new StorageException($error instanceof StorageException ? $error->reason : 'transaction_failed');
            } finally { $this->owned = $previous; }
        });
    }
}
