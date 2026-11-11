<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\identity;
use humhub\modules\matcherProfile\domain\{FieldCatalog, ProfileException};
use humhub\modules\matcherProfile\domain\ports\ConfirmedIdentityBatchSource;
use yii\db\{Connection, Expression, Query};

/** Two bounded batch SELECTs detect identity changes; no per-owner SQL or media access. */
final class SqlConfirmedIdentityBatchSource implements ConfirmedIdentityBatchSource
{
    public function __construct(private readonly Connection $db) {}
    public function read(array $ownerIds): array
    {
        if ($this->db->getTransaction()?->isActive) { throw new ProfileException('PROFILE_BATCH_UNAVAILABLE', 'Identity batches require a current authoritative connection.', 503); }
        $logging = $this->db->enableLogging; $profiling = $this->db->enableProfiling; $this->db->enableLogging = false; $this->db->enableProfiling = false;
        try {
            return $this->db->useMaster(fn(Connection $db): array => $db->noCache(function () use ($ownerIds): array {
                $before = $this->rows($ownerIds); $after = $this->rows($ownerIds);
                if ($before !== $after) { throw new ProfileException('PROFILE_BATCH_CHANGED', 'Confirmed identities changed during the batch read.', 409); }
                $result = [];
                foreach ($before as $row) {
                    $id = (int)$row['owner_id']; if (isset($result[$id])) { throw new ProfileException('PROFILE_BATCH_UNAVAILABLE', 'Duplicate confirmed identity.', 503); }
                    $result[$id] = ['display_name' => $row['display_name'], 'identity_version' => (int)$row['identity_version'], 'avatar_ref' => $row['avatar_ref'], 'confirmed_at' => $row['confirmed_at']];
                }
                return $result;
            }));
        } catch (ProfileException $error) { throw $error; }
        catch (\Throwable) { throw new ProfileException('PROFILE_BATCH_UNAVAILABLE', 'Confirmed identity batch is unavailable.', 503); }
        finally { $this->db->enableLogging = $logging; $this->db->enableProfiling = $profiling; }
    }
    private function rows(array $ids): array
    {
        $states = (new Query())->select(['id'])->from('{{%matcher_profile_state}}')->where(['user_id' => $ids, 'scope_key' => 'global']);
        $changes = (new Query())->select(['state_id', 'confirmed_at' => new Expression('MAX([[created_at]])')])->from('{{%matcher_profile_draft}}')
            ->where(['state_id' => $states, 'draft_kind' => 'identity', 'origin' => 'identity_change', 'status' => 'confirmed'])->groupBy(['state_id']);
        return (new Query())->select(['owner_id' => 's.user_id', 'display_name' => 'p.matcher_nickname', 'identity_version' => 's.identity_version',
            'avatar_ref' => 's.confirmed_avatar_ref', 'confirmed_at' => new Expression('CASE WHEN [[d.confirmed_at]] > [[a.last_confirmed_at]] THEN [[d.confirmed_at]] ELSE [[a.last_confirmed_at]] END')])
            ->from(['s' => '{{%matcher_profile_state}}'])->innerJoin(['p' => '{{%profile}}'], '[[p.user_id]] = [[s.user_id]]')
            ->innerJoin(['a' => '{{%matcher_profile_attribute}}'], '[[a.state_id]] = [[s.id]] AND [[a.scope_key]] = [[s.scope_key]]')
            ->leftJoin(['d' => $changes], '[[d.state_id]] = [[s.id]]')
            ->where(['s.user_id' => $ids, 's.scope_key' => 'global', 'a.field_key' => 'nickname', 'a.native_binding' => 'nickname',
                'a.storage_kind' => 'native', 'a.confirmation' => 'confirmed', 'a.visibility' => 'authenticated', 'a.schema_version' => FieldCatalog::VERSION])
            ->andWhere(['>', 's.identity_version', 0])->andWhere(['not', ['a.last_confirmed_at' => null]])
            ->orderBy(['s.user_id' => SORT_ASC])->noCache()->all($this->db);
    }
}
