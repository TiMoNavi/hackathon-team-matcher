<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth;

use humhub\modules\matcherAuth\application\ChallengeService;
use humhub\modules\matcherAuth\adapters\native\NativeMailer;
use humhub\modules\matcherAuth\adapters\native\NativeIdentityService;
use humhub\modules\matcherAuth\adapters\native\ReceiptService;
use humhub\modules\matcherAuth\adapters\native\GithubImportCoordinator;
use humhub\modules\matcherAuth\adapters\persistence\SqlChallengeStore;
use humhub\modules\matcherAuth\domain\ports\OtpMailer;
use Yii;

final class Module extends \humhub\components\Module
{
    public string $challengeSecret = '';
    public bool $emailEnabled = false;
    public array $emailAllowlist = [];
    public bool $githubEnabled = true;
    public ?OtpMailer $mailAdapter = null;
    public bool $integrationReady = false;
    private ?SqlChallengeStore $store = null;

    // Runtime configuration is injected after application construction; init performs no secret/transport check.
    public function store(): SqlChallengeStore { return $this->store ??= new SqlChallengeStore(Yii::$app->db); }
    public function mailer(): OtpMailer { return $this->mailAdapter ??= new NativeMailer(); }
    public function challenges(): ChallengeService { return new ChallengeService($this->store(), $this->mailer(), $this->challengeSecret, $this->emailAllowlist); }
    public function receipts(): ReceiptService { return new ReceiptService($this->store(), $this->challengeSecret); }
    public function identities(): NativeIdentityService { return new NativeIdentityService($this); }
    public function imports(): GithubImportCoordinator { return new GithubImportCoordinator($this); }
    public function emailAvailable(): bool
    {
        return $this->integrationReady && $this->emailEnabled && strlen($this->challengeSecret) >= 32 && $this->emailAllowlist !== [] && $this->mailer()->available();
    }
    public function githubAvailable(): bool
    {
        $github = Yii::$app->getModule('auth-github');
        return $this->integrationReady && $this->githubEnabled && strlen($this->challengeSecret) >= 32 && function_exists('curl_exec')
            && $github !== null && $github->isEnabled && (bool)$github->settings->get('enabled')
            && (string)$github->settings->get('clientId', '') !== '' && (string)$github->settings->get('clientSecret', '') !== '';
    }
}
