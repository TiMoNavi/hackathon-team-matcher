<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;
use humhub\modules\user\widgets\Image;
use Yii;

final class NativeSearchController extends \humhub\modules\user\controllers\SearchController
{
    public function actionJson()
    {
        Yii::$app->response->headers->set('Cache-Control', 'private, no-store');
        $query = new ScopedPeopleQuery(['pageSize' => 24]); $result = [];
        foreach ($query->all() as $user) {
            $result[] = ['id' => (int)$user->id, 'guid' => $user->guid, 'disabled' => false, 'disabledText' => null,
                'text' => $user->displayName, 'subText' => NativeProfilePresenter::subTitle($user),
                'image' => $user->image->getUrl(), 'priority' => 2,
                'link' => $user->createUrl('/user/profile/about', ['space_id' => $query->verifiedSpaceId])];
        }
        return $this->asJson($result);
    }
    public function actionMentioning()
    {
        $query = new ScopedPeopleQuery(['pageSize' => 10]); $result = [];
        foreach ($query->all() as $user) {
            if ($user->permissionManager->can(\humhub\modules\user\permissions\CanMention::class)) {
                $result[] = ['guid' => $user->guid, 'type' => 'u', 'name' => $user->displayName,
                    'image' => Image::widget(['user' => $user, 'width' => 20]),
                    'link' => $user->createUrl('/user/profile/about', ['space_id' => $query->verifiedSpaceId])];
            }
        }
        return $this->asJson($result);
    }
}
