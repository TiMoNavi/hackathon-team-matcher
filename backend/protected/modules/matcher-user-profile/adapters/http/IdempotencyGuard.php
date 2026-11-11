<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\http;

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ports\ProfileRepository;
use yii\db\Connection;
use yii\db\JsonExpression;
use yii\db\Query;

/** Transactional request receipts use existing drafts, with actor+route+key identity. */
final class IdempotencyGuard
{
    public function __construct(private Connection $db, private ProfileRepository $profiles) {}
    public function run(int $actorId, string $route, ?string $key, array $payload, callable $authorize, callable $perform, ?callable $validateReplay = null, ?callable $rollbackCleanup = null): array
    {
        if ($key === null || !preg_match('/^[A-Za-z0-9._:-]{8,128}$/D', $key)) { throw new ProfileException('IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key of 8–128 safe ASCII characters.', 400); }
        $hash = hash('sha256', $actorId . "\0" . $route . "\0" . $key);
        $id = substr($hash, 0, 8) . '-' . substr($hash, 8, 4) . '-4' . substr($hash, 13, 3) . '-a' . substr($hash, 17, 3) . '-' . substr($hash, 20, 12);
        $requestHash = hash('sha256', json_encode(self::canonical($payload), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        $performedResult = null;
        try { return $this->profiles->transaction(function () use ($actorId, $route, $id, $requestHash, $authorize, $perform, $validateReplay, &$performedResult) {
            $authorize();
            $now = gmdate('Y-m-d H:i:s.u');
            // Global state row serializes initial receipts and removes first-insert races.
            $state = $this->profiles->ensureState($actorId, ProfileScope::global(), $now);
            $authorize();
            $row = (new Query())->from('{{%matcher_profile_draft}}')->where(['id' => $id, 'state_id' => $state['id'], 'draft_kind' => 'identity', 'origin' => 'http_request'])->one($this->db);
            if ($row) {
                $saved = is_array($row['fields_json']) ? $row['fields_json'] : json_decode($row['fields_json'], true, 64, JSON_THROW_ON_ERROR);
                $receipt = $saved[0];
                if ($receipt['route'] !== $route || !hash_equals($receipt['request_hash'], $requestHash)) { throw new ProfileException('IDEMPOTENCY_CONFLICT', 'This key was already used for a different request.', 409); }
                if ($validateReplay !== null) { $validateReplay($receipt['response']); }
                return $receipt['response'];
            }
            $result = $perform();
            $performedResult = $result;
            $this->db->createCommand()->insert('{{%matcher_profile_draft}}', ['id' => $id, 'state_id' => $state['id'], 'draft_kind' => 'identity', 'base_revision' => $state['revision'], 'base_identity_version' => $state['identity_version'], 'draft_version' => 1, 'fields_json' => new JsonExpression([['route' => $route, 'request_hash' => $requestHash, 'response' => $result]]), 'origin' => 'http_request', 'initiator_id' => $actorId, 'status' => 'confirmed', 'created_at' => $now, 'updated_at' => $now])->execute();
            return $result;
        }); } catch (\Throwable $error) {
            if ($performedResult !== null && $rollbackCleanup !== null) { $rollbackCleanup($performedResult); }
            throw $error;
        }
    }
    private static function canonical(array $value): array
    {
        if (!array_is_list($value)) { ksort($value); }
        foreach ($value as &$item) { if (is_array($item)) { $item = self::canonical($item); } }
        return $value;
    }
}
