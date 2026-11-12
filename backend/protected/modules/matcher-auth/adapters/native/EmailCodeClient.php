<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\adapters\native;

use humhub\modules\user\authclient\interfaces\CustomAuth;
use Yii;
use yii\web\Response;

final class EmailCodeClient extends \yii\authclient\BaseClient implements CustomAuth
{
    public function getId() { return 'email-code'; }
    protected function defaultName() { return 'email-code'; }
    protected function defaultTitle() { return '邮箱验证码'; }
    protected function initUserAttributes() { throw new \humhub\modules\matcherAuth\domain\AuthException('AUTHENTICATION_REQUIRED', 'A verified email challenge is required.', 401); }
    /** External AuthChoice never converts request attributes into proof. */
    public function handleAuthRequest(): ?Response { return Yii::$app->response->redirect('/matcher/app/login'); }
}
