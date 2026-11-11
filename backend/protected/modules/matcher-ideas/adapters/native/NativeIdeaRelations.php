<?php
declare(strict_types=1);
namespace humhub\modules\matcherIdeas\adapters\native;
use humhub\modules\matcherIdeas\domain\ports\NativeRelations;
use humhub\modules\space\models\{Space, Membership};
use humhub\modules\user\models\User;
use yii\db\{Connection, Query};

/** Native factual adapter; no AR caches, Messenger entries, or inferred group identities. */
final class NativeIdeaRelations implements NativeRelations
{
    public function __construct(private Connection $db) {}
    public function isActive(int $userId): bool
    { return $userId > 0 && $this->rows((new Query())->select('id')->from('{{%user}}')->where(['id' => $userId, 'status' => User::STATUS_ENABLED])) !== []; }
    public function isSpaceMember(int $userId, int $spaceId): bool
    {
        if (!$this->isActive($userId)) { return false; }
        $rows = $this->rows((new Query())->select(['s.contentcontainer_id'])->from(['m' => '{{%space_membership}}'])
            ->innerJoin(['s' => '{{%space}}'], '[[s.id]] = [[m.space_id]]')
            ->where(['m.user_id' => $userId, 'm.space_id' => $spaceId, 'm.status' => Membership::STATUS_MEMBER, 's.status' => Space::STATUS_ENABLED]));
        return $rows !== [] && $this->rows((new Query())->select('contentcontainer_id')->from('{{%contentcontainer_blocked_users}}')
            ->where(['contentcontainer_id' => (int)$rows[0]['contentcontainer_id'], 'user_id' => $userId])) === [];
    }
    public function isBlocked(int $firstId, int $secondId): bool
    {
        if ($firstId === $secondId) { return false; }
        $users = array_column($this->rows((new Query())->select(['id', 'contentcontainer_id'])->from('{{%user}}')->where(['id' => [$firstId, $secondId]])), null, 'id');
        if (count($users) !== 2) { return true; }
        return $this->rows((new Query())->select('contentcontainer_id')->from('{{%contentcontainer_blocked_users}}')->where(['or',
            ['contentcontainer_id' => $users[$firstId]['contentcontainer_id'], 'user_id' => $secondId],
            ['contentcontainer_id' => $users[$secondId]['contentcontainer_id'], 'user_id' => $firstId],
        ])) !== [];
    }
    public function conversation(int $messageId): ?array
    {
        $rows = $this->rows((new Query())->select(['id', 'created_by'])->from('{{%message}}')->where(['id' => $messageId]));
        if ($rows === []) { return null; }
        $members = $this->rows((new Query())->select('user_id')->from('{{%user_message}}')->where(['message_id' => $messageId])->orderBy(['user_id' => SORT_ASC])->limit(2001));
        // Very large native conversations are not eligible for this bounded S7.2 adapter.
        if (count($members) > 2000) { return null; }
        return ['id' => (int)$rows[0]['id'], 'creator_id' => (int)$rows[0]['created_by'], 'participant_ids' => array_values(array_unique(array_map('intval', array_column($members, 'user_id'))))];
    }
    private function rows(Query $query): array
    {
        $query = clone $query; $query->noCache();
        $command = $query->createCommand($this->db);
        if ($this->db->driverName === 'mysql' && $this->db->getTransaction()?->isActive) {
            $params = $command->params; $command->setSql($command->getSql() . ' FOR SHARE')->bindValues($params);
        }
        return $command->queryAll();
    }
}
