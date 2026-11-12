<?php
declare(strict_types=1);
ob_start(); require __DIR__ . '/native.php'; $native = json_decode(trim(ob_get_clean()), true, 8, JSON_THROW_ON_ERROR); $checks = 0;
use humhub\modules\matcherChat\adapters\persistence\{SqlState, SqlReadStore};
use humhub\modules\matcherChat\domain\ChatException;

/** Real Yii Transaction/Connection nesting over a memory-only PDO protocol seam. */
final class TransactionMemoryPdo
{
    public bool $active = false;
    public array $snapshot = [];
    public function __construct(private TransactionMemoryConnection $db) {}
    public function beginTransaction(): bool { $this->snapshot = $this->db->data; $this->active = true; return true; }
    public function inTransaction(): bool { return $this->active; }
    public function commit(): bool
    {
        if ($this->db->commitFailure === 'before') { throw $this->db->injected; }
        $this->active = false;
        if ($this->db->commitFailure === 'after') { throw $this->db->injected; }
        return true;
    }
    public function rollBack(): bool
    {
        ++$this->db->rollbackCalls;
        if ($this->db->rollbackFailure) { throw new RuntimeException('Synthetic rollback failure.'); }
        $this->db->data = $this->snapshot; $this->active = false; return true;
    }
    public function discard(): void { if ($this->active) { $this->db->data = $this->snapshot; $this->active = false; } }
}
final class TransactionMemoryConnection extends \yii\db\Connection
{
    public array $data = ['revision' => null, 'writes' => 0];
    public array $savepoints = [];
    public int $closes = 0;
    public int $opens = 0;
    public int $rollbackCalls = 0;
    public bool $savepointRollbackFailure = false;
    public bool $savepointReleaseFailure = false;
    public bool $rollbackFailure = false;
    public ?string $commitFailure = null;
    public Throwable $injected;
    public function getDriverName() { return 'mysql'; }
    public function open() { if ($this->pdo === null) { $this->pdo = new TransactionMemoryPdo($this); ++$this->opens; } }
    public function close() { ++$this->closes; if ($this->pdo instanceof TransactionMemoryPdo) { $this->pdo->discard(); } parent::close(); }
    public function getSchema()
    {
        return new class(['db' => $this]) extends \yii\db\Schema {
            protected function loadTableSchema($name) { $table = new \yii\db\TableSchema(); $table->primaryKey = ['id']; return $table; }
            public function setTransactionIsolationLevel($level) {}
            public function supportsSavepoint() { return true; }
            public function createSavepoint($name) { $this->db->savepoints[$name] = $this->db->data; }
            public function releaseSavepoint($name) { if ($this->db->savepointReleaseFailure) { throw $this->db->injected; } unset($this->db->savepoints[$name]); }
            public function rollBackSavepoint($name) { if ($this->db->savepointRollbackFailure) { throw new RuntimeException('Synthetic savepoint rollback failure.'); } $this->db->data = $this->db->savepoints[$name]; }
        };
    }
    public function createCommand($sql = null, $params = [])
    {
        return new class($this, (string)$sql, $params) {
            private ?array $insert = null;
            public function __construct(private TransactionMemoryConnection $db, private string $sql, private array $params) {}
            public function queryOne($mode = null)
            {
                if (str_contains($this->sql, 'information_schema')) { return ['ENGINE' => 'InnoDB']; }
                if (str_contains($this->sql, '{{%matcher_chat_lock}}')) { return ['id' => '1']; }
                if (str_contains($this->sql, '{{%user}}')) { return ['id' => '1', 'status' => '1']; }
                if (str_contains($this->sql, '{{%matcher_chat_viewer_revision}}')) { return $this->db->data['revision'] ?? false; }
                throw new LogicException('Unexpected memory transaction query.');
            }
            public function queryAll($mode = null) { if (str_contains($this->sql, '{{%matcher_chat_conversation}}')) { return []; } throw new LogicException('Unexpected memory transaction list.'); }
            public function insert($table, $columns) { if ($table !== '{{%matcher_chat_viewer_revision}}') { throw new LogicException('Unexpected memory insert.'); } $this->insert = $columns; return $this; }
            public function execute() { $this->db->data['revision'] = $this->insert; return 1; }
        };
    }
}
function transactionFixture(): array { $db = new TransactionMemoryConnection(); return [$db, new SqlReadStore(new SqlState($db), 1)]; }
function sameFailure(callable $run, Throwable $expected): void { try { $run(); } catch (Throwable $error) { check($error === $expected, 'original exception identity preserved'); return; } throw new RuntimeException('Expected transaction failure.'); }

[$db, $reads] = transactionFixture();
$reads->run(function () use ($db): void { check($db->getTransaction() instanceof \yii\db\Transaction && $db->getTransaction()->getLevel() === 2, 'actual Yii reused transaction enters nested savepoint'); ++$db->data['writes']; });
check($db->data['revision'] !== null && $db->data['writes'] === 1 && $db->getTransaction() === null && !$db->pdo->inTransaction() && $db->closes === 0, 'success commits outer level zero');

foreach ([new RuntimeException('Synthetic I/O failure.'), new Error('Synthetic engine failure.')] as $failure) {
    [$db, $reads] = transactionFixture();
    sameFailure(fn () => $reads->run(function () use ($db, $failure): void { ++$db->data['writes']; throw $failure; }), $failure);
    check($db->data === ['revision' => null, 'writes' => 0] && $db->getTransaction() === null && $db->pdo === null && $db->closes === 1, 'unexpected failure rolls back all owned levels and discards connection');
    $reads->run(function () use ($db): void { ++$db->data['writes']; });
    check($db->data['writes'] === 1 && $db->getTransaction() === null && $db->opens === 2, 'same adapter recovers on fresh memory connection');
}
[$db, $reads] = transactionFixture(); $failure = new ChatException('SYNTHETIC_BUSINESS_FAILURE', 'Synthetic rule refusal.', 409);
sameFailure(fn () => $reads->run(function () use ($db, $failure): void { ++$db->data['writes']; throw $failure; }), $failure);
check($db->data['revision'] !== null && $db->data['writes'] === 0 && $db->getTransaction() === null && $db->closes === 0, 'business failure rolls back only use case and commits authorization observation');

foreach ([new RuntimeException('Synthetic original failure.'), new ChatException('SYNTHETIC_BUSINESS_FAILURE', 'Synthetic original rule.', 409)] as $failure) {
    [$db, $reads] = transactionFixture(); $db->savepointRollbackFailure = true;
    sameFailure(fn () => $reads->run(function () use ($db, $failure): void { ++$db->data['writes']; throw $failure; }), $failure);
    check($db->data === ['revision' => null, 'writes' => 0] && $db->getTransaction() === null && $db->pdo === null, 'failed savepoint rollback cannot commit authorization or body');
}
[$db, $reads] = transactionFixture(); $db->rollbackFailure = true; $failure = new RuntimeException('Synthetic original rollback trigger.');
sameFailure(fn () => $reads->run(function () use ($db, $failure): void { ++$db->data['writes']; throw $failure; }), $failure);
check($db->rollbackCalls === 1 && $db->pdo === null && $db->getTransaction() === null && $db->data['writes'] === 0, 'PDO rollback throw at Yii level zero discards dangling transaction');

foreach (['before', 'after'] as $when) {
    [$db, $reads] = transactionFixture(); $db->commitFailure = $when; $db->injected = new RuntimeException('Synthetic ambiguous commit.');
    sameFailure(fn () => $reads->run(function () use ($db): void { ++$db->data['writes']; }), $db->injected);
    check($db->getTransaction() === null && $db->pdo === null && $db->closes === 1, 'commit exception discards connection even with Yii level zero');
    check($db->data['writes'] === ($when === 'before' ? 0 : 1), 'unknown commit outcome is not falsely declared rollback');
}
[$db, $reads] = transactionFixture(); $db->savepointReleaseFailure = true; $db->injected = new RuntimeException('Synthetic savepoint release failure.');
sameFailure(fn () => $reads->run(function () use ($db): void { ++$db->data['writes']; }), $db->injected);
check($db->pdo === null && $db->data['writes'] === 0 && $db->getTransaction() === null, 'savepoint release failure rolls back outer state');
[$db, $reads] = transactionFixture(); $db->savepointReleaseFailure = true; $db->injected = new ChatException('SYNTHETIC_RELEASE_FAILURE', 'Synthetic release refusal.', 409);
sameFailure(fn () => $reads->run(function () use ($db): void { ++$db->data['writes']; }), $db->injected);
check($db->pdo === null && $db->data === ['revision' => null, 'writes' => 0] && $db->getTransaction() === null, 'commit-stage ChatException cannot masquerade as business rejection');

[$db, $reads] = transactionFixture(); $failure = new RuntimeException('Synthetic extra nested failure.');
sameFailure(fn () => $reads->run(function () use ($db, $failure): void { $outer = $db->getTransaction(); $nested = $db->beginTransaction(); check($outer === $nested && $nested->getLevel() === 3, 'Yii nested begin returns same object'); ++$db->data['writes']; throw $failure; }), $failure);
check($db->pdo === null && $db->getTransaction() === null && $db->data['writes'] === 0, 'all deeper owned levels removed');
[$db, $reads] = transactionFixture(); $failed = false;
try { $reads->run(function () use ($db): void { $db->beginTransaction(); ++$db->data['writes']; }); } catch (LogicException) { $failed = true; }
check($failed && $db->pdo === null && $db->getTransaction() === null && $db->data['writes'] === 0, 'successful callback cannot silently leave nested transaction open');
echo json_encode(['status' => 'passed', 'checks' => $checks, 'native_checks' => $native['checks'], 'database_connections' => 0, 'http_requests' => 0, 'scope' => 'actual Yii transaction level semantics with memory PDO protocol; not MySQL acceptance'], JSON_THROW_ON_ERROR), PHP_EOL;
