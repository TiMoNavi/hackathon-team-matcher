<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\controllers;

use humhub\modules\matcherAuth\Module;
use humhub\modules\matcherAuth\adapters\native\ReceiptService;
use humhub\modules\matcherAuth\adapters\native\VerifiedGithubClient;
use humhub\modules\matcherAuth\domain\AuthException;
use humhub\modules\matcherAuth\domain\AuthPolicy;
use humhub\modules\user\models\User;
use Yii;
use yii\authclient\BaseClient;

final class NativeAuthController extends \humhub\modules\user\controllers\AuthController
{
    public function actions()
    {
        $actions = parent::actions();
        $actions['external']['class'] = GithubAuthAction::class;
        $actions['external']['cancelCallback'] = [$this, 'onAuthCancelled'];
        return $actions;
    }
    public function beforeAction($action)
    {
        if (!parent::beforeAction($action)) { return false; }
        if ($action->id === 'external' && Yii::$app->request->get('authclient') === 'github') {
            if (!$this->authModule()->githubAvailable()) { $this->authFailure('unavailable'); return false; }
            try { $this->authModule()->receipts()->read(ReceiptService::OAUTH); }
            catch (AuthException) {
                if (Yii::$app->request->get('code') !== null || Yii::$app->request->get('error') !== null || !Yii::$app->user->isGuest) {
                    $this->authFailure('failed'); return false;
                }
                // The native GitHub login button remains a valid explicit guest login entry.
                $this->authModule()->receipts()->issue(ReceiptService::OAUTH, 'github', 'login', '', '', null);
            }
        }
        return true;
    }
    public function onAuthSuccess(BaseClient $authClient)
    {
        if (!in_array($authClient->getId(), ['github', 'email-code'], true)) { return parent::onAuthSuccess($authClient); }
        try {
            if (!$authClient instanceof VerifiedGithubClient || $authClient->getId() !== 'github') { throw new AuthException('CHALLENGE_INVALID', 'Use the verified authentication flow.'); }
            $receipt = $this->authModule()->receipts()->read(ReceiptService::OAUTH);
            $attributes = $authClient->getUserAttributes();
            $result = $this->authModule()->identities()->resolve('github', (string)($attributes['id'] ?? ''), (string)($attributes['email'] ?? ''), $receipt['purpose'], $receipt['actor_id'], $receipt);
            if ($result['registration']) { return $this->redirect(['/user/registration']); }
            if (!$result['bound']) { $this->authenticateVerified($result['user'], $authClient); }
            else { $this->authModule()->imports()->attemptPending((int)$result['user']->id); }
            return $this->redirect(AuthPolicy::NEXT_URL);
        } catch (AuthException $error) {
            return $this->authFailure(match ($error->errorCode) { 'IDENTITY_CONFLICT' => 'identity_conflict', 'ACCOUNT_UNAVAILABLE' => 'account_unavailable', 'AUTH_UNAVAILABLE' => 'unavailable', default => 'failed' });
        } catch (\Throwable) { return $this->authFailure('failed'); }
    }
    public function authenticateVerified(User $user, BaseClient $client): void
    {
        $this->authModule()->identities()->assertLoginAllowed($user, $client);
        Yii::$app->user->setReturnUrl(AuthPolicy::NEXT_URL);
        // Reuse native status checks, before-status/after-login events, source sync policy,
        // session rotation/current client and invitation handling. No raw user->login bypass.
        parent::login($user, $client);
        if (Yii::$app->user->isGuest || (int)Yii::$app->user->id !== (int)$user->id) {
            throw new AuthException((int)$user->status === User::STATUS_ENABLED ? 'AUTH_LOGIN_FAILED' : 'ACCOUNT_UNAVAILABLE', 'The account could not be signed in.', 403);
        }
        $this->authModule()->imports()->attemptPending((int)$user->id);
    }
    public function onAuthCancelled($client) { return $this->authFailure('cancelled'); }
    public function authFailure(string $reason)
    {
        if (!in_array($reason, ['cancelled', 'failed', 'identity_conflict', 'account_unavailable', 'registration_required', 'unavailable'], true)) { $reason = 'failed'; }
        $this->authModule()->receipts()->clear(ReceiptService::OAUTH);
        $webapp = Yii::$app->getModule('matcher-webapp');
        return $this->redirect($webapp !== null && $webapp->isEnabled && $webapp->isUiEnabled()
            ? '/matcher/app/login?auth_error=' . $reason : ['/user/auth/login']);
    }
    private function authModule(): Module { return Yii::$app->getModule('matcher-auth'); }
}
