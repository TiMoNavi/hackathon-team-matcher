<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\media;

use humhub\modules\matcherProfile\application\IdentityService;
use humhub\modules\matcherProfile\application\interfaces\IdentityStore;
use humhub\modules\matcherProfile\adapters\identity\NativeConfirmedIdentityReader;
use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ports\ProfileRepository;
use humhub\modules\user\models\User;
use yii\db\Connection;
use yii\db\JsonExpression;
use yii\db\Query;

final class SqlIdentityStore implements IdentityStore
{
    public function __construct(private Connection $db, private ProfileRepository $profiles) {}
    public function transaction(callable $callback): mixed { return $this->profiles->transaction($callback); }
    public function state(int $ownerId, bool $lock = false): ?array { return $this->profiles->findState($ownerId, ProfileScope::global(), $lock); }
    public function ensureState(int $ownerId, string $now): array { return $this->profiles->ensureState($ownerId, ProfileScope::global(), $now); }
    public function saveState(array $state): void { $this->profiles->saveState($state); }
    public function nickname(int $ownerId): ?string { return (new NativeConfirmedIdentityReader($this->db))->read($ownerId, true)['nickname']; }

    public function saveNickname(array $state, string $nickname, string $now): void
    {
        $native = $this->db->createCommand('SELECT [[user_id]] FROM {{%profile}} WHERE [[user_id]] = :id FOR SHARE', [':id' => $state['user_id']])->queryScalar();
        if ($native === false) { throw new \humhub\modules\matcherProfile\domain\ProfileException('NATIVE_PROFILE_MISSING', 'The native profile must exist before confirming identity.', 409); }
        $this->db->createCommand()->update('{{%profile}}', ['matcher_nickname' => $nickname], ['user_id' => $state['user_id']])->execute();
        $existing = (new Query())->from('{{%matcher_profile_attribute}}')->where(['state_id' => $state['id'], 'native_binding' => 'nickname'])->one($this->db);
        $row = ['attribute_id' => $existing['attribute_id'] ?? IdentityService::uuid(), 'state_id' => $state['id'], 'scope_key' => 'global', 'field_key' => 'nickname', 'storage_kind' => 'native', 'native_binding' => 'nickname', 'value_json' => null, 'sort_order' => 0, 'visibility' => 'authenticated', 'confirmation' => 'confirmed', 'last_confirmed_at' => $now, 'schema_version' => FieldCatalog::VERSION];
        $this->db->createCommand()->upsert('{{%matcher_profile_attribute}}', $row)->execute();
    }

    public function media(string $ref): ?array
    {
        if (!preg_match('/^mpr_([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/D', $ref, $match)) { return null; }
        $row = (new Query())->select(['d.fields_json', 'owner_id' => 's.user_id'])->from(['d' => '{{%matcher_profile_draft}}'])->innerJoin(['s' => '{{%matcher_profile_state}}'], '[[s.id]] = [[d.state_id]]')->where(['d.id' => $match[1], 'd.draft_kind' => 'identity', 'd.origin' => ['avatar_upload', 'contact_qr_upload'], 's.scope_key' => 'global'])->one($this->db);
        if (!$row) { return null; }
        $data = is_array($row['fields_json']) ? $row['fields_json'] : json_decode($row['fields_json'], true, 32, JSON_THROW_ON_ERROR);
        $data = $data[0] ?? [];
        if (($data['file_ref'] ?? null) !== $ref || (int)($data['owner_id'] ?? 0) !== (int)$row['owner_id']) { return null; }
        return $data;
    }

    public function saveMedia(array $state, string $id, array $metadata, string $now): void
    {
        $this->db->createCommand()->insert('{{%matcher_profile_draft}}', ['id' => $id, 'state_id' => $state['id'], 'draft_kind' => 'identity', 'base_revision' => $state['revision'], 'base_identity_version' => $state['identity_version'], 'draft_version' => 0, 'fields_json' => new JsonExpression([$metadata]), 'origin' => $metadata['kind'] . '_upload', 'initiator_id' => $state['user_id'], 'status' => 'editing', 'created_at' => $now, 'updated_at' => $now])->execute();
    }

    public function recordChange(array $state, array $change, int $baseVersion, string $now): void
    {
        $this->db->createCommand()->insert('{{%matcher_profile_draft}}', ['id' => IdentityService::uuid(), 'state_id' => $state['id'], 'draft_kind' => 'identity', 'base_revision' => $state['revision'], 'base_identity_version' => $baseVersion, 'draft_version' => 1, 'fields_json' => new JsonExpression([$change]), 'origin' => 'identity_change', 'initiator_id' => $state['user_id'], 'status' => 'confirmed', 'created_at' => $now, 'updated_at' => $now])->execute();
    }

    public function isConfirmedQr(int $ownerId, string $ref): bool
    {
        $rows = (new Query())->select('a.value_json')->from(['a' => '{{%matcher_profile_attribute}}'])->innerJoin(['s' => '{{%matcher_profile_state}}'], '[[s.id]] = [[a.state_id]]')->where(['s.user_id' => $ownerId, 's.scope_key' => 'global', 'a.field_key' => 'contact_wechat_qr', 'a.confirmation' => 'confirmed', 'a.visibility' => 'authenticated'])->all($this->db);
        foreach ($rows as $row) {
            $value = is_array($row['value_json']) ? $row['value_json'] : json_decode($row['value_json'], true, 16, JSON_THROW_ON_ERROR);
            if (($value['file_ref'] ?? null) === $ref) { return true; }
        }
        return false;
    }

    public function refresh(int $ownerId): void
    {
        // The transaction is authoritative; derived indexes can be rebuilt independently.
        try { if (\Yii::$app->has('runtimeCache')) { \Yii::$app->runtimeCache->flush(); } } catch (\Throwable) { \Yii::warning('Profile identity cache refresh deferred.', 'matcher-profile'); }
    }
}
