<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;

use humhub\modules\user\widgets\Image;
use Yii;
use yii\helpers\Html;
use yii\db\Query;

final class NativePeopleController extends \humhub\modules\user\controllers\PeopleController
{
    public function actionIndex()
    {
        Yii::$app->response->headers->set('Cache-Control', 'private, no-store');
        $spaces = (new Query())->select(['s.id', 's.name'])->from(['s' => '{{%space}}'])
            ->innerJoin(['m' => '{{%space_membership}}'], '[[m.space_id]] = [[s.id]]')
            ->where(['m.user_id' => NativeRequestContext::actorId(), 'm.status' => 3, 's.status' => 1])->orderBy('s.name')->all();
        $options = []; foreach ($spaces as $space) { $options[$space['id']] = $space['name']; }
        $query = new ScopedPeopleQuery(['pageSize' => 24]);
        $form = Html::beginForm(['/user/people/index'], 'get', ['class' => 'panel panel-default p-3'])
            . Html::label('当前活动空间', 'privacy-space')
            . Html::dropDownList('space_id', $query->verifiedSpaceId, $options, ['id' => 'privacy-space', 'class' => 'form-control', 'prompt' => '请选择已加入的 Space'])
            . Html::label('搜索昵称或公开自述', 'privacy-keyword')
            . Html::textInput('keyword', Yii::$app->request->get('keyword', ''), ['id' => 'privacy-keyword', 'class' => 'form-control'])
            . Html::submitButton('查看成员', ['class' => 'btn btn-primary mt-2']) . Html::endForm();
        return $this->renderContent($form . $this->cards($query) . \yii\widgets\LinkPager::widget(['pagination' => $query->pagination]));
    }
    public function actionLoadMore() { return $this->cards(new ScopedPeopleQuery(['pageSize' => 24])); }
    public function actionFilterPeopleJson($field, $keyword = null) { return $this->asJson([]); }
    private function cards(ScopedPeopleQuery $query): string
    {
        $html = '<div class="row">';
        foreach ($query->all() as $user) {
            $url = NativeProfileLinks::aboutUrl($user, ['entry_type' => 'space', 'space_id' => $query->verifiedSpaceId]);
            if ($url === null) { continue; }
            $html .= '<div class="col-md-4"><div class="panel panel-default p-3">' . Image::widget(['user' => $user, 'link' => false, 'width' => 48, 'hideOnlineStatus' => true])
                . '<h3>' . Html::a(Html::encode($user->displayName), $url) . '</h3><p>' . Html::encode(NativeProfilePresenter::subTitle($user)) . '</p></div></div>';
        }
        return $html . '</div>';
    }
}
