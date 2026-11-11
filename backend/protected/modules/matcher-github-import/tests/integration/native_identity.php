<?php
declare(strict_types=1);
// Isolated DB only. The transaction restores synthetic users and configuration.
$app = require dirname(__DIR__, 3) . '/matcher-onboarding/tests/integration/s5_http_bootstrap.php';
use humhub\modules\matcherGithubImport\adapters\native\NativeGithubIdentity;
use humhub\modules\user\models\User;
use humhub\modules\user\services\AuthClientUserService;
use humhubContrib\auth\github\authclient\GithubAuth;
$checks = [];
function check(string $name, bool $pass): void { global $checks; if (!$pass) { throw new RuntimeException($name); } $checks[] = $name; }
$module = $app->getModule('auth-github');
if ($module === null || !$module->isEnabled) { throw new RuntimeException('Enable the GitHub login dependency in the isolated S5 clone.'); }
$transaction = $app->db->beginTransaction();
try {
    $user = new User(); $user->username='s5_github_identity_'.bin2hex(random_bytes(4)); $user->email=$user->username.'@example.invalid';$user->status=1;$user->language='en-US';
    if (!$user->save(false)) { throw new RuntimeException('Synthetic identity fixture failed.'); }
    $other = new User();$other->username='s5_github_other_'.bin2hex(random_bytes(4));$other->email=$other->username.'@example.invalid';$other->status=1;$other->language='en-US';$other->save(false);
    $identity = new NativeGithubIdentity($app->db);
    $module->settings->set('enabled',false);$module->settings->set('clientId','');$module->settings->set('clientSecret','');
    $status=$identity->status((int)$user->id);
    check('unconfigured_login_reported',!$status['available'] && !$status['configured'] && $status['reason']==='GITHUB_LOGIN_NOT_CONFIGURED' && $status['login_url']===null);
    $module->settings->set('enabled',true);$module->settings->set('clientId','synthetic-id');$module->settings->set('clientSecret','synthetic-secret');
    $status=$identity->status((int)$user->id);
    check('configured_unlinked_has_native_link_route',!$status['linked'] && $status['reason']==='GITHUB_NOT_LINKED' && str_contains($status['login_url'],'authclient=github'));
    check('configuration_values_never_returned',!str_contains(json_encode($status),'synthetic-secret') && !str_contains(json_encode($status),'synthetic-id'));
    $client = new GithubAuth(['id'=>'github']);$client->setUserAttributes(['id'=>987654321,'login'=>'synthetic-github-login']);
    (new AuthClientUserService($user))->add($client);
    $status=$identity->status((int)$user->id);
    check('native_auth_registration_creates_verified_id',$status['linked'] && $status['available'] && $status['provider_user_id']==='987654321');
    check('does_not_use_humhub_username_as_github_login',$status['username']===null && $status['canonical_url']===null);
    check('console_has_no_claim_of_current_oauth_session',$status['current_auth']===false);
    check('other_account_cannot_inherit_link',!$identity->status((int)$other->id)['linked']);
    $module->settings->set('enabled',false);$module->settings->set('clientId','');$module->settings->set('clientSecret','');
    check('existing_verified_link_allows_public_read_without_current_oauth_config',$identity->status((int)$user->id)['available']);
    $app->db->createCommand()->insert('{{%user_auth}}',['user_id'=>$user->id,'source'=>'github','source_id'=>'987654322'])->execute();
    $status=$identity->status((int)$user->id);
    check('ambiguous_identity_rejected',!$status['available'] && $status['reason']==='GITHUB_IDENTITY_AMBIGUOUS');
    $app->db->createCommand()->delete('{{%user_auth}}',['user_id'=>$user->id,'source'=>'github','source_id'=>'987654322'])->execute();
    (new AuthClientUserService($user))->remove($client);
    check('native_disconnect_immediately_removes_reader_access',!$identity->status((int)$user->id)['available']);
} finally { $transaction->rollBack(); }
check('synthetic_accounts_rolled_back',!User::find()->where(['id'=>$user->id])->exists());
echo json_encode(['status'=>'passed','passed'=>count($checks),'checks'=>$checks,'isolated'=>true,'oauth_callback_tested'=>false,'external_network_calls'=>0],JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES).PHP_EOL;
