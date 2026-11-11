<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\native;
use humhub\modules\matcherRecommendation\contracts\{ContractShape, CurrentEventContext};
use humhub\modules\matcherRecommendation\contracts\ports\CurrentEventSelectionWriter;
use yii\db\{Connection, IntegrityException, Query};

/**
 * Module-owned selection with atomic compare-and-swap; no native session serialization writes.
 * Authorization is observed before and after the short mutation, never inferred from this row.
 * A failed postcheck invalidates only its own revision and cannot overwrite a concurrent switch.
 */
final class SqlCurrentEventSelectionStore implements ServerSelectionSource, CurrentEventSelectionWriter
{
    private readonly NativeEligibilityQuery $native;
    private readonly NativeCurrentEventAccess $events;

    public function __construct(private readonly Connection $db, private readonly ServerActorSessionSource $identity, string $policyVersion)
    {
        ContractShape::token($policyVersion);
        $this->native = new NativeEligibilityQuery($db);
        $this->events = new NativeCurrentEventAccess($db, $this, $policyVersion);
    }

    public function read(): array
    {
        $identity = $this->identitySnapshot();
        $rows = $this->native->run((new Query())->select(['actor_id', 'space_id', 'selection_revision'])
            ->from(CurrentEventSelectionSchema::TABLE)->where($identity)->limit(2));
        if ($this->identitySnapshot() !== $identity) { throw new NativeAccessException('context_changed'); }
        if ($rows === []) { throw new NativeAccessException('current_event_required'); }
        if (count($rows) !== 1) { throw new NativeAccessException('dependency_unavailable'); }
        $row = $rows[0];
        if (!self::positiveId($row['actor_id'] ?? null) || !self::positiveId($row['space_id'] ?? null)
            || (int)$row['actor_id'] !== $identity['actor_id'] || !is_string($row['selection_revision'] ?? null)
            || !preg_match('/^selection-[a-f0-9]{32}$/D', $row['selection_revision'])) {
            throw new NativeAccessException('dependency_unavailable');
        }
        return ['actor_id' => (int)$row['actor_id'], 'space_id' => (int)$row['space_id'], 'selection_revision' => $row['selection_revision']];
    }

    public function select(int $spaceId, ?string $expectedRevision): CurrentEventContext
    {
        if ($spaceId < 1 || ($expectedRevision !== null && !preg_match('/^selection-[a-f0-9]{32}$/D', $expectedRevision))) {
            throw new NativeAccessException('invalid_request');
        }
        $identity = $this->identitySnapshot();
        $this->native->viewerFacts($identity['actor_id'], $spaceId);
        if ($this->identitySnapshot() !== $identity) { throw new NativeAccessException('context_changed'); }
        try { $revision = 'selection-' . bin2hex(random_bytes(16)); }
        catch (\Throwable) { throw new NativeAccessException('dependency_unavailable'); }
        $new = ['space_id' => $spaceId, 'selection_revision' => $revision];
        // A unique insert or conditional UPDATE is one atomic statement, not read-then-overwrite.
        $changed = $this->mutate(function (Connection $db) use ($identity, $new, $expectedRevision): int {
            if ($expectedRevision === null) { return $db->createCommand()->insert(CurrentEventSelectionSchema::TABLE, $identity + $new)->execute(); }
            return $db->createCommand()->update(CurrentEventSelectionSchema::TABLE, $new, $identity + ['selection_revision' => $expectedRevision])->execute();
        });
        if ($changed !== 1) { throw new NativeAccessException('context_changed'); }
        $selected = ['actor_id' => $identity['actor_id'], 'space_id' => $spaceId, 'selection_revision' => $revision];
        try {
            if ($this->identitySnapshot() !== $identity || $this->read() !== $selected) { throw new NativeAccessException('context_changed'); }
            $context = $this->events->resolve($identity['actor_id'], $spaceId);
            if ($this->identitySnapshot() !== $identity || $this->read() !== $selected) { throw new NativeAccessException('context_changed'); }
            return $context;
        } catch (\Throwable $error) {
            // Do not restore a stale previous Space or delete a newer concurrent revision.
            $this->mutate(fn(Connection $db): int => $db->createCommand()->delete(CurrentEventSelectionSchema::TABLE, $identity + ['selection_revision' => $revision])->execute());
            if ($error instanceof NativeAccessException) { throw $error; }
            throw new NativeAccessException('dependency_unavailable');
        }
    }

    private function identitySnapshot(): array
    {
        try { $identity = $this->identity->read(); }
        catch (NativeAccessException $error) { throw new NativeAccessException($error->reason); }
        catch (\Throwable) { throw new NativeAccessException('dependency_unavailable'); }
        $keys = array_keys($identity); sort($keys, SORT_STRING);
        if ($keys !== ['actor_id', 'session_hash'] || !is_int($identity['actor_id']) || $identity['actor_id'] < 1
            || !is_string($identity['session_hash']) || !preg_match('/^[a-f0-9]{64}$/D', $identity['session_hash'])) {
            throw new NativeAccessException('authentication_required');
        }
        return $identity;
    }

    private function mutate(callable $action): int
    {
        if ($this->db->getTransaction()?->isActive) { throw new NativeAccessException('authorization_transaction_unsupported'); }
        $logging = $this->db->enableLogging; $profiling = $this->db->enableProfiling;
        $this->db->enableLogging = false; $this->db->enableProfiling = false;
        try { return $this->db->useMaster(fn(Connection $db): int => $db->noCache($action)); }
        catch (IntegrityException) { throw new NativeAccessException('context_changed'); }
        catch (NativeAccessException $error) { throw new NativeAccessException($error->reason); }
        catch (\Throwable) { throw new NativeAccessException('dependency_unavailable'); }
        finally { $this->db->enableLogging = $logging; $this->db->enableProfiling = $profiling; }
    }

    private static function positiveId(mixed $value): bool
    {
        return (is_int($value) || is_string($value)) && preg_match('/^[1-9][0-9]*$/D', (string)$value)
            && filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) !== false;
    }
}
