<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\media;

use humhub\components\assets\AssetImage;
use humhub\modules\content\events\ContentContainerImageEvent;
use humhub\modules\matcherProfile\Module;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\user\models\User;
use Yii;
use yii\base\Event;

/** Native cards resolve the committed reference dynamically; no fallible public copy step. */
final class NativeAvatarProjection
{
    public static function onImage(ContentContainerImageEvent $event): void
    {
        if (!$event->sender instanceof User) { return; }
        $module = Yii::$app->getModule('matcher-user-profile');
        if (!$module instanceof Module || Yii::$app->db->schema->getTableSchema('{{%matcher_profile_state}}') === null) { return; }
        $state = $module->getProfileRepository()->findState((int)$event->sender->id, ProfileScope::global());
        if (($state['confirmed_avatar_ref'] ?? null) === null) {
            if ((int)($state['identity_version'] ?? 0) > 0) { $event->image = new AssetImage(array_merge($event->config, ['file' => '/matcher-profile-default/' . $event->sender->guid . '.png'])); }
            return;
        }
        $event->image = new ProtectedProfileImage(array_merge($event->config, ['fileRef' => $state['confirmed_avatar_ref']]));
    }

    public static function onHeader(Event $event): void
    {
        $widget = $event->sender;
        if (!$widget->container instanceof User || Yii::$app->user->isGuest || (int)$widget->container->id !== (int)Yii::$app->user->id) { return; }
        $module = Yii::$app->getModule('matcher-user-profile');
        if (!$module instanceof Module) { return; }
        $state = $module->getProfileRepository()->findState((int)$widget->container->id, ProfileScope::global());
        $version = (int)($state['identity_version'] ?? 0);
        foreach (['imageUploadUrl', 'imageCropUrl', 'imageDeleteUrl'] as $property) {
            $widget->$property .= (str_contains($widget->$property, '?') ? '&' : '?') . 'expected_version=' . $version;
        }
        $widget->getView()->registerJs(file_get_contents(__DIR__ . '/native-avatar.js'), \yii\web\View::POS_READY, 'matcher-profile-avatar-version');
    }
}

final class ProtectedProfileImage extends AssetImage
{
    public string $fileRef;
    public function getUrl(?array $options = null, bool $scheme = false): string
    {
        $module = Yii::$app->getModule('matcher-user-profile');
        return $module->mediaUrl($this->fileRef, ($options === [] || ($options !== null && (($options['width'] ?? 0) > 256 || ($options['maxWidth'] ?? 0) > 256))) ? 'main' : 'thumbnail', $scheme);
    }
    public function exists(): bool { return true; }
    public function setUploadedFile(?\yii\web\UploadedFile $file = null): void { throw new \LogicException('Use the versioned identity upload flow.'); }
}
