<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\adapters\native;

use humhub\modules\matcherAuth\adapters\http\GithubCurlTransport;
use humhub\modules\matcherAuth\adapters\http\RedactedHttpClient;
use humhub\modules\matcherAuth\domain\AuthPolicy;

final class VerifiedGithubClient extends \humhubContrib\auth\github\authclient\GithubAuth
{
    public function init()
    {
        $this->authUrl = 'https://github.com/login/oauth/authorize';
        $this->tokenUrl = 'https://github.com/login/oauth/access_token';
        $this->apiBaseUrl = 'https://api.github.com';
        $this->scope = 'user:email';
        $this->validateAuthState = true;
        $this->setHttpClient(new RedactedHttpClient(['transport' => GithubCurlTransport::class]));
        parent::init();
    }
    protected function defaultNormalizeUserAttributeMap() { return []; }
    protected function initUserAttributes()
    {
        $account = $this->api('user', 'GET');
        $emails = $this->api('user/emails', 'GET');
        if (!isset($account['id']) || preg_match('/^[1-9][0-9]{0,19}$/D', (string)$account['id']) !== 1 || !is_array($emails)) {
            throw new \RuntimeException('GitHub identity response unavailable.');
        }
        foreach ($emails as $email) {
            if (is_array($email) && ($email['primary'] ?? false) === true && ($email['verified'] ?? false) === true) {
                // No OAuth name, avatar, biography or public profile is copied to HumHub/P1.
                return ['id' => (string)$account['id'], 'email' => AuthPolicy::email($email['email'] ?? null)];
            }
        }
        throw new \RuntimeException('A verified primary GitHub email is required.');
    }
}
