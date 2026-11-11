<?php
declare(strict_types=1);
namespace humhub\modules\matcherGithubImport\adapters\native;

use humhub\modules\matcherGithubImport\domain\ports\GithubIdentity;
use humhub\modules\matcherProfile\domain\ProfileException;
use Yii;
use yii\db\Connection;
use yii\db\Query;

/** user_auth is written by the native verified OAuth callback, never by this importer. */
final class NativeGithubIdentity implements GithubIdentity
{
    public function __construct(private Connection $db) {}
    public function status(int $ownerId): array
    {
        if ($ownerId < 1) { throw new ProfileException('AUTHENTICATION_REQUIRED', 'Sign in before importing your profile.', 401); }
        $module = Yii::$app->getModule('auth-github');
        $enabled = $module !== null && $module->isEnabled;
        // Only report a boolean. Never return OAuth settings or initialize client attributes.
        $configured = $enabled && (bool)$module->settings->get('enabled')
            && (string)$module->settings->get('clientId', '') !== ''
            && (string)$module->settings->get('clientSecret', '') !== '';
        $ids = (new Query())->select('source_id')->distinct()->from('{{%user_auth}}')
            ->where(['user_id' => $ownerId, 'source' => 'github'])->limit(2)->column($this->db);
        $id = count($ids) === 1 && preg_match('/^[1-9][0-9]{0,19}$/D', (string)$ids[0]) ? (string)$ids[0] : null;
        $linked = $id !== null;
        $current = Yii::$app instanceof \yii\web\Application && !Yii::$app->user->isGuest
            && (int)Yii::$app->user->id === $ownerId && Yii::$app->session->get('currentAuthClientId') === 'github' && $linked;
        $reason = !$enabled ? 'GITHUB_LOGIN_MODULE_UNAVAILABLE' : (count($ids) > 1 ? 'GITHUB_IDENTITY_AMBIGUOUS'
            : (!$linked ? ($configured ? 'GITHUB_NOT_LINKED' : 'GITHUB_LOGIN_NOT_CONFIGURED') : null));
        return ['available' => $enabled && $linked, 'linked' => $linked, 'current_auth' => $current,
            'configured' => $configured, 'provider_user_id' => $id, 'username' => null, 'canonical_url' => null, 'reason' => $reason,
            'login_url' => $configured ? \yii\helpers\Url::to(['/user/auth/external', 'authclient' => 'github']) : null];
    }
}
