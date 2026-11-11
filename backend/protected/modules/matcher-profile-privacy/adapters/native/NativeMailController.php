<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;
use humhub\modules\mail\models\Message;
use humhub\modules\mail\permissions\SendMail;
use Yii;
use yii\web\ForbiddenHttpException;

final class NativeMailController extends \humhub\modules\mail\controllers\MailController
{
    public function actionSearchUser($keyword, $id = null)
    {
        $message = $id === null ? null : Message::findOne($id);
        if ($id !== null && (!$message || !$message->isParticipant(Yii::$app->user->identity))) { throw new ForbiddenHttpException('The conversation is unavailable.'); }
        $query = new ScopedPeopleQuery(['pageSize' => 24, 'defaultFilters' => ['keyword' => $keyword]]); $result = [];
        foreach ($query->all() as $user) {
            $canSend = $user->permissionManager->can(new SendMail());
            $participating = $message && $message->isParticipant($user);
            $result[] = ['id' => (int)$user->id, 'guid' => $user->guid, 'text' => $user->displayName,
                'subText' => NativeProfilePresenter::subTitle($user), 'image' => $user->image->getUrl(),
                'link' => $user->createUrl('/user/profile/about', ['space_id' => $query->verifiedSpaceId]),
                'disabled' => !$canSend || $participating, 'disabledText' => !$canSend || $participating ? '当前无法添加此成员' : null, 'priority' => 2];
        }
        return $this->asJson($result);
    }
}
