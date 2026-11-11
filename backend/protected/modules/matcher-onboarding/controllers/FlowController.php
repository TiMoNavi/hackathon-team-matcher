<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboarding\controllers;

use humhub\components\access\ControllerAccess;
use humhub\modules\user\components\BaseAccountController;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\space\models\Membership;
use humhub\modules\space\models\Space;
use Yii;
use yii\db\Query;
use yii\web\MethodNotAllowedHttpException;

/** Delivers the local rules workflow; domain writes stay in versioned APIs. */
final class FlowController extends BaseAccountController
{
    protected function getAccessRules() { return [[ControllerAccess::RULE_LOGGED_IN_ONLY]]; }

    public function actionIndex()
    {
        if (!Yii::$app->request->isGet) { throw new MethodNotAllowedHttpException('Use GET.'); }
        $id = (int)Yii::$app->user->id;
        $profile = Yii::$app->getModule('matcher-user-profile');
        $profile->getAccessPolicy()->assertOwner($id, $id, ProfileScope::global());
        Yii::$app->response->headers->set('Cache-Control', 'private, no-store');
        $spaces = (new Query())->select(['s.id', 's.name'])->from(['s' => Space::tableName()])
            ->innerJoin(['m' => Membership::tableName()], 'm.space_id = s.id')
            ->where(['m.user_id' => $id, 'm.status' => Membership::STATUS_MEMBER, 's.status' => Space::STATUS_ENABLED])
            ->orderBy(['s.name' => SORT_ASC, 's.id' => SORT_ASC])->all();
        $privacy = Yii::$app->getModule('matcher-profile-privacy');
        $this->pageTitle = '认识你，找到合拍的队友';
        return $this->render('index', ['config' => [
            'apiBase' => Yii::$app->request->baseUrl . '/api/v1',
            'spaces' => array_map(static fn(array $space): array => ['id' => (int)$space['id'], 'name' => $space['name']], $spaces),
            'privacyEnabled' => $privacy !== null && $privacy->isEnabled,
            'importsEnabled' => Yii::$app->hasModule('matcher-github-import') || Yii::$app->hasModule('matcher-resume-import'),
        ]]);
    }
}
