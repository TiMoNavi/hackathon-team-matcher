<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\persistence;
use humhub\modules\matcherRecommendation\contracts\ports\DiscoveryBatchStore;
use humhub\modules\matcherRecommendation\domain\DiscoveryBatch;
use yii\db\{Connection, Query};

/** Internal opaque-ID storage. get() grants no visibility and does not renew batch expiry. */
final class SqlDiscoveryBatchStore implements DiscoveryBatchStore
{
    private readonly SqlStorageSession $session;
    private readonly TypedJsonCodec $codec;
    public function __construct(Connection $db) { $this->session = new SqlStorageSession($db); $this->codec = new TypedJsonCodec(); }
    public function put(#[\SensitiveParameter] DiscoveryBatch $batch): string
    {
        try {
            // Legacy null fingerprints remain decodable for inspection; never create a new unbound batch.
            if (($batch->policyFingerprint ?? null) === null) { throw new StorageException('invalid_data'); }
            $json = $this->codec->encodeBatch($batch); $id = bin2hex(random_bytes(32));
            $this->session->run(fn(Connection $db): int => $db->createCommand()->insert(RecommendationStorageSchema::BATCH_TABLE,
                ['id' => $id, 'payload_json' => $json, 'payload_digest' => hash('sha256', $json), 'expires_at' => self::expiry($batch)])->execute());
            return $id;
        } catch (StorageException $error) { throw new StorageException($error->reason); }
        catch (\Throwable) { throw new StorageException('dependency_unavailable'); }
    }
    public function get(string $batchId): ?DiscoveryBatch
    {
        try {
            if (!preg_match('/^[a-f0-9]{64}$/D', $batchId)) { throw new StorageException('invalid_data'); }
            return $this->session->run(function (Connection $db) use ($batchId): ?DiscoveryBatch {
                $row = (new Query())->select(['id', 'payload_json', 'payload_digest', 'expires_at'])->from(RecommendationStorageSchema::BATCH_TABLE)->where(['id' => $batchId])->noCache()->one($db);
                if ($row === false) { return null; }
                $batch = $this->codec->decodeBatch(TypedJsonCodec::verifiedPayload($row));
                if ($row['id'] !== $batchId || $row['expires_at'] !== self::expiry($batch)) { throw new StorageException('corrupt_storage'); }
                return $batch;
            });
        } catch (StorageException $error) { throw new StorageException($error->reason); }
        catch (\Throwable) { throw new StorageException('dependency_unavailable'); }
    }
    private static function expiry(DiscoveryBatch $batch): string { return $batch->expiresAt->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s.u'); }
}
