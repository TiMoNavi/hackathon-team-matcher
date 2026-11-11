<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\controllers;

use humhub\components\access\ControllerAccess;
use humhub\modules\user\components\BaseAccountController;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\space\models\Membership;
use humhub\modules\space\models\Space;
use humhub\modules\user\models\User;
use Yii;
use yii\db\Query;
use yii\web\ForbiddenHttpException;
use yii\web\MethodNotAllowedHttpException;

/** Read-only delivery adapter. All editing is performed by the existing versioned APIs. */
final class EditorController extends BaseAccountController
{
    protected function getAccessRules() { return [[ControllerAccess::RULE_LOGGED_IN_ONLY]]; }

    public function actionIndex()
    {
        if (!Yii::$app->request->isGet) { throw new MethodNotAllowedHttpException('Use GET.'); }
        $user = Yii::$app->user->identity;
        if (!$user instanceof User || (int)$user->status !== User::STATUS_ENABLED) { throw new ForbiddenHttpException(); }
        $this->module->getAccessPolicy()->assertOwner((int)$user->id, (int)$user->id, ProfileScope::global());
        Yii::$app->response->headers->set('Cache-Control', 'private, no-store');
        $spaces = (new Query())->select(['s.id', 's.name'])->from(['s' => Space::tableName()])
            ->innerJoin(['m' => Membership::tableName()], 'm.space_id = s.id')
            ->where(['m.user_id' => (int)$user->id, 'm.status' => Membership::STATUS_MEMBER, 's.status' => Space::STATUS_ENABLED])
            ->orderBy(['s.name' => SORT_ASC, 's.id' => SORT_ASC])->all();
        $privacy = Yii::$app->getModule('matcher-profile-privacy');
        $this->pageTitle = '团队协作资料';
        return $this->render('index', ['config' => [
            'apiBase' => Yii::$app->request->baseUrl . '/api/v1',
            'spaces' => array_map(static fn(array $space): array => ['id' => (int)$space['id'], 'name' => $space['name']], $spaces),
            'privacyEnabled' => $privacy !== null && $privacy->isEnabled,
        ]]);
    }
}
