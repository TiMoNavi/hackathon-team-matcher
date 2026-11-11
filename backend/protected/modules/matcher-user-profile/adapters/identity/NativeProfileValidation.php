<?php
declare(strict_types=1);

namespace humhub\modules\matcherProfile\adapters\identity;

use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\user\models\Profile;
use yii\base\Event;

final class NativeProfileValidation
{
    /** Preserve unrelated edits to legacy records; enforce combined length when a name changes. */
    public static function afterValidate(Event $event): void
    {
        $profile = $event->sender;
        if (!$profile instanceof Profile || (!$profile->isNewRecord && !$profile->isAttributeChanged('firstname') && !$profile->isAttributeChanged('lastname'))) {
            return;
        }
        foreach (FieldCatalog::validateNativeNameParts($profile->firstname, $profile->lastname) as $error) {
            $profile->addError('firstname', $error);
            $profile->addError('lastname', $error);
        }
    }
}
