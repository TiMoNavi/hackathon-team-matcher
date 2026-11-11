<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;

use humhub\modules\user\models\ProfileField;
use Yii;
use yii\base\Event;

/** Registration only; stored values are never overwritten by a display request. */
final class NativePrivacyHooks
{
    public static function install(): void
    {
        $user = Yii::$app->getModule('user');
        $user->displayNameSubCallback = [NativeProfilePresenter::class, 'subTitle'];
        $user->includeEmailInSearch = false;
        $user->controllerMap['profile'] = NativeProfileController::class;
        $user->controllerMap['people'] = NativePeopleController::class;
        $user->controllerMap['search'] = NativeSearchController::class;
        Yii::$container->set(\humhub\modules\user\search\UserSearchProvider::class, NativeUserSearchProvider::class);
        Yii::$container->set(\humhub\modules\user\widgets\PeopleDetails::class, NativePeopleDetails::class);
        Yii::$container->set(\humhub\modules\user\widgets\PeopleTagList::class, NativePeopleTags::class);
        if (($mail = Yii::$app->getModule('mail')) && $mail->isEnabled) {
            $mail->controllerMap['mail'] = NativeMailController::class;
            Yii::$container->set(\humhub\modules\mail\widgets\InboxMessagePreview::class, NativeInboxMessagePreview::class);
        }
        if (($calendar = Yii::$app->getModule('calendar')) && $calendar->isEnabled) {
            $calendar->controllerMap['entry'] = NativeCalendarEntryController::class;
            foreach ([
                'humhub\\modules\\calendar\\integration\\BirthdayCalendarQuery' => 'CalendarBirthdayQuery.php',
                'humhub\\modules\\calendar\\interfaces\\VCalendar' => 'CalendarVCalendar.php',
                'humhub\\modules\\calendar\\helpers\\dav\\PrincipalBackend' => 'CalendarPrincipalBackend.php',
            ] as $class => $file) {
                if (!class_exists($class, false)) { Yii::$classMap[$class] = __DIR__ . '/compat/' . $file; }
            }
        }
        $restClass = 'humhub\\modules\\rest\\definitions\\UserDefinitions';
        if (!class_exists($restClass, false)) { Yii::$classMap[$restClass] = __DIR__ . '/compat/RestUserDefinitions.php'; }
        Event::off(ProfileField::class, ProfileField::EVENT_BEFORE_INSERT, [self::class, 'protectLegacyFields']);
        Event::off(ProfileField::class, ProfileField::EVENT_BEFORE_UPDATE, [self::class, 'protectLegacyFields']);
        Event::on(ProfileField::class, ProfileField::EVENT_BEFORE_INSERT, [self::class, 'protectLegacyFields']);
        Event::on(ProfileField::class, ProfileField::EVENT_BEFORE_UPDATE, [self::class, 'protectLegacyFields']);
        NativeProfileLinks::install();
    }

    public static function protectLegacyFields(Event $event): void
    {
        /** @var ProfileField $field */ $field = $event->sender;
        $field->visible = 0; $field->searchable = 0; $field->directory_filter = 0;
    }
}
