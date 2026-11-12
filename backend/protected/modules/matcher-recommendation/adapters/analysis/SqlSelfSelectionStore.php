<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\analysis;

use humhub\modules\matcherRecommendation\adapters\native\ServerActorSessionSource;
use humhub\modules\matcherRecommendation\contracts\{CurrentEventContext, EvidenceRef, ProjectionVersions};
use humhub\modules\matcherRecommendation\contracts\analysis\{CooperationAnalysisException, SelectedSelfAttributes};
use humhub\modules\matcherRecommendation\contracts\ports\{CurrentEventAccess, SelfSelectionStore};
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;
use yii\db\{Connection, IntegrityException, Query};

/**
 * Atomic module-owned CAS, scoped to a real authenticated session and exact activity selection.
 * HumHub's DbSession whole-bag writes are intentionally not used for selection authority.
 * Stores refs/versions only. No profile values, session credential, native session writes or DDL.
 */
final class SqlSelfSelectionStore implements SelfSelectionStore
{
    public function __construct(private readonly Connection $db, private readonly CurrentEventAccess $events, private readonly ServerActorSessionSource $identity) {}

    public function read(CurrentEventContext $context): ?SelectedSelfAttributes
    {
        return $this->state($context)['selection'];
    }

    public function state(CurrentEventContext $context): array
    {
        $key = $this->identity($context); $this->events->assertCurrent($context);
        $rows = $this->database(fn(Connection $db): array => (new Query())->select(['context_hash', 'selection_version', 'selection_json'])
            ->from(SelfAnalysisSelectionSchema::TABLE)->where($key)->limit(2)->noCache()->all($db));
        $this->sameIdentity($context, $key); $this->events->assertCurrent($context);
        if (count($rows) > 1) { throw new CooperationAnalysisException('dependency_unavailable'); }
        if ($rows === []) { return ['version' => 0, 'selection' => null]; }
        $row = $rows[0];
        $version = filter_var($row['selection_version'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 2147483646]]);
        if ($version === false || (string)$version !== (string)$row['selection_version']
            || !is_string($row['context_hash']) || !preg_match('/^[a-f0-9]{64}$/D', $row['context_hash']) || !is_string($row['selection_json'])) {
            throw new CooperationAnalysisException('dependency_unavailable');
        }
        if ($row['context_hash'] !== Fingerprint::of($context) || $row['selection_json'] === 'null') {
            // GET/analysis is read-only. Retain the actor/session monotonic version even when
            // the old context or a failed mutation provides no current selection authority.
            return ['version' => $version, 'selection' => null];
        }
        try { $selection = $this->decode($row['selection_json']); }
        catch (\Throwable) { throw new CooperationAnalysisException('dependency_unavailable'); }
        if ((string)$selection->selectionVersion !== (string)$row['selection_version'] || $selection->ownerId !== $context->viewerId || $selection->spaceId !== $context->spaceId) {
            throw new CooperationAnalysisException('dependency_unavailable');
        }
        return ['version' => $version, 'selection' => $selection];
    }

    public function replace(CurrentEventContext $context, int $expectedVersion, SelectedSelfAttributes $selection): void
    {
        if ($expectedVersion < 0 || $expectedVersion >= 2147483646 || $selection->selectionVersion !== $expectedVersion + 1
            || $selection->ownerId !== $context->viewerId || $selection->spaceId !== $context->spaceId) { throw new CooperationAnalysisException('invalid_request'); }
        $key = $this->identity($context); $before = $this->state($context);
        if ($before['version'] !== $expectedVersion) { throw new CooperationAnalysisException('selection_unavailable'); }
        $this->sameIdentity($context, $key); $this->events->assertCurrent($context);
        $contextHash = Fingerprint::of($context); $payload = json_encode($selection, JSON_THROW_ON_ERROR);
        $row = ['context_hash' => $contextHash, 'selection_version' => $selection->selectionVersion, 'selection_json' => $payload];
        $changed = $this->database(function (Connection $db) use ($key, $expectedVersion, $row): int {
            if ($expectedVersion === 0) { return $db->createCommand()->insert(SelfAnalysisSelectionSchema::TABLE, $key + $row)->execute(); }
            // A version is never reused within this authenticated actor/session, including
            // activity switches. Matching the prior version is the cross-context CAS fence.
            return $db->createCommand()->update(SelfAnalysisSelectionSchema::TABLE, $row, $key + ['selection_version' => $expectedVersion])->execute();
        });
        if ($changed !== 1) { throw new CooperationAnalysisException('selection_unavailable'); }
        try {
            $this->sameIdentity($context, $key); $this->events->assertCurrent($context);
            $current = $this->read($context);
            if ($current === null || Fingerprint::of($current) !== Fingerprint::of($selection)) { throw new CooperationAnalysisException('selection_unavailable'); }
        } catch (\Throwable) {
            // Keep a version tombstone: deleting the row would allow a stale version zero (or
            // a later reused version) to overwrite a new explicit selection. No old refs remain.
            $this->database(fn(Connection $db): int => $db->createCommand()->update(SelfAnalysisSelectionSchema::TABLE, ['selection_json' => 'null'],
                $key + ['context_hash' => $contextHash, 'selection_version' => $selection->selectionVersion, 'selection_json' => $payload])->execute());
            throw new CooperationAnalysisException('selection_unavailable');
        }
    }

    private function identity(CurrentEventContext $context): array
    {
        try { $identity = $this->identity->read(); } catch (\Throwable) { throw new CooperationAnalysisException('dependency_unavailable'); }
        $keys = array_keys($identity); sort($keys);
        if ($keys !== ['actor_id', 'session_hash'] || ($identity['actor_id'] ?? null) !== $context->viewerId
            || !is_string($identity['session_hash']) || !preg_match('/^[a-f0-9]{64}$/D', $identity['session_hash'])) { throw new CooperationAnalysisException('context_changed'); }
        return $identity;
    }
    private function sameIdentity(CurrentEventContext $context, array $key): void
    {
        if ($this->identity($context) !== $key) { throw new CooperationAnalysisException('context_changed'); }
    }
    private function database(callable $run): mixed
    {
        if ($this->db->getTransaction()?->isActive) { throw new CooperationAnalysisException('dependency_unavailable'); }
        $logging = $this->db->enableLogging; $profiling = $this->db->enableProfiling;
        $this->db->enableLogging = false; $this->db->enableProfiling = false;
        try { return $this->db->useMaster(fn(Connection $db): mixed => $db->noCache($run)); }
        catch (IntegrityException) { throw new CooperationAnalysisException('selection_unavailable'); }
        catch (CooperationAnalysisException $error) { throw new CooperationAnalysisException($error->reason); }
        catch (\Throwable) { throw new CooperationAnalysisException('dependency_unavailable'); }
        finally { $this->db->enableLogging = $logging; $this->db->enableProfiling = $profiling; }
    }
    private function decode(string $json): SelectedSelfAttributes
    {
        $data = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
        $keys = array_keys($data); sort($keys);
        if ($keys !== ['expectedVersions', 'ownerId', 'references', 'selectionId', 'selectionVersion', 'spaceId']) { throw new \UnexpectedValueException(); }
        $v = $data['expectedVersions']; $vk = array_keys($v); sort($vk);
        if ($vk !== ['identityVersion', 'profilePolicyVersion', 'schemaVersion', 'scopes'] || !is_array($data['references']) || !array_is_list($data['references'])) { throw new \UnexpectedValueException(); }
        $versions = new ProjectionVersions($v['scopes'], $v['schemaVersion'], $v['profilePolicyVersion'], $v['identityVersion']);
        $refs = [];
        foreach ($data['references'] as $r) {
            $rk = array_keys($r); sort($rk);
            if ($rk !== ['contentRevision', 'permissionVersion', 'scope', 'sourceId', 'sourceKind', 'targetId', 'targetType']) { throw new \UnexpectedValueException(); }
            $refs[] = new EvidenceRef($r['targetType'], $r['targetId'], $r['sourceKind'], $r['sourceId'], $r['scope'], $r['contentRevision'], $r['permissionVersion']);
        }
        return new SelectedSelfAttributes($data['ownerId'], $data['spaceId'], $data['selectionId'], $data['selectionVersion'], $versions, $refs);
    }
}
