<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\persistence;

use humhub\modules\matcherRecommendation\contracts\ports\PolicyRevisionStore;
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\domain\config\{Fingerprint, PolicyDraft};
use yii\db\{Connection, Expression, Query};

/**
 * Atomic recommendation-owned state. This adapter does not authorize policy management or lock
 * external admin/catalog facts: the composition must supply their commit-time guard separately.
 * Draft heads use revision CAS; each publication version can be inserted only once, including rollback.
 */
final class SqlPolicyRevisionStore implements PolicyRevisionStore
{
    private readonly SqlStorageSession $session;
    private readonly TypedJsonCodec $codec;
    public function __construct(Connection $db) { $this->session = new SqlStorageSession($db); $this->codec = new TypedJsonCodec(); }

    public function transaction(#[\SensitiveParameter] callable $operation): mixed
    {
        try { return $this->session->transaction($operation); }
        catch (StorageException $error) { throw new StorageException($error->reason); }
        catch (\Throwable) { throw new StorageException('transaction_failed'); }
    }
    public function draft(string $draftId): ?PolicyDraft
    {
        try {
            TypedJsonCodec::token($draftId);
            return $this->session->run(function (Connection $db) use ($draftId): ?PolicyDraft {
                $row = (new Query())->select(['id', 'revision', 'payload_json', 'payload_digest'])->from(RecommendationStorageSchema::DRAFT_TABLE)->where(['id' => $draftId])->noCache()->one($db);
                if ($row === false) { return null; }
                $draft = $this->codec->decodeDraft(TypedJsonCodec::verifiedPayload($row));
                if ($row['id'] !== $draftId || $draft->id !== $draftId || self::positiveRevision($row['revision']) !== $draft->revision) { throw new StorageException('corrupt_storage'); }
                return $draft;
            });
        } catch (StorageException $error) { throw new StorageException($error->reason); }
        catch (\Throwable) { throw new StorageException('invalid_data'); }
    }
    public function save(#[\SensitiveParameter] PolicyDraft $draft, ?int $expectedRevision): void
    {
        try {
            if (($expectedRevision !== null && ($expectedRevision < 1 || $expectedRevision >= 2147483647)) || $draft->revision !== ($expectedRevision ?? 0) + 1) { throw new StorageException('cas_conflict'); }
            $json = $this->codec->encodeDraft($draft);
            $this->session->run(function (Connection $db) use ($draft, $expectedRevision, $json): void {
                $values = ['revision' => $draft->revision, 'payload_json' => $json, 'payload_digest' => hash('sha256', $json)];
                if ($expectedRevision === null) {
                    $changed = $db->createCommand()->insert(RecommendationStorageSchema::DRAFT_TABLE, ['id' => $draft->id, 'lock_version' => 0] + $values)->execute();
                } else {
                    // A corrupt head is not silently repaired by replacing its bytes. The conditional
                    // UPDATE still provides the final race-safe revision comparison after this read.
                    if ($this->draft($draft->id)?->revision !== $expectedRevision) { throw new StorageException('cas_conflict'); }
                    $changed = $db->createCommand()->update(RecommendationStorageSchema::DRAFT_TABLE, $values + ['lock_version' => new Expression('[[lock_version]] + 1')], ['id' => $draft->id, 'revision' => $expectedRevision])->execute();
                }
                if ($changed !== 1) { throw new StorageException('cas_conflict'); }
            });
        } catch (StorageException $error) { throw new StorageException($error->reason); }
        catch (\Throwable) { throw new StorageException('invalid_data'); }
    }
    public function active(): ?RulePolicy
    {
        try {
            return $this->session->run(function (Connection $db): ?RulePolicy {
                // A single joined SELECT cannot mix a pointer from one publication with another payload.
                $rows = (new Query())->select(['slot' => 'a.slot', 'active_version' => 'a.active_version', 'version' => 'p.version', 'payload_json' => 'p.payload_json', 'payload_digest' => 'p.payload_digest'])
                    ->from(['a' => RecommendationStorageSchema::ACTIVE_TABLE])
                    ->leftJoin(['p' => RecommendationStorageSchema::PUBLISHED_TABLE], '[[p.version]] = [[a.active_version]]')
                    ->where(['a.slot' => 1])->limit(2)->noCache()->all($db);
                if (count($rows) !== 1) { throw new StorageException('corrupt_storage'); }
                $row = $rows[0];
                if ($row['active_version'] === null) {
                    if ($row['version'] !== null || $row['payload_json'] !== null || $row['payload_digest'] !== null) { throw new StorageException('corrupt_storage'); }
                    return null;
                }
                $policy = $this->codec->decodePolicy(TypedJsonCodec::verifiedPayload($row));
                if ($row['active_version'] !== $row['version'] || $row['version'] !== $policy->version) { throw new StorageException('corrupt_storage'); }
                return $policy;
            });
        } catch (StorageException $error) { throw new StorageException($error->reason); }
        catch (\Throwable) { throw new StorageException('dependency_unavailable'); }
    }
    public function published(string $version): ?RulePolicy
    {
        try {
            TypedJsonCodec::token($version);
            return $this->session->run(function (Connection $db) use ($version): ?RulePolicy {
                $row = (new Query())->select(['version', 'payload_json', 'payload_digest'])->from(RecommendationStorageSchema::PUBLISHED_TABLE)->where(['version' => $version])->noCache()->one($db);
                if ($row === false) { return null; }
                $policy = $this->codec->decodePolicy(TypedJsonCodec::verifiedPayload($row));
                if ($row['version'] !== $version || $policy->version !== $version) { throw new StorageException('corrupt_storage'); }
                return $policy;
            });
        } catch (StorageException $error) { throw new StorageException($error->reason); }
        catch (\Throwable) { throw new StorageException('invalid_data'); }
    }
    public function publish(string $draftId, int $expectedRevision, ?string $expectedActiveVersion, #[\SensitiveParameter] RulePolicy $policy): void
    {
        try {
            TypedJsonCodec::token($draftId);
            if ($expectedActiveVersion !== null) { TypedJsonCodec::token($expectedActiveVersion); }
            if ($expectedRevision < 1 || $expectedRevision > 2147483647) { throw new StorageException('invalid_data'); }
            $json = $this->codec->encodePolicy($policy);
            // Always use a savepoint if the lifecycle already owns an outer transaction. A caller
            // catching a publication error cannot accidentally commit its half-completed mutation.
            $this->session->transaction(function () use ($draftId, $expectedRevision, $expectedActiveVersion, $policy, $json): void {
                $this->session->run(function (Connection $db) use ($draftId, $expectedRevision): void {
                    $changed = $db->createCommand()->update(RecommendationStorageSchema::DRAFT_TABLE, ['lock_version' => new Expression('[[lock_version]] + 1')], ['id' => $draftId, 'revision' => $expectedRevision])->execute();
                    if ($changed !== 1) { throw new StorageException('cas_conflict'); }
                });
                $draft = $this->draft($draftId);
                if ($draft === null || $draft->revision !== $expectedRevision || $draft->policy()->version !== $policy->version
                    || Fingerprint::of($draft->parameters) !== Fingerprint::of($policy->parameters)) { throw new StorageException('cas_conflict'); }
                if ($draft->replay === null || !$draft->replay->passed() || $draft->validatedDigest !== $draft->digest()) { throw new StorageException('invalid_data'); }
                if ($this->active()?->version !== $expectedActiveVersion) { throw new StorageException('cas_conflict'); }
                $this->session->run(function (Connection $db) use ($expectedActiveVersion, $policy, $json): void {
                    $changed = $db->createCommand()->update(RecommendationStorageSchema::ACTIVE_TABLE,
                        ['active_version' => $policy->version, 'lock_version' => new Expression('[[lock_version]] + 1')],
                        ['slot' => 1, 'active_version' => $expectedActiveVersion])->execute();
                    if ($changed !== 1) { throw new StorageException('cas_conflict'); }
                    // Never upsert an existing version, even when its content is identical.
                    $db->createCommand()->insert(RecommendationStorageSchema::PUBLISHED_TABLE, ['version' => $policy->version, 'payload_json' => $json, 'payload_digest' => hash('sha256', $json)])->execute();
                });
            });
        } catch (StorageException $error) { throw new StorageException($error->reason); }
        catch (\Throwable) { throw new StorageException('invalid_data'); }
    }

    private static function positiveRevision(mixed $value): int
    {
        if ((!is_int($value) && !is_string($value)) || !preg_match('/^[1-9][0-9]*$/D', (string)$value)
            || filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 2147483647]]) === false) { throw new StorageException('corrupt_storage'); }
        return (int)$value;
    }
}
