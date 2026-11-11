<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;
use humhub\modules\user\models\User;

/** Presentation-only clone prevents Messenger's private full-name shortcut. */
final class NativeInboxMessagePreview extends \humhub\modules\mail\widgets\InboxMessagePreview
{
    public function getViewPath()
    {
        return dirname((new \ReflectionClass(\humhub\modules\mail\widgets\InboxMessagePreview::class))->getFileName()) . '/views';
    }

    public function lastParticipant(): ?User
    {
        $user = parent::lastParticipant();
        if ($user === null) { return null; }
        $copy = clone $user;
        if ($user->profile !== null) {
            $profile = clone $user->profile;
            $profile->firstname = ''; $profile->lastname = '';
            $copy->populateRelation('profile', $profile);
        }
        return $copy;
    }
}
