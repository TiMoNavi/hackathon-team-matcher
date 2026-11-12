<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\adapters\native;

use humhub\modules\matcherAuth\Module;
use humhub\modules\matcherAuth\domain\AuthException;
use humhub\modules\matcherAuth\domain\AuthPolicy;
use humhub\modules\user\components\MaintenanceModeGate;
use humhub\modules\user\models\User;
use humhub\modules\user\models\forms\Registration;
use humhub\modules\user\services\AuthClientService;
use humhub\modules\user\services\InviteRegistrationService;
use humhub\modules\user\services\LinkRegistrationService;
use humhub\modules\user\services\UserSourceService;
use Yii;
use yii\authclient\BaseClient;
use yii\db\Query;

final class NativeIdentityService
{
    public function __construct(private Module $module) {}

    public function client(string $provider, string $subject, string $email): BaseClient
    {
        if (!in_array($provider, ['github', 'email-code'], true)) { throw new AuthException('INVALID_REQUEST', 'Unsupported identity provider.'); }
        $client = Yii::$app->authClientCollection->getClient($provider);
        if (!$client instanceof BaseClient || ($provider === 'github' && !$client instanceof VerifiedGithubClient)
            || ($provider === 'email-code' && !$client instanceof EmailCodeClient)) { throw new AuthException('AUTH_UNAVAILABLE', 'Authentication integration is unavailable.', 503); }
        $client->setUserAttributes(['id' => $subject, 'email' => AuthPolicy::email($email)]);
        return $client;
    }

    public function resolve(string $provider, string $subject, string $email, string $purpose, ?int $actorId, ?array $oauthReceipt = null): array
    {
        $email = AuthPolicy::email($email);
        AuthPolicy::context($purpose, $actorId, AuthPolicy::NEXT_URL);
        $this->subject($provider, $subject);
        $client = $this->client($provider, $subject, $email);
        $result = $this->module->store()->transaction(function () use ($provider, $subject, $email, $purpose, $actorId, $client, $oauthReceipt): array {
            $keys = $this->keys($provider, $subject, $email, $actorId);
            if ($oauthReceipt !== null) { $keys[] = 'receipt:' . $oauthReceipt['id']; }
            $this->module->store()->lockMany($keys);
            if ($oauthReceipt !== null) {
                $fresh = $this->module->receipts()->locked($oauthReceipt['id']);
                if ($fresh['provider'] !== $provider || $fresh['purpose'] !== $purpose) { throw new AuthException('CHALLENGE_INVALID', 'Authentication intent changed.'); }
                $this->module->receipts()->consume($fresh);
            }
            $native = $this->nativeIdentity($provider, $subject);
            if ($purpose === 'bind') {
                $user = User::findOne($actorId);
                if (!$user instanceof User || Yii::$app->user->isGuest || (int)Yii::$app->user->id !== $actorId) { throw new AuthException('AUTHENTICATION_REQUIRED', 'Sign in before connecting an identity.', 401); }
                $this->assertLoginAllowed($user, $client);
                if ((int)$user->status !== User::STATUS_ENABLED) { throw new AuthException('ACCOUNT_UNAVAILABLE', 'This account is unavailable.', 403); }
                $this->bind($provider, $subject, $email, $user);
                if ($provider === 'github') { $this->module->imports()->schedule((int)$user->id, $subject, 'explicit_bind'); }
                return ['user' => $user, 'bound' => true, 'registration' => false];
            }
            if ($native !== null) {
                $user = User::findOne((int)$native['user_id']);
                if (!$user instanceof User) { throw new AuthException('ACCOUNT_UNAVAILABLE', 'This account is unavailable.', 403); }
                $this->claim($provider, $subject, (int)$user->id);
                $this->assertLoginAllowed($user, $client);
                return ['user' => $user, 'bound' => false, 'registration' => false];
            }
            if ($this->emailOwners($email) !== []) { throw $this->conflict(); }
            $this->assertMayRegister($client, $email);
            $receipt = $this->module->receipts()->issue(ReceiptService::REGISTRATION, $provider, 'registration', $subject, $email, null);
            return ['registration' => true, 'receipt_id' => $receipt['id'], 'bound' => false];
        });
        if ($oauthReceipt !== null) { $this->module->receipts()->clear(ReceiptService::OAUTH); }
        return $result;
    }

    public function assertMayRegister(BaseClient $client, string $email): void
    {
        if (MaintenanceModeGate::isActive()) { throw new AuthException('ACCOUNT_UNAVAILABLE', 'Registration is unavailable during maintenance.', 403); }
        $userModule = Yii::$app->getModule('user');
        $invited = InviteRegistrationService::createFromRequestOrEmail($email)->isValid() || LinkRegistrationService::createFromRequest()->isValid();
        if (!$invited && !(new AuthClientService($client))->allowSelfRegistration()
            && !in_array($client->getId(), $userModule->allowUserRegistrationFromAuthClientIds, true)) {
            throw new AuthException('ACCOUNT_UNAVAILABLE', 'Registration is not currently allowed.', 403);
        }
        $source = UserSourceService::getCollection()->findUserSourceForAuthClient($client->getId(), ['email' => $email]);
        $allowed = $source->getAllowedAuthClientIds();
        if ($allowed !== [] && !in_array($client->getId(), $allowed, true)) { throw new AuthException('ACCOUNT_UNAVAILABLE', 'This login method is not allowed.', 403); }
        if (!$source instanceof \humhub\modules\user\source\LocalUserSource) {
            throw new AuthException('AUTH_UNAVAILABLE', 'This identity requires its configured source registration workflow.', 503);
        }
    }

    public function assertLoginAllowed(User $user, BaseClient $client): void
    {
        if ((MaintenanceModeGate::isActive() && !$user->isSystemAdmin()) || !UserSourceService::getForUser($user)->isAuthClientAllowed($client->getId())) {
            throw new AuthException('ACCOUNT_UNAVAILABLE', 'This login method is unavailable for the account.', 403);
        }
    }

    public function register(Registration $form, array $receipt): ?User
    {
        $provider = $receipt['provider']; $subject = $receipt['subject']; $email = $receipt['verified_email'];
        $client = $this->client($provider, $subject, $email);
        return $this->module->store()->transaction(function () use ($form, $receipt, $provider, $subject, $email, $client): ?User {
            $this->module->store()->lockMany([...$this->keys($provider, $subject, $email, null), 'receipt:' . $receipt['id']]);
            $fresh = $this->module->receipts()->locked($receipt['id']);
            if ($fresh['purpose'] !== 'registration' || $fresh['provider'] !== $provider || $fresh['subject'] !== $subject || $fresh['verified_email'] !== $email) {
                throw new AuthException('CHALLENGE_INVALID', 'Registration proof changed.');
            }
            $this->assertMayRegister($client, $email);
            if ($this->nativeIdentity($provider, $subject) !== null || $this->emailOwners($email) !== []) { throw $this->conflict(); }
            // Re-pin system and verified identity fields after HForm has loaded the submitted fields.
            $form->getUser()->email = $email;
            $form->getUser()->user_source = 'local';
            $form->getUser()->status = User::STATUS_ENABLED;
            if (!$form->register(null)) { return null; }
            $user = $form->getUser();
            $this->bind($provider, $subject, $email, $user);
            $this->module->receipts()->consume($fresh, (int)$user->id);
            if ($provider === 'github') { $this->module->imports()->schedule((int)$user->id, $subject, 'first_registration'); }
            return $user;
        });
    }

    private function bind(string $provider, string $subject, string $email, User $user): void
    {
        $owner = (int)$user->id;
        $native = $this->nativeIdentity($provider, $subject);
        if ($native !== null && (int)$native['user_id'] !== $owner) { throw $this->conflict(); }
        foreach ($this->emailOwners($email) as $candidate) { if ((int)$candidate['id'] !== $owner) { throw $this->conflict(); } }
        $others = $this->rows('SELECT id,user_id,source_id FROM {{%user_auth}} WHERE user_id=:owner AND source=:provider', [':owner' => $owner, ':provider' => $provider]);
        foreach ($others as $other) { if ((string)$other['source_id'] !== $subject) { throw $this->conflict(); } }
        $this->claim($provider, $subject, $owner);
        if ($native === null) { $this->module->store()->db->createCommand()->insert('{{%user_auth}}', ['user_id' => $owner, 'source' => $provider, 'source_id' => $subject])->execute(); }
        $verified = $this->nativeIdentity($provider, $subject);
        if ($verified === null || (int)$verified['user_id'] !== $owner) { throw $this->conflict(); }
    }

    private function claim(string $provider, string $subject, int $owner): void
    {
        $values = ['provider' => $provider, 'subject_hash' => hash('sha256', $subject)];
        $this->module->store()->db->createCommand()->upsert('{{%matcher_auth_identity_claim}}', [...$values, 'user_id' => $owner], false)->execute();
        $rows = $this->rows('SELECT user_id FROM {{%matcher_auth_identity_claim}} WHERE provider=:provider AND subject_hash=:subject', [':provider' => $provider, ':subject' => $values['subject_hash']]);
        if (count($rows) !== 1 || (int)$rows[0]['user_id'] !== $owner) { throw $this->conflict(); }
    }
    private function nativeIdentity(string $provider, string $subject): ?array
    {
        $rows = $this->rows('SELECT id,user_id,source_id FROM {{%user_auth}} WHERE source=:provider AND source_id=:subject', [':provider' => $provider, ':subject' => $subject]);
        if (count($rows) > 1) { throw $this->conflict(); }
        return $rows[0] ?? null;
    }
    private function emailOwners(string $email): array { return $this->rows('SELECT id FROM {{%user}} WHERE email=:email', [':email' => $email]); }
    private function rows(string $sql, array $params): array
    {
        if ($this->module->store()->db->driverName !== 'sqlite') { $sql .= ' FOR UPDATE'; }
        return $this->module->store()->db->createCommand($sql, $params)->queryAll();
    }
    private function keys(string $provider, string $subject, string $email, ?int $actor): array
    {
        return ['native-email:' . hash('sha256', $email), 'native-identity:' . $provider . ':' . hash('sha256', $subject), 'native-actor:' . ($actor ?? 0)];
    }
    private function subject(string $provider, string $subject): void
    {
        if (($provider === 'github' && preg_match('/^[1-9][0-9]{0,19}$/D', $subject) === 1)
            || ($provider === 'email-code' && AuthPolicy::email($subject) === $subject)) { return; }
        throw new AuthException('INVALID_REQUEST', 'Invalid verified identity.');
    }
    private function conflict(): AuthException { return new AuthException('IDENTITY_CONFLICT', 'This identity is already associated with an account. Sign in to that account before explicitly connecting it.', 409); }
}
