<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\user\models\User;
use Yii;
use yii\helpers\Html;

/** Request-time presentation DTOs only; never mutates a loaded profile/User instance. */
final class NativeProfilePresenter
{
    public static function attributes(int $ownerId, string $purpose = 'detail'): array
    {
        $actor = NativeRequestContext::actorId();
        if ($actor === 0) { return []; }
        try {
            $context = NativeRequestContext::forOwner($ownerId, $purpose);
            return Yii::$app->getModule('matcher-profile-privacy')->getPrivacyService()
                ->read($actor, $ownerId, ProfileScope::global(), $context)['attributes'];
        } catch (ProfileException $error) {
            if (in_array($error->httpStatus, [401, 403, 404, 422], true)) { return []; }
            throw $error;
        }
    }

    public static function subTitle(User $user): string
    {
        foreach (self::attributes((int)$user->id, 'summary') as $attribute) {
            if ($attribute['key'] === 'headline') { return (string)$attribute['value']; }
        }
        return '';
    }

    public static function value(mixed $value): string
    {
        if (is_scalar($value)) { return (string)$value; }
        if ($value === null) { return ''; }
        $parts = [];
        foreach ($value as $key => $item) {
            if (is_array($item)) { $text = self::value($item); }
            else { $text = is_scalar($item) ? (string)$item : ''; }
            if ($text !== '') { $parts[] = $text; }
        }
        return implode(' · ', $parts);
    }

    public static function about(int $ownerId): string
    {
        $fields = \humhub\modules\matcherProfile\domain\FieldCatalog::definitions();
        $html = '<section id="user-profile-about" class="panel panel-default"><div class="panel-heading">个人资料</div><div class="panel-body"><dl>';
        foreach (self::attributes($ownerId) as $attribute) {
            $html .= '<div class="profile-item mb-3" data-profile-field="' . Html::encode($attribute['key']) . '"><dt>'
                . Html::encode($fields[$attribute['key']]['label'] ?? $attribute['key']) . '</dt><dd>'
                . nl2br(Html::encode(self::value($attribute['value']))) . '</dd></div>';
        }
        $html .= '</dl>';
        $actor = NativeRequestContext::actorId();
        if ($actor > 0) {
            try {
                $context = NativeRequestContext::forOwner($ownerId, 'contacts');
                $contacts = Yii::$app->getModule('matcher-profile-privacy')->getPrivacyService()->contacts($actor, $ownerId, $context)['attributes'];
                if ($contacts !== []) { $html .= '<section class="profile-contacts"><h3>联系方式</h3><dl>'; }
                foreach ($contacts as $contact) {
                    $html .= '<div class="profile-contact mb-3" data-contact-field="' . Html::encode($contact['key']) . '"><dt>' . Html::encode($fields[$contact['key']]['label']) . '</dt><dd>';
                    if ($contact['key'] === 'contact_wechat_qr') {
                        $url = ['/matcher-user-profile/api/media', 'ref' => $contact['value']['file_ref'], 'entry_type' => $context['entry_type']];
                        foreach (['space_id', 'post_id'] as $key) { if (isset($context[$key])) { $url[$key] = $context[$key]; } }
                        $html .= Html::img(\yii\helpers\Url::to($url), ['alt' => $contact['value']['label'] ?? '微信二维码', 'class' => 'img-fluid', 'style' => 'max-width:240px']);
                    } else { $html .= Html::encode(self::value($contact['value'])); }
                    $html .= '</dd></div>';
                }
                if ($contacts !== []) { $html .= '</dl></section>'; }
            } catch (ProfileException $error) {
                if (!in_array($error->httpStatus, [401, 403, 404, 422], true)) { throw $error; }
            }
        }
        if (NativeRequestContext::actorId() === $ownerId) {
            $html .= Html::a('编辑资料与展示范围', ['/matcher-user-profile/editor/index'], ['class' => 'btn btn-primary']);
        }
        return $html . '</div></section>';
    }
}
