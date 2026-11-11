<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\persistence;

use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ports\ProfileRepository;
use humhub\modules\user\models\User;
use humhub\modules\user\models\fieldtype\BaseTypeVirtual;
use Yii;
use yii\db\Connection;
use yii\db\JsonExpression;
use yii\db\Query;
use yii\db\Transaction;

/** MySQL transactional adapter. Public reads belong to application access projections. */
final class SqlProfileRepository implements ProfileRepository
{
    private NativeProfileValues $native;
    private $postCommit;
    private bool $flushing = false;
    public function __construct(private Connection $db, ?callable $postCommit = null)
    {
        $this->native = new NativeProfileValues($db);
        $this->postCommit = $postCommit ?? static function (int $ownerId): void {
            if (Yii::$app->has('runtimeCache')) { Yii::$app->runtimeCache->flush(); }
            $user = User::findOne($ownerId);
            if ($user !== null) {
                BaseTypeVirtual::flushCache($user);
                // Native user search executes SQL against user/profile; no copied search document is maintained.
                if (Yii::$app->has('user') && (int)Yii::$app->user->id === $ownerId) { Yii::$app->user->setIdentity($user); }
            }
        };
        $db->on(Connection::EVENT_COMMIT_TRANSACTION, function (): void { $this->retryPendingProjections(); });
    }
    public function transaction(callable $callback): mixed
    {
        $tx = $this->db->beginTransaction($this->db->getTransaction()?->isActive ? null : Transaction::READ_COMMITTED);
        try { $result = $callback(); $tx->commit(); return $result; }
        catch (\Throwable $error) { if ($tx->isActive) { $tx->rollBack(); } throw $error; }
    }
    public function findState(int $ownerId, ProfileScope $scope, bool $forUpdate = false): ?array
    {
        return $this->one('state', ['user_id' => $ownerId, 'scope_key' => $scope->key()], $forUpdate);
    }
    public function ensureState(int $ownerId, ProfileScope $scope, string $now): array
    {
        $this->requireTransaction();
        $this->db->createCommand()->upsert($this->table('state'), [
            'id' => self::uuid(), 'user_id' => $ownerId, 'scope_key' => $scope->key(), 'space_id' => $scope->spaceId,
            'revision' => 0, 'permission_version' => 0, 'identity_version' => 0, 'created_at' => $now, 'updated_at' => $now,
        ], false)->execute();
        return $this->findState($ownerId, $scope, true) ?? throw new \RuntimeException('Profile state was not created.');
    }
    public function saveState(array $state): void
    {
        $this->requireTransaction();
        $values = array_intersect_key($state, array_flip(['revision', 'permission_version', 'current_revision_id', 'identity_version', 'confirmed_avatar_ref', 'updated_at']));
        $values['projection_pending'] = 1;
        $this->db->createCommand()->update($this->table('state'), $values, ['id' => $state['id']])->execute();
    }
    public function currentAttributes(string $stateId): array
    {
        $currentRead = (bool)$this->db->getTransaction()?->isActive;
        $state = $this->one('state', ['id' => $stateId], $currentRead);
        if ($state === null) { return []; }
        $native = $state['scope_key'] === 'global' ? $this->native->all((int)$state['user_id'], $currentRead) : [];
        $command = (new Query())->from($this->table('attribute'))->where(['state_id' => $stateId])->andWhere(['not', ['field_key' => array_keys(FieldCatalog::identities())]])->orderBy(['sort_order' => SORT_ASC, 'attribute_id' => SORT_ASC])->createCommand($this->db);
        if ($currentRead) { $params = $command->params; $command->setSql($command->getSql() . ' FOR SHARE')->bindValues($params); }
        $rows = $command->queryAll();
        $result = [];
        foreach ($rows as $row) {
            $value = $row['storage_kind'] === 'native' ? ($native[$row['native_binding']] ?? null) : $this->decode($row['value_json']);
            if ($row['native_binding'] === 'primary_portfolio_link') { $value = ['url' => $value, 'label' => $row['display_label'] ?? '个人主页']; }
            $result[] = [
                'attribute_id' => $row['attribute_id'], 'key' => $row['field_key'], 'value' => $value,
                'visibility' => $row['visibility'], 'confirmation' => $row['confirmation'], 'last_confirmed_at' => $row['last_confirmed_at'],
                'display_label' => $row['display_label'], 'record_group_id' => $row['record_group_id'], 'sort_order' => (int)$row['sort_order'], 'schema_version' => (int)$row['schema_version'],
            ];
        }
        return $result;
    }
    public function replaceAttributes(array $state, array $attributes): void
    {
        $this->requireTransaction();
        $old = (new Query())->from($this->table('attribute'))->where(['state_id' => $state['id']])->andWhere(['not', ['field_key' => array_keys(FieldCatalog::identities())]])->all($this->db);
        $oldById = array_column($old, null, 'attribute_id');
        $oldNative = array_values(array_filter(array_column($old, 'native_binding')));
        $newNative = [];
        $primaryId = null;
        foreach ($attributes as $attribute) {
            if (($oldById[$attribute['attribute_id']]['native_binding'] ?? null) === 'primary_portfolio_link' && !isset($attribute['value']['project_ref']) && mb_strlen($attribute['value']['url'] ?? '', 'UTF-8') <= 255) { $primaryId = $attribute['attribute_id']; }
        }
        if ($primaryId === null && $state['scope_key'] === 'global') {
            foreach ($attributes as $attribute) {
                if ($attribute['key'] === 'portfolio_link' && !isset($attribute['value']['project_ref']) && mb_strlen($attribute['value']['url'] ?? '', 'UTF-8') <= 255) { $primaryId = $attribute['attribute_id']; break; }
            }
        }
        // Remove only ordinary metadata. Identity markers have an independent version lifecycle.
        $this->db->createCommand()->delete($this->table('attribute'), ['and', ['state_id' => $state['id']], ['not', ['field_key' => array_keys(FieldCatalog::identities())]]])->execute();
        foreach ($attributes as $attribute) {
            $definition = FieldCatalog::definitions()[$attribute['key']];
            $binding = $definition['native_binding'];
            if ($attribute['attribute_id'] === $primaryId) { $binding = 'primary_portfolio_link'; }
            $label = $attribute['display_label'] ?? null;
            if ($binding === 'primary_portfolio_link') { $label = $attribute['value']['label']; }
            if ($binding !== null) {
                if ($state['scope_key'] !== 'global') { throw new \LogicException('Native values belong to global scope.'); }
                $newNative[] = $binding;
                $this->native->write((int)$state['user_id'], $binding, $binding === 'primary_portfolio_link' ? $attribute['value']['url'] : $attribute['value']);
            }
            $this->db->createCommand()->insert($this->table('attribute'), [
                'attribute_id' => $attribute['attribute_id'], 'state_id' => $state['id'], 'scope_key' => $state['scope_key'], 'field_key' => $attribute['key'],
                'storage_kind' => $binding === null ? 'inline' : 'native', 'native_binding' => $binding,
                'value_json' => $binding === null ? new JsonExpression($attribute['value']) : null,
                'display_label' => $label, 'record_group_id' => $attribute['record_group_id'] ?? null, 'sort_order' => $attribute['sort_order'] ?? 0,
                'visibility' => $attribute['visibility'], 'confirmation' => $attribute['confirmation'], 'last_confirmed_at' => $attribute['last_confirmed_at'], 'schema_version' => $attribute['schema_version'],
            ])->execute();
        }
        foreach (array_diff($oldNative, $newNative) as $binding) { $this->native->write((int)$state['user_id'], $binding, null); }
    }
    public function nativeCandidates(int $ownerId): array
    {
        $values = $this->native->all($ownerId);
        unset($values['nickname']);
        if (!empty($values['primary_portfolio_link'])) { $values['portfolio_link'] = ['url' => $values['primary_portfolio_link'], 'label' => '个人主页']; }
        unset($values['primary_portfolio_link']);
        return $values;
    }
    public function findRevision(string $stateId, int $revision): ?array
    {
        $row = $this->one('revision', ['state_id' => $stateId, 'revision' => $revision]);
        if ($row === null) { return null; }
        $row['snapshot'] = $this->decode($row['snapshot_json']); unset($row['snapshot_json']); return $row;
    }
    public function insertRevision(array $revision): void
    {
        $this->requireTransaction();
        $revision['snapshot_json'] = new JsonExpression($revision['snapshot']); unset($revision['snapshot']);
        $this->db->createCommand()->insert($this->table('revision'), $revision)->execute();
    }
    public function findDraft(string $draftId, bool $forUpdate = false): ?array
    {
        return $this->draft($this->one('draft', ['id' => $draftId], $forUpdate));
    }
    public function findEditingDraft(string $stateId, string $origin = 'manual'): ?array
    {
        $row = (new Query())->from($this->table('draft'))->where(['state_id' => $stateId, 'draft_kind' => 'profile', 'status' => 'editing', 'origin' => $origin])->orderBy(['updated_at' => SORT_DESC, 'id' => SORT_DESC])->one($this->db);
        return $this->draft($row ?: null);
    }
    public function saveDraft(array $draft): void
    {
        $this->requireTransaction();
        $allowed = ['id', 'state_id', 'draft_kind', 'base_revision', 'base_identity_version', 'draft_version', 'origin', 'initiator_id', 'status', 'confirmation_hash', 'confirmed_revision', 'created_at', 'updated_at'];
        $values = array_intersect_key($draft, array_flip($allowed));
        $values['fields_json'] = new JsonExpression($draft['fields']);
        $updates = $values; unset($updates['id'], $updates['state_id'], $updates['draft_kind'], $updates['initiator_id'], $updates['created_at'], $updates['origin']);
        $this->db->createCommand()->upsert($this->table('draft'), $values, $updates)->execute();
    }
    /** Recovery is safe to call after a later request; failed projections never undo a committed profile. */
    public function retryPendingProjections(int $limit = 100): array
    {
        if ($this->flushing || $this->db->getTransaction()?->isActive) { return []; }
        $this->flushing = true;
        $completed = [];
        try {
            $states = (new Query())->select(['id', 'user_id', 'revision', 'identity_version'])->from($this->table('state'))->where(['projection_pending' => 1])->limit($limit)->all($this->db);
            foreach ($states as $state) {
                try {
                    ($this->postCommit)((int)$state['user_id']);
                    $this->db->createCommand()->update($this->table('state'), ['projection_pending' => 0], ['id' => $state['id'], 'revision' => $state['revision'], 'identity_version' => $state['identity_version']])->execute();
                    $completed[] = $state['id'];
                } catch (\Throwable $error) { Yii::warning(['event' => 'matcher_profile_projection_pending', 'error_type' => get_class($error)], 'matcher-profile'); }
            }
        } catch (\Throwable $error) { Yii::warning(['event' => 'matcher_profile_projection_retry_unavailable', 'error_type' => get_class($error)], 'matcher-profile'); }
        finally { $this->flushing = false; }
        return $completed;
    }
    private function one(string $part, array $condition, bool $lock = false): ?array
    {
        if ($lock) { $this->requireTransaction(); }
        $command = (new Query())->from($this->table($part))->where($condition)->createCommand($this->db);
        if ($lock) { $params = $command->params; $command->setSql($command->getSql() . ' FOR UPDATE')->bindValues($params); }
        return $command->queryOne() ?: null;
    }
    private function draft(?array $row): ?array
    {
        if ($row === null) { return null; }
        $row['fields'] = $this->decode($row['fields_json']); unset($row['fields_json']);
        foreach (['base_revision', 'base_identity_version', 'draft_version', 'initiator_id'] as $key) { $row[$key] = (int)$row[$key]; }
        if ($row['confirmed_revision'] !== null) { $row['confirmed_revision'] = (int)$row['confirmed_revision']; }
        return $row;
    }
    private function decode(mixed $json): mixed { return is_string($json) ? json_decode($json, true, 512, JSON_THROW_ON_ERROR) : $json; }
    private function table(string $part): string { return $this->db->tablePrefix . 'matcher_profile_' . $part; }
    private function requireTransaction(): void { if (!$this->db->getTransaction()?->isActive) { throw new \LogicException('Profile writes and locks require an active transaction.'); } }
    private static function uuid(): string { $h = bin2hex(random_bytes(16)); return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-4' . substr($h, 13, 3) . '-a' . substr($h, 17, 3) . '-' . substr($h, 20); }
}
