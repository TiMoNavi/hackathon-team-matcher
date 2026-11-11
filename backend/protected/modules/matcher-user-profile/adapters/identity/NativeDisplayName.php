<?php
declare(strict_types=1);

namespace humhub\modules\matcherProfile\adapters\identity;

use humhub\modules\matcherProfile\application\GetDisplayName;
use humhub\modules\user\models\User;
use Yii;

final class NativeDisplayName
{
    public static function resolve(User $user): string
    {
        if ((int) $user->id <= 0 || !$user->guid) {
            return '新成员';
        }
        return (new GetDisplayName(new NativeConfirmedIdentityReader(Yii::$app->db)))->execute((int) $user->id, (string) $user->guid);
    }
}
