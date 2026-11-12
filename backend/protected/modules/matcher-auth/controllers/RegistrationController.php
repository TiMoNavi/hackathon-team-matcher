<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\controllers;

use humhub\modules\matcherAuth\adapters\native\ReceiptService;
use humhub\modules\matcherAuth\domain\AuthException;
use humhub\modules\matcherAuth\domain\AuthPolicy;
use humhub\modules\user\models\User;
use humhub\modules\user\models\forms\Registration;
use humhub\modules\user\services\PendingAuthService;
use Yii;

final class RegistrationController extends \humhub\modules\user\controllers\RegistrationController
{
    public function actionIndex()
    {
        $module = Yii::$app->getModule('matcher-auth');
        if (!Yii::$app->session->has(ReceiptService::REGISTRATION)) {
            // Do not let an older native pending DTO use the unsafe native add() path for our providers.
            $pending = new PendingAuthService();
            if ($pending->hasPending() && in_array($pending->restore()?->getId(), ['github', 'email-code'], true)) {
                $pending->clear(); return $this->redirect(['/user/auth/login']);
            }
            return parent::actionIndex();
        }
        try {
            $receipt = $module->receipts()->read(ReceiptService::REGISTRATION);
            if ($receipt['purpose'] !== 'registration') { throw new AuthException('CHALLENGE_INVALID', 'Registration proof is unavailable.'); }
            $client = $module->identities()->client($receipt['provider'], $receipt['subject'], $receipt['verified_email']);
            $module->identities()->assertMayRegister($client, $receipt['verified_email']);
            $registration = new Registration(enableEmailField: false, enablePasswordForm: false);
            $registration->getUser()->email = $receipt['verified_email'];
            $registration->getUser()->username = 'member_' . substr(hash('sha256', $receipt['id']), 0, 12);
            $registration->setForm();
            if ($registration->submitted('save')) {
                $user = $module->identities()->register($registration, $receipt);
                if ($user !== null) {
                    $module->receipts()->clear(ReceiptService::REGISTRATION);
                    if ((int)$user->status === User::STATUS_NEED_APPROVAL) { return $this->redirect(['/user/registration/pending']); }
                    $bridge = new NativeAuthController('auth', Yii::$app->getModule('user'));
                    $bridge->authenticateVerified($user, $client);
                    return $this->redirect(AuthPolicy::NEXT_URL);
                }
            }
            // This private continuation is authorized by a verified receipt, independently of
            // whether the public password-signup UI is hidden. Required native fields stay required.
            return $this->render('index', ['hForm' => $registration, 'showRegistrationForm' => true, 'hasAuthClient' => true]);
        } catch (AuthException $error) {
            $reason = $error->errorCode === 'IDENTITY_CONFLICT' ? 'identity_conflict' : ($error->errorCode === 'ACCOUNT_UNAVAILABLE' ? 'account_unavailable' : 'registration_required');
            $module->receipts()->clear(ReceiptService::REGISTRATION);
            return (new NativeAuthController('auth', Yii::$app->getModule('user')))->authFailure($reason);
        }
    }
}
