<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;

use humhub\modules\matcherPrivacy\domain\DiscoveryFieldPolicy;
use humhub\modules\matcherPrivacy\domain\ports\DiscoveryRelations;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\user\models\User;
use humhub\modules\space\models\{Space, Membership};
use yii\db\{Connection, Query};

/** Native facts only. No profile values, application configuration or administrator bypass. */
final class NativeDiscoveryRelations implements DiscoveryRelations
{
    public function __construct(private readonly Connection $db) {}

    public function eligibleOwnerIds(int $viewerId, int $spaceId, array $ownerIds): array
    {
        DiscoveryFieldPolicy::assertIds($viewerId, $spaceId, $ownerIds);
        $viewer = $this->rows($this->viewerQuery($viewerId, $spaceId)->select(['v.id'])->limit(2));
        if ($viewer === []) { throw new ProfileException('PROFILE_ACCESS_DENIED', 'Current activity membership is required.', 403); }
        if (count($viewer) !== 1) { $this->unavailable(); }
        if ($ownerIds === []) { return []; }
        $query = $this->viewerQuery($viewerId, $spaceId)->select(['u.id'])->distinct()
            ->innerJoin(['u' => '{{%user}}'], '[[u.id]] != [[v.id]]')
            ->innerJoin(['m' => '{{%space_membership}}'], '[[m.user_id]] = [[u.id]] AND [[m.space_id]] = [[s.id]]')
            ->leftJoin(['bo' => '{{%contentcontainer_blocked_users}}'], '[[bo.contentcontainer_id]] = [[v.contentcontainer_id]] AND [[bo.user_id]] = [[u.id]]')
            ->leftJoin(['bi' => '{{%contentcontainer_blocked_users}}'], '[[bi.contentcontainer_id]] = [[u.contentcontainer_id]] AND [[bi.user_id]] = [[v.id]]')
            ->leftJoin(['bs' => '{{%contentcontainer_blocked_users}}'], '[[bs.contentcontainer_id]] = [[s.contentcontainer_id]] AND [[bs.user_id]] = [[u.id]]')
            ->andWhere(['u.id' => $ownerIds, 'u.status' => User::STATUS_ENABLED, 'm.status' => Membership::STATUS_MEMBER,
                'u.visibility' => [User::VISIBILITY_REGISTERED_ONLY, User::VISIBILITY_ALL],
                'bo.user_id' => null, 'bi.user_id' => null, 'bs.user_id' => null])
            ->andWhere(['>', 'u.contentcontainer_id', 0]);
        $allowed = array_fill_keys(array_map('intval', array_column($this->rows($query), 'id')), true);
        return array_values(array_filter($ownerIds, static fn(int $id): bool => isset($allowed[$id])));
    }

    private function viewerQuery(int $viewerId, int $spaceId): Query
    {
        return (new Query())->from(['v' => '{{%user}}'])
            ->innerJoin(['vm' => '{{%space_membership}}'], '[[vm.user_id]] = [[v.id]] AND [[vm.space_id]] = :privacySpace', [':privacySpace' => $spaceId])
            ->innerJoin(['s' => '{{%space}}'], '[[s.id]] = [[vm.space_id]]')
            ->leftJoin(['vb' => '{{%contentcontainer_blocked_users}}'], '[[vb.contentcontainer_id]] = [[s.contentcontainer_id]] AND [[vb.user_id]] = [[v.id]]')
            ->where(['v.id' => $viewerId, 'v.status' => User::STATUS_ENABLED, 's.status' => Space::STATUS_ENABLED,
                'vm.status' => Membership::STATUS_MEMBER, 'vb.user_id' => null])
            ->andWhere(['>', 'v.contentcontainer_id', 0])->andWhere(['>', 's.contentcontainer_id', 0]);
    }

    private function rows(Query $query): array
    {
        if ($this->db->getTransaction()?->isActive) {
            throw new ProfileException('DISCOVERY_TRANSACTION_UNSUPPORTED', 'Discovery needs an independent current-read boundary.', 503);
        }
        $logging = $this->db->enableLogging; $profiling = $this->db->enableProfiling;
        $this->db->enableLogging = false; $this->db->enableProfiling = false;
        try {
            $query->noCache();
            return $this->db->useMaster(fn(Connection $db): array => $db->noCache(fn(Connection $db): array => $query->all($db)));
        } catch (\Throwable) {
            $this->unavailable();
        } finally {
            $this->db->enableLogging = $logging; $this->db->enableProfiling = $profiling;
        }
    }

    private function unavailable(): never
    {
        throw new ProfileException('PROFILE_DEPENDENCY_UNAVAILABLE', 'Discovery authorization is unavailable.', 503);
    }
}
