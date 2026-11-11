<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;

use humhub\modules\matcherPrivacy\domain\ports\ProfileRelations;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\user\models\User;
use humhub\modules\space\models\Space;
use humhub\modules\space\models\Membership;
use humhub\modules\post\models\Post;
use humhub\modules\content\models\Content;
use Yii;
use yii\db\Connection;
use yii\db\Query;

/** Live relationship adapter. No viewer-dependent result is cached or attached to User. */
final class NativeProfileRelations implements ProfileRelations
{
    public function __construct(private Connection $db) {}

    public function assertActive(int $userId): void
    {
        if ($userId < 1 || !$this->active($userId)) {
            throw new ProfileException('PROFILE_ACCESS_DENIED', 'An active signed-in account is required.', $userId < 1 ? 401 : 403);
        }
    }

    public function isBlocked(int $viewerId, int $ownerId): bool
    {
        if ($viewerId === $ownerId) { return false; }
        $rows = $this->rows((new Query())->select(['id', 'contentcontainer_id'])->from('{{%user}}')->where(['id' => [$viewerId, $ownerId]])->orderBy('id'));
        $containers = array_column($rows, null, 'id');
        if (count($containers) !== 2) { return true; }
        return $this->rows((new Query())->select('contentcontainer_id')->from('{{%contentcontainer_blocked_users}}')->where(['or',
            ['contentcontainer_id' => $containers[$viewerId]['contentcontainer_id'], 'user_id' => $ownerId],
            ['contentcontainer_id' => $containers[$ownerId]['contentcontainer_id'], 'user_id' => $viewerId],
        ])) !== [];
    }

    public function areFriends(int $viewerId, int $ownerId): bool
    {
        if ($viewerId === $ownerId || !$this->active($viewerId) || !$this->active($ownerId) || $this->isBlocked($viewerId, $ownerId)) { return false; }
        $enabled = $this->rows((new Query())->select('value')->from('{{%setting}}')->where(['module_id' => 'friendship', 'name' => 'enable']))[0]['value'] ?? null;
        if (!in_array((string)$enabled, ['1', 'true'], true)) { return false; }
        return $this->rows((new Query())->select('a.id')->from(['a' => '{{%user_friendship}}'])
            ->innerJoin(['b' => '{{%user_friendship}}'], '[[b.user_id]] = [[a.friend_user_id]] AND [[b.friend_user_id]] = [[a.user_id]]')
            ->where(['a.user_id' => $viewerId, 'a.friend_user_id' => $ownerId])) !== [];
    }

    public function isSpaceMember(int $userId, int $spaceId): bool
    {
        if ($userId < 1 || $spaceId < 1 || !$this->active($userId)) { return false; }
        $membership = $this->rows((new Query())->select(['m.id', 's.contentcontainer_id'])->from(['m' => '{{%space_membership}}'])
            ->innerJoin(['s' => '{{%space}}'], '[[s.id]] = [[m.space_id]]')
            ->where(['m.user_id' => $userId, 'm.space_id' => $spaceId, 'm.status' => Membership::STATUS_MEMBER, 's.status' => Space::STATUS_ENABLED]))[0] ?? null;
        return $membership !== null && !$this->containerBlocked($userId, (int)$membership['contentcontainer_id']);
    }

    public function canAccessPostAuthor(int $viewerId, int $ownerId, int $postId): bool
    {
        if ($postId < 1 || !$this->active($viewerId) || !$this->active($ownerId) || $this->isBlocked($viewerId, $ownerId)) { return false; }
        // Current reads mirror the native public-content access branch. Do not load
        // ActiveRecord relations here: a repeatable-read snapshot may predate revocation.
        $content = $this->rows((new Query())->select('c.*')->from(['c' => '{{%content}}'])
            ->innerJoin(['p' => '{{%post}}'], '[[p.id]] = [[c.object_id]]')
            ->where(['p.id' => $postId, 'c.object_model' => Post::class, 'c.created_by' => $ownerId,
                'c.state' => Content::STATE_PUBLISHED, 'c.visibility' => Content::VISIBILITY_PUBLIC]))[0] ?? null;
        if ($content === null || !empty($content['archived'])) { return false; }
        if (empty($content['contentcontainer_id'])) { return true; }
        $container = $this->rows((new Query())->from('{{%contentcontainer}}')->where(['id' => $content['contentcontainer_id']]))[0] ?? null;
        if ($container === null || $this->containerBlocked($viewerId, (int)$container['id'])) { return false; }
        if ($container['class'] === Space::class) {
            $space = $this->rows((new Query())->select(['id', 'status', 'visibility'])->from('{{%space}}')->where(['id' => $container['pk']]))[0] ?? null;
            return $space !== null && (int)$space['status'] === Space::STATUS_ENABLED
                && ((int)$space['visibility'] !== Space::VISIBILITY_NONE || $this->isSpaceMember($viewerId, (int)$space['id']));
        }
        if ($container['class'] === User::class) {
            $user = $this->rows((new Query())->select(['id', 'status', 'visibility'])->from('{{%user}}')->where(['id' => $container['pk']]))[0] ?? null;
            return $user !== null && (int)$user['status'] === User::STATUS_ENABLED
                && ((int)$user['visibility'] !== User::VISIBILITY_HIDDEN || (int)$user['id'] === $viewerId)
                && !$this->isBlocked($viewerId, (int)$user['id']);
        }
        return false;
    }

    private function active(int $userId): bool
    {
        return $userId > 0 && $this->rows((new Query())->select('id')->from('{{%user}}')->where(['id' => $userId, 'status' => User::STATUS_ENABLED])) !== [];
    }

    private function containerBlocked(int $viewerId, int $containerId): bool
    {
        return $this->rows((new Query())->select('contentcontainer_id')->from('{{%contentcontainer_blocked_users}}')->where(['contentcontainer_id' => $containerId, 'user_id' => $viewerId])) !== [];
    }

    private function rows(Query $query): array
    {
        $command = $query->createCommand($this->db);
        if ($this->db->getTransaction()?->isActive) {
            $params = $command->params;
            $command->setSql($command->getSql() . ' FOR SHARE')->bindValues($params);
        }
        return $command->queryAll();
    }
}
