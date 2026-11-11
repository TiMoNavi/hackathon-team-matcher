<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\space\models\Membership;
use humhub\modules\user\models\User;
use Yii;
use yii\db\Query;

/** All candidate qualification occurs in SQL before pagination or keyword matching. */
final class ScopedPeopleQuery extends \humhub\modules\user\components\PeopleQuery
{
    public ?int $verifiedSpaceId = null;
    public function init()
    {
        $this->pageSize = min(48, max(1, (int)$this->pageSize));
        $actor = NativeRequestContext::actorId();
        $relations = new NativeProfileRelations(Yii::$app->db);
        $space = NativeRequestContext::spaceId();
        if ($actor < 1 || $space === null) { $this->andWhere('0=1'); $this->order(); $this->paginate(); return; }
        if (!$relations->isSpaceMember($actor, $space)) { throw new ProfileException('PROFILE_ACCESS_DENIED', 'Formal membership of the selected Space is required.', 403); }
        $this->verifiedSpaceId = $space;
        $this->andWhere(['user.status' => User::STATUS_ENABLED]);
        $this->andWhere(['!=', 'user.visibility', User::VISIBILITY_HIDDEN]);
        $this->innerJoin(['privacy_membership' => '{{%space_membership}}'], '[[privacy_membership.user_id]] = [[user.id]]')
            ->andWhere(['privacy_membership.space_id' => $space, 'privacy_membership.status' => Membership::STATUS_MEMBER]);
        $this->innerJoin(['privacy_selected_space' => '{{%space}}'], '[[privacy_selected_space.id]] = [[privacy_membership.space_id]]');
        $spaceBlock = (new Query())->select(new \yii\db\Expression('1'))->from(['privacy_space_block' => '{{%contentcontainer_blocked_users}}'])
            ->where('[[privacy_space_block.contentcontainer_id]] = [[privacy_selected_space.contentcontainer_id]]')
            ->andWhere(['or', ['privacy_space_block.user_id' => $actor], '[[privacy_space_block.user_id]] = [[user.id]]']);
        $this->andWhere(['not exists', $spaceBlock]);
        $this->andWhere(['exists', (new Query())->select(new \yii\db\Expression('1'))->from(['privacy_actor_membership' => '{{%space_membership}}'])
            ->innerJoin(['privacy_space' => '{{%space}}'], '[[privacy_space.id]] = [[privacy_actor_membership.space_id]]')
            ->where(['privacy_actor_membership.user_id' => $actor, 'privacy_actor_membership.space_id' => $space,
                'privacy_actor_membership.status' => Membership::STATUS_MEMBER, 'privacy_space.status' => 1])]);
        $actorContainer = (new Query())->select('contentcontainer_id')->from('{{%user}}')->where(['id' => $actor])->scalar(Yii::$app->db);
        $block = (new Query())->select(new \yii\db\Expression('1'))->from(['privacy_block' => '{{%contentcontainer_blocked_users}}'])->where(['or',
            ['and', '[[privacy_block.contentcontainer_id]] = [[user.contentcontainer_id]]', ['privacy_block.user_id' => $actor]],
            ['and', ['privacy_block.contentcontainer_id' => $actorContainer], '[[privacy_block.user_id]] = [[user.id]]'],
        ]);
        $this->andWhere(['not exists', $block]);
        $this->with('profile')->with('contentContainerRecord');
        $this->filterByKeyword(); $this->order(); $this->paginate();
    }

    public function filterByKeyword(): self
    {
        $keyword = Yii::$app->request->get('keyword', $this->defaultFilters['keyword'] ?? '');
        if (!is_scalar($keyword)) { throw new ProfileException('INVALID_QUERY', 'Use a text search keyword.'); }
        $keyword = mb_substr(trim((string)$keyword), 0, 160);
        $this->setActiveFilter('keyword', $keyword);
        if ($keyword === '') { return $this; }
        $matches = (new Query())->select(new \yii\db\Expression('1'))->from(['privacy_state' => '{{%matcher_profile_state}}'])
            ->innerJoin(['privacy_attribute' => '{{%matcher_profile_attribute}}'], '[[privacy_attribute.state_id]] = [[privacy_state.id]]')
            ->innerJoin(['privacy_profile' => '{{%profile}}'], '[[privacy_profile.user_id]] = [[privacy_state.user_id]]')
            ->where('[[privacy_state.user_id]] = [[user.id]]')
            ->andWhere(['privacy_state.scope_key' => 'global', 'privacy_attribute.confirmation' => 'confirmed', 'privacy_attribute.visibility' => 'authenticated'])
            ->andWhere(['or',
                ['and', ['privacy_attribute.field_key' => 'nickname'], ['like', 'privacy_profile.matcher_nickname', $keyword]],
                ['and', ['privacy_attribute.field_key' => 'headline'], ['like', 'privacy_profile.title', $keyword]],
            ]);
        return $this->andWhere(['exists', $matches]);
    }
    public function filterByProfileFields(): self { return $this; }
    public function order(): self { return $this->orderBy(['user.id' => SORT_ASC]); }
}
