<?php
declare(strict_types=1);

namespace Symfony\Component\Mailer\Transport\Smtp {
    final class EsmtpTransport {
        public static int $calls = 0;
        public static bool $fail = false;
        public static bool $stopFails = false;
        public static array $tls = [];
        public function __construct(string $host, int $port, bool $tls) {
            if ($host !== 'smtp.gmail.com' || !in_array($port, [465, 587], true)) { throw new \LogicException('Invalid test SMTP target.'); }
            self::$tls['implicit'] = $tls;
        }
        public function setUsername(string $value): void {}
        public function setPassword(string $value): void {}
        public function setAutoTls(bool $value): void { self::$tls['auto'] = $value; }
        public function setRequireTls(bool $value): void { self::$tls['required'] = $value; }
        public function getStream(): self { return $this; }
        public function setTimeout(int $value): void { self::$tls['timeout'] = $value; }
        public function setStreamOptions(array $value): void { self::$tls['options'] = $value; }
        public function send(object $message): void {
            self::$calls++;
            if (self::$fail) { throw new \RuntimeException('synthetic-private-smtp-transcript'); }
        }
        public function stop(): void { if (self::$stopFails) { throw new \RuntimeException('synthetic-close-failure'); } }
    }
}
namespace Symfony\Component\Mime {
    final class Address { public function __construct(string $email, string $name) {} }
    final class Email {
        public function from(Address $value): self { return $this; }
        public function to(string $value): self { return $this; }
        public function subject(string $value): self { return $this; }
        public function text(string $value): self { return $this; }
    }
}
namespace {
    require __DIR__ . '/auth_runtime.php';
    require dirname(__DIR__, 2) . '/protected/modules/matcher-auth/domain/ports/OtpMailer.php';
    require __DIR__ . '/auth_otp_mailer.php';
    require __DIR__ . '/auth_evidence.php';
    $checks = 0;
    function check(bool $value): void { global $checks; if (!$value) { throw new \LogicException('Offline auth runtime assertion failed.'); } $checks++; }
    $input = ['schema_version' => 1, 'base_url' => 'http://127.0.0.1:8113',
        'github' => ['client_id' => 'synthetic-client', 'client_secret' => 'synthetic-not-a-real-secret', 'callback_url' => 'http://127.0.0.1:8113/user/auth/external?authclient=github'],
        'smtp' => ['host' => 'smtp.gmail.com', 'port' => 587, 'security' => 'starttls', 'username' => 'sender@example.invalid', 'password' => 'synthetic-password', 'from_address' => 'sender@example.invalid', 'from_name' => 'Synthetic test'],
        'verification' => ['test_email' => 'recipient@example.invalid']];
    overnightValidateAuthInput($input); check(true);
    $loader = 'humhub\components\bootstrap\ModuleAutoLoader';
    $language = 'humhub\components\bootstrap\LanguageSelector';
    $boundary = 'humhub\modules\matcherAuth\adapters\http\AuthRequestBootstrap';
    $bootstraps = overnightAuthWebBootstrap(['log', $loader, 'queue', $language]);
    check($bootstraps === ['log', $loader, 'queue', $boundary, $language]);
    check(overnightAuthWebBootstrap($bootstraps) === $bootstraps);
    foreach ([[], [$language, $loader], [$loader, $language, $language], [$loader, $language, $boundary], [$loader, $boundary, $boundary, $language]] as $invalid) {
        try { overnightAuthWebBootstrap($invalid); throw new \LogicException('Invalid bootstrap accepted.'); }
        catch (\RuntimeException) { check(true); }
    }
    foreach ([['base_url', 'http://127.0.0.1:8090'], ['github.callback_url', 'https://invalid.example/callback'],
        ['github.client_secret', "invalid\nsecret"], ['smtp.host', 'invalid.example'], ['smtp.port', 25],
        ['smtp.security', 'none'], ['smtp.password', "invalid\rsecret"], ['verification.test_email', 'invalid']] as [$key, $value]) {
        $bad = $input; $parts = explode('.', $key);
        if (count($parts) === 1) { $bad[$key] = $value; } else { $bad[$parts[0]][$parts[1]] = $value; }
        try { overnightValidateAuthInput($bad); throw new \LogicException('Invalid input accepted.'); }
        catch (\RuntimeException) { check(true); }
    }
    $runtime = sys_get_temp_dir() . '/overnight-auth-offline-' . bin2hex(random_bytes(8));
    mkdir($runtime, 0700);
    try {
        $mailer = new \OvernightOtpMailer($input, $runtime);
        check($mailer->available());
        check(!$mailer->send('other@example.invalid', '123456', 600));
        check(!$mailer->send('recipient@example.invalid', '12345', 600));
        check(!$mailer->send('recipient@example.invalid', '123456', 3600));
        check(\Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport::$calls === 0);
        check($mailer->send('recipient@example.invalid', '123456', 600));
        \Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport::$fail = true;
        check(!$mailer->send('recipient@example.invalid', '123456', 600));
        \Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport::$fail = false;
        \Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport::$stopFails = true;
        check($mailer->send('recipient@example.invalid', '123456', 600));
        check(!$mailer->send('recipient@example.invalid', '123456', 600));
        check(\Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport::$calls === 3);
        $counts = json_decode(file_get_contents($runtime . '/auth-send-count.json'), true, 8, JSON_THROW_ON_ERROR);
        check($counts === ['attempted' => 3, 'accepted' => 2]);
        check((fileperms($runtime . '/auth-send-count.json') & 0777) === 0600);
        check((fileperms($runtime . '/auth-send-count.lock') & 0777) === 0600);
        $tls = \Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport::$tls;
        check($tls['required'] && $tls['auto'] && $tls['timeout'] === 15);
        check($tls['options']['ssl'] === ['verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false]);
    } finally {
        @unlink($runtime . '/auth-send-count.json');
        @unlink($runtime . '/auth-send-count.lock');
        rmdir($runtime);
    }
    foreach (['truncated_after_two', 'empty', 'corrupt', 'missing_after_initialization', 'unsafe_permissions', 'unwritable'] as $case) {
        $runtime = sys_get_temp_dir() . '/overnight-auth-offline-' . bin2hex(random_bytes(8));
        mkdir($runtime, 0700);
        $path = $runtime . '/auth-send-count.json';
        \Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport::$calls = 0;
        \Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport::$fail = false;
        \Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport::$stopFails = false;
        try {
            $mailer = new \OvernightOtpMailer($input, $runtime);
            if ($case === 'truncated_after_two') {
                check($mailer->send('recipient@example.invalid', '123456', 600));
                check($mailer->send('recipient@example.invalid', '123456', 600));
                file_put_contents($path, ''); // Reproduce the interrupted old in-place update.
            } elseif ($case === 'missing_after_initialization') {
                check($mailer->send('recipient@example.invalid', '123456', 600));
                unlink($path);
            } elseif ($case === 'unwritable') {
                file_put_contents($runtime . '/auth-send-count.lock', '');
                chmod($runtime . '/auth-send-count.lock', 0600);
                file_put_contents($path, '{"attempted":1,"accepted":1}');
                chmod($path, 0600);
                chmod($runtime, 0500);
                if (is_writable($runtime)) { continue; } // Root cannot exercise POSIX write denial.
            } else {
                file_put_contents($path, $case === 'corrupt' ? '{' : ($case === 'unsafe_permissions' ? '{"attempted":0,"accepted":0}' : ''));
                chmod($path, $case === 'unsafe_permissions' ? 0644 : 0600);
            }
            $before = \Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport::$calls;
            for ($attempt = 0; $attempt < 3; $attempt++) { check(!$mailer->send('recipient@example.invalid', '123456', 600)); }
            check(\Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport::$calls === $before);
            if ($case === 'unwritable') {
                check(json_decode(file_get_contents($path), true) === ['attempted' => 1, 'accepted' => 1]);
            }
            check(glob($path . '.tmp-*') === []);
        } finally {
            chmod($runtime, 0700);
            @unlink($path);
            @unlink($runtime . '/auth-send-count.lock');
            rmdir($runtime);
        }
    }
    $runtime = sys_get_temp_dir() . '/overnight-auth-evidence-offline-' . bin2hex(random_bytes(8));
    mkdir($runtime, 0700);
    try {
        check(overnightAuthEvidenceSummary($runtime)['available'] === false);
        overnightRecordAuthEvidence($runtime, str_repeat('a', 64), 'login', 'github', 41);
        overnightRecordAuthEvidence($runtime, str_repeat('a', 64), 'me_read', 'github', 41);
        check(overnightAuthEvidenceSummary($runtime)['same_account_verified'] === false);
        overnightRecordAuthEvidence($runtime, str_repeat('a', 64), 'login', 'email-code', 41);
        overnightRecordAuthEvidence($runtime, str_repeat('a', 64), 'me_read', 'email-code', 41);
        $summary = overnightAuthEvidenceSummary($runtime);
        check($summary['same_account_verified'] === true && $summary['distinct_accounts'] === 1);
        check($summary['login'] === ['email-code' => 1, 'github' => 1] && $summary['me_read'] === ['email-code' => 1, 'github' => 1]);
        check(!isset($summary['account_hashes']) && !isset($summary['user_id']));
        check((fileperms($runtime . '/auth-evidence.json') & 0777) === 0600);
        check((fileperms($runtime . '/auth-evidence.lock') & 0777) === 0600);
        overnightRecordAuthEvidence($runtime, str_repeat('a', 64), 'login', 'unknown', 41);
        check(overnightAuthEvidenceSummary($runtime) === $summary);
        overnightRecordAuthEvidence($runtime, str_repeat('a', 64), 'login', 'github', 42);
        check(overnightAuthEvidenceSummary($runtime)['same_account_verified'] === false);
        check(overnightAuthEvidenceSummary($runtime)['distinct_accounts'] === 2);
        file_put_contents($runtime . '/auth-evidence.json', '{');
        overnightRecordAuthEvidence($runtime, str_repeat('a', 64), 'login', 'github', 41);
        check(file_get_contents($runtime . '/auth-evidence.json') === '{');
        check(overnightAuthEvidenceSummary($runtime)['available'] === false);
        check(glob($runtime . '/auth-evidence.json.tmp-*') === []);
    } finally {
        @unlink($runtime . '/auth-evidence.json');
        @unlink($runtime . '/auth-evidence.lock');
        rmdir($runtime);
    }
    echo json_encode(['status' => 'passed', 'checks' => $checks, 'external_calls' => 0,
        'real_credentials_read' => false, 'database_access' => false]), PHP_EOL;
}
