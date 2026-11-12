<?php
declare(strict_types=1);

/** Private fixed-origin authentication configuration. Never return values to HTTP or logs. */
function overnightReadAuthInput(string $backend): array
{
    $path = $backend . '/.runtime/overnight-auth-input.json';
    if (!is_file($path) || is_link($path) || (fileperms($path) & 0777) !== 0600) {
        throw new RuntimeException('Authentication input permissions refused.');
    }
    $input = json_decode(file_get_contents($path), true, 16, JSON_THROW_ON_ERROR);
    overnightValidateAuthInput($input);
    return $input;
}

function overnightValidateAuthInput(mixed $input): void
{
    if (!is_array($input) || ($input['schema_version'] ?? null) !== 1
        || ($input['base_url'] ?? null) !== 'http://127.0.0.1:8113'
        || ($input['github']['callback_url'] ?? null) !== 'http://127.0.0.1:8113/user/auth/external?authclient=github') {
        throw new RuntimeException('Authentication origin or callback refused.');
    }
    foreach (['client_id', 'client_secret'] as $key) {
        $value = $input['github'][$key] ?? null;
        if (!is_string($value) || $value === '' || strlen($value) > 256 || preg_match('/[\x00-\x20\x7f]/', $value)) {
            throw new RuntimeException('GitHub credential shape refused.');
        }
    }
    $smtp = $input['smtp'] ?? [];
    if (($smtp['host'] ?? null) !== 'smtp.gmail.com'
        || !in_array([$smtp['security'] ?? null, $smtp['port'] ?? null], [['starttls', 587], ['smtps', 465]], true)) {
        throw new RuntimeException('Only the designated TLS SMTP transport is permitted.');
    }
    foreach ([$smtp['username'] ?? null, $smtp['from_address'] ?? null, $input['verification']['test_email'] ?? null] as $email) {
        if (!is_string($email) || strlen($email) > 254 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            throw new RuntimeException('Authentication mailbox configuration refused.');
        }
    }
    foreach (['password', 'from_name'] as $key) {
        if (!is_string($smtp[$key] ?? null) || $smtp[$key] === '' || strlen($smtp[$key]) > 256
            || preg_match('/[\r\n\x00]/', $smtp[$key])) {
            throw new RuntimeException('SMTP credential shape refused.');
        }
    }
}

function overnightAuthSecret(string $runtime): string
{
    $file = $runtime . '/auth-hmac.key';
    if (!is_file($file) || is_link($file) || (fileperms($file) & 0777) !== 0600) {
        throw new RuntimeException('Authentication key permissions refused.');
    }
    $key = file_get_contents($file);
    if (!is_string($key) || preg_match('/^[a-f0-9]{64}$/D', $key) !== 1) {
        throw new RuntimeException('Authentication key shape refused.');
    }
    return $key;
}

function overnightAuthConfigureApplication(array &$config, array $input, string $runtime): void
{
    $config['modules']['matcher-auth'] = [
        'challengeSecret' => overnightAuthSecret($runtime),
        'emailEnabled' => true,
        'emailAllowlist' => [$input['verification']['test_email']],
        'githubEnabled' => true,
    ];
    // Explicit external clients only; native account approval/status gates remain unchanged.
    $config['modules']['user']['allowUserRegistrationFromAuthClientIds'] = ['github', 'email-code'];
    $config['modules']['user']['showRegistrationForm'] = false;
}

function overnightAuthWebBootstrap(array $bootstrap): array
{
    $autoload = 'humhub\components\bootstrap\ModuleAutoLoader';
    $language = 'humhub\components\bootstrap\LanguageSelector';
    $boundary = 'humhub\modules\matcherAuth\adapters\http\AuthRequestBootstrap';
    $bootstrap = array_values($bootstrap);
    $loaderIndex = array_search($autoload, $bootstrap, true);
    $languageIndex = array_search($language, $bootstrap, true);
    if ($loaderIndex === false || $languageIndex === false || $loaderIndex >= $languageIndex
        || count(array_keys($bootstrap, $autoload, true)) !== 1 || count(array_keys($bootstrap, $language, true)) !== 1) {
        throw new RuntimeException('Authentication bootstrap order refused.');
    }
    $boundaryIndex = array_search($boundary, $bootstrap, true);
    if ($boundaryIndex !== false) {
        if ($boundaryIndex <= $loaderIndex || $boundaryIndex >= $languageIndex || count(array_keys($bootstrap, $boundary, true)) !== 1) {
            throw new RuntimeException('Authentication bootstrap boundary refused.');
        }
        return $bootstrap;
    }
    array_splice($bootstrap, $languageIndex, 0, [$boundary]);
    return $bootstrap;
}

function overnightAuthAttachMailer(object $app, array $input, string $runtime): void
{
    require_once __DIR__ . '/auth_otp_mailer.php';
    $module = $app->getModule('matcher-auth');
    if (!$module instanceof \humhub\modules\matcherAuth\Module || !$module->isEnabled) {
        throw new RuntimeException('Authentication module is not enabled.');
    }
    $module->mailAdapter = new OvernightOtpMailer($input, $runtime);
}
