<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\space\models\Space;
use Yii;

final class NativeRequestContext
{
    public static function actorId(): int
    {
        return Yii::$app instanceof \yii\web\Application && !Yii::$app->user->isGuest ? (int)Yii::$app->user->id : 0;
    }

    public static function spaceId(): ?int
    {
        if (!(Yii::$app instanceof \yii\web\Application)) { return null; }
        $request = Yii::$app->request;
        $value = $request->get('space_id');
        if ($value === null) {
            $controller = Yii::$app->controller;
            $container = $controller && $controller->canGetProperty('contentContainer') ? $controller->contentContainer : null;
            return $container instanceof Space ? (int)$container->id : null;
        }
        if (!is_scalar($value) || !preg_match('/^[1-9][0-9]{0,9}$/D', (string)$value)) { throw new ProfileException('INVALID_ACCESS_CONTEXT', 'Choose a valid Space.'); }
        return (int)$value;
    }

    public static function forOwner(int $ownerId, string $purpose = 'detail'): array
    {
        $viewerId = self::actorId();
        if ($viewerId === $ownerId) { return ['entry_type' => 'self', 'purpose' => $purpose]; }
        $spaceId = self::spaceId();
        if ($spaceId !== null) { return ['entry_type' => 'space', 'space_id' => $spaceId, 'purpose' => $purpose]; }
        $postId = Yii::$app instanceof \yii\web\Application ? Yii::$app->request->get('post_id') : null;
        if ($postId !== null) {
            if (!is_scalar($postId) || !preg_match('/^[1-9][0-9]{0,9}$/D', (string)$postId)) { throw new ProfileException('INVALID_ACCESS_CONTEXT', 'Choose a valid public post entry.'); }
            return ['entry_type' => 'public_post', 'post_id' => (int)$postId, 'purpose' => $purpose];
        }
        return ['entry_type' => 'friendship', 'purpose' => $purpose];
    }
}
