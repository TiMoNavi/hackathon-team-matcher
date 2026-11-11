<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\native;
use humhub\modules\matcherRecommendation\contracts\{CandidateRequest, CurrentEventContext};
use humhub\modules\content\models\ContentContainerBlockedUsers;
use humhub\modules\space\models\{Membership, Space};
use humhub\modules\user\models\User;
use yii\db\{Connection, Query};

/** Read-only native identity/Space eligibility, reusable by bounded recall. No profile or P1 table access. */
final class NativeEligibilityQuery
{
    public function __construct(private readonly Connection $db) {}

    /**
     * Build SQL without executing it. Caller must verify CurrentEventAccess before and after run().
     * Alias u is the candidate, m its membership, s the current Space, v/vm the viewer and membership.
     * No candidate IDs means a query builder for bounded retrieval; an explicit empty list means no rows.
     * excludeBlocked=false is reserved for reading actual current relationship flags.
     */
    public function candidateQuery(CurrentEventContext $context, ?array $candidateIds = null, bool $excludeBlocked = true): Query
    {
        if ($candidateIds !== null) { self::assertPersonIds($candidateIds); }
        $query = (new Query())->select([
            'id' => 'u.id', 'contentcontainer_id' => 'u.contentcontainer_id',
            'user_status' => 'u.status', 'user_visibility' => 'u.visibility', 'user_updated_at' => 'u.updated_at',
            'membership_id' => 'm.id', 'membership_status' => 'm.status', 'membership_group' => 'm.group_id',
            'membership_created_at' => 'm.created_at', 'membership_updated_at' => 'm.updated_at',
            'blocked_out' => 'bo.user_id', 'blocked_in' => 'bi.user_id', 'blocked_space' => 'bs.user_id',
        ])->from(['u' => User::tableName()])
            ->innerJoin(['m' => Membership::tableName()], '[[m.user_id]] = [[u.id]] AND [[m.space_id]] = :nativeSpaceId', [':nativeSpaceId' => $context->spaceId])
            ->innerJoin(['s' => Space::tableName()], '[[s.id]] = [[m.space_id]]')
            ->innerJoin(['v' => User::tableName()], '[[v.id]] = :nativeViewerId', [':nativeViewerId' => $context->viewerId])
            ->innerJoin(['vm' => Membership::tableName()], '[[vm.user_id]] = [[v.id]] AND [[vm.space_id]] = [[s.id]]')
            ->leftJoin(['bo' => ContentContainerBlockedUsers::tableName()], '[[bo.contentcontainer_id]] = [[v.contentcontainer_id]] AND [[bo.user_id]] = [[u.id]]')
            ->leftJoin(['bi' => ContentContainerBlockedUsers::tableName()], '[[bi.contentcontainer_id]] = [[u.contentcontainer_id]] AND [[bi.user_id]] = [[v.id]]')
            ->leftJoin(['bs' => ContentContainerBlockedUsers::tableName()], '[[bs.contentcontainer_id]] = [[s.contentcontainer_id]] AND [[bs.user_id]] = [[u.id]]')
            ->leftJoin(['bv' => ContentContainerBlockedUsers::tableName()], '[[bv.contentcontainer_id]] = [[s.contentcontainer_id]] AND [[bv.user_id]] = [[v.id]]')
            ->where([
                'u.status' => User::STATUS_ENABLED, 'v.status' => User::STATUS_ENABLED, 's.status' => Space::STATUS_ENABLED,
                'm.status' => Membership::STATUS_MEMBER, 'vm.status' => Membership::STATUS_MEMBER,
                'u.visibility' => [User::VISIBILITY_REGISTERED_ONLY, User::VISIBILITY_ALL], 'bv.user_id' => null,
            ])->andWhere(['<>', 'u.id', $context->viewerId])
            ->andWhere(['>', 'u.contentcontainer_id', 0])->andWhere(['>', 'v.contentcontainer_id', 0])->andWhere(['>', 's.contentcontainer_id', 0]);
        if ($excludeBlocked) { $query->andWhere(['bo.user_id' => null, 'bi.user_id' => null, 'bs.user_id' => null]); }
        if ($candidateIds !== null) { $query->andWhere(['u.id' => $candidateIds]); }
        return $query;
    }

    /** Security-relevant current facts only. These are fingerprints, not a native monotonic permission revision. */
    public function viewerFacts(int $viewerId, int $spaceId): array
    {
        $rows = $this->run((new Query())->select([
            'viewer_id' => 'v.id', 'viewer_status' => 'v.status', 'viewer_container' => 'v.contentcontainer_id',
            'viewer_visibility' => 'v.visibility', 'viewer_updated_at' => 'v.updated_at',
            'space_id' => 's.id', 'space_status' => 's.status', 'space_container' => 's.contentcontainer_id',
            'space_visibility' => 's.visibility', 'space_join_policy' => 's.join_policy', 'space_updated_at' => 's.updated_at',
            'membership_id' => 'm.id', 'membership_status' => 'm.status', 'membership_group' => 'm.group_id',
            'membership_created_at' => 'm.created_at', 'membership_updated_at' => 'm.updated_at',
        ])->from(['v' => User::tableName()])
            ->innerJoin(['m' => Membership::tableName()], '[[m.user_id]] = [[v.id]] AND [[m.space_id]] = :nativeSpaceId', [':nativeSpaceId' => $spaceId])
            ->innerJoin(['s' => Space::tableName()], '[[s.id]] = [[m.space_id]]')
            ->leftJoin(['bs' => ContentContainerBlockedUsers::tableName()], '[[bs.contentcontainer_id]] = [[s.contentcontainer_id]] AND [[bs.user_id]] = [[v.id]]')
            ->where(['v.id' => $viewerId, 'v.status' => User::STATUS_ENABLED, 'm.status' => Membership::STATUS_MEMBER, 's.status' => Space::STATUS_ENABLED, 'bs.user_id' => null])
            ->andWhere(['>', 'v.contentcontainer_id', 0])->andWhere(['>', 's.contentcontainer_id', 0])->limit(2));
        if ($rows === []) { throw new NativeAccessException('access_denied'); }
        if (count($rows) !== 1) { throw new NativeAccessException('dependency_unavailable'); }
        return $rows[0];
    }

    /** Execute a SELECT on the authoritative connection without caching or logging bound query text. */
    public function run(Query $query): array
    {
        // Master + noCache cannot escape an existing repeatable-read snapshot.
        // Future transactional callers need an explicit current-read strategy or separate authorization connection.
        // This adapter never commits or rolls back another owner's transaction.
        if ($this->db->getTransaction()?->isActive) { throw new NativeAccessException('authorization_transaction_unsupported'); }
        $logging = $this->db->enableLogging;
        $profiling = $this->db->enableProfiling;
        $this->db->enableLogging = false;
        $this->db->enableProfiling = false;
        try {
            $query = clone $query;
            $query->noCache();
            return $this->db->useMaster(fn(Connection $db): array => $db->noCache(fn(Connection $db): array => $query->all($db)));
        } catch (\Throwable) {
            // Yii database exceptions can contain expanded SQL and complete user query terms.
            // Do not retain that exception chain for later HTTP/debug serialization.
            throw new NativeAccessException('dependency_unavailable');
        } finally {
            $this->db->enableLogging = $logging;
            $this->db->enableProfiling = $profiling;
        }
    }

    public static function assertPersonIds(array $ids): void
    {
        if (!array_is_list($ids) || count($ids) > CandidateRequest::MAX_CANDIDATES) {
            throw new NativeAccessException('invalid_request');
        }
        foreach ($ids as $id) {
            if (!is_string($id) || !preg_match('/^[1-9][0-9]*$/D', $id)
                || filter_var($id, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) === false) {
                throw new NativeAccessException('invalid_request');
            }
        }
        if (count(array_unique($ids, SORT_STRING)) !== count($ids)) { throw new NativeAccessException('invalid_request'); }
    }
}
