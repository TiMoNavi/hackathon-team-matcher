<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth;

use humhub\modules\matcherAuth\adapters\native\EmailCodeClient;
use humhub\modules\matcherAuth\adapters\native\VerifiedGithubClient;
use humhub\modules\matcherAuth\controllers\NativeAuthController;
use humhub\modules\matcherAuth\controllers\RegistrationController;
use Yii;
use yii\helpers\Url;

final class Events
{
    public static function beforeRequest(): void
    {
        $module = Yii::$app->getModule('matcher-auth');
        if (!$module instanceof Module || !$module->isEnabled) { return; }
        $user = Yii::$app->getModule('user');
        foreach (['auth' => NativeAuthController::class, 'registration' => RegistrationController::class] as $id => $adapter) {
            $existing = $user->controllerMap[$id] ?? null;
            $native = $id === 'auth' ? \humhub\modules\user\controllers\AuthController::class : \humhub\modules\user\controllers\RegistrationController::class;
            if ($existing !== null && $existing !== $adapter && $existing !== $native && $existing !== ['class' => $native]) {
                $module->integrationReady = false;
                // Readiness alone cannot close the old native add()/email-auto-map entry.
                // Remove both target clients before dispatch when a foreign controller owns it.
                Yii::$app->authClientCollection->removeClient('github');
                Yii::$app->authClientCollection->removeClient('email-code');
                return; // Never silently replace another security controller integration.
            }
        }
        $user->controllerMap['auth'] = NativeAuthController::class;
        $user->controllerMap['registration'] = RegistrationController::class;
        $clients = Yii::$app->authClientCollection;
        $clients->setClient('email-code', ['class' => EmailCodeClient::class]);
        $github = Yii::$app->getModule('auth-github');
        if ($github !== null && $github->isEnabled && (bool)$github->settings->get('enabled')) {
            $clients->setClient('github', [
                'class' => VerifiedGithubClient::class,
                'clientId' => (string)$github->settings->get('clientId', ''),
                'clientSecret' => (string)$github->settings->get('clientSecret', ''),
                'returnUrl' => Url::to(['/user/auth/external', 'authclient' => 'github'], true),
            ]);
        }
        $module->integrationReady = true;
    }
}
