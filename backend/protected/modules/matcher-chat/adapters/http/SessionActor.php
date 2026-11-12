<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\http;

use humhub\modules\matcherChat\domain\{ChatException, SafeInteger};
use humhub\modules\user\models\User;
use Yii;

final class SessionActor
{
    public static function requireSelf(int $expected): int
    {
        if (!Yii::$app instanceof \yii\web\Application) { throw new ChatException('AUTHENTICATION_REQUIRED', 'A native session is required.', 401); }
        $user = Yii::$app->user;
        if (!$user->enableSession || $user->isGuest) { throw new ChatException('AUTHENTICATION_REQUIRED', 'A native session is required.', 401); }
        $identity = $user->identity;
        if (!$identity instanceof User || (int)$identity->status !== User::STATUS_ENABLED) { throw new ChatException('ACCOUNT_UNAVAILABLE', 'The account is unavailable.', 403); }
        if ($user->canGetProperty('impersonation') && !$user->impersonation->canAccessPrivateContent()) { throw new ChatException('PRIVATE_CONTENT_UNAVAILABLE', 'Private content is unavailable.', 403); }
        $id = SafeInteger::native($identity->id, 'viewer_id');
        if ($id !== $expected) { throw new ChatException('SESSION_CHANGED', 'The session changed.', 401); }
        return $id;
    }
}
