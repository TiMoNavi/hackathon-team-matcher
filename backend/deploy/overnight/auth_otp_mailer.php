<?php
declare(strict_types=1);

/** Validation-only adapter: one mailbox, TLS, three real attempts total, no message logging. */
final class OvernightOtpMailer implements \humhub\modules\matcherAuth\domain\ports\OtpMailer
{
    public const MAX_REAL_ATTEMPTS = 3;

    public function __construct(private array $input, private string $runtime)
    {
        overnightValidateAuthInput($input);
    }

    public function available(): bool
    {
        return function_exists('stream_socket_client') && extension_loaded('openssl');
    }

    public function send(string $email, string $code, int $expiresIn): bool
    {
        if (!$this->available() || !hash_equals(strtolower($this->input['verification']['test_email']), strtolower($email))
            || preg_match('/^[0-9]{6}$/D', $code) !== 1 || $expiresIn !== 600) {
            return false;
        }
        $path = $this->runtime . '/auth-send-count.json';
        $lockPath = $this->runtime . '/auth-send-count.lock';
        $oldUmask = umask(0077);
        try { $stream = @fopen($lockPath, 'x+b'); }
        finally { umask($oldUmask); }
        $createdLock = $stream !== false;
        if (!$createdLock) {
            clearstatcache(true, $lockPath);
            if (is_link($lockPath) || !is_file($lockPath) || (fileperms($lockPath) & 0777) !== 0600) { return false; }
            $stream = @fopen($lockPath, 'r+b');
        }
        if (!$stream) { return false; }
        try {
            if (!flock($stream, LOCK_EX)) { return false; }
            clearstatcache(true, $path);
            if (is_link($path)) { return false; }
            if (file_exists($path)) {
                if (!is_file($path) || (fileperms($path) & 0777) !== 0600) { return false; }
                $raw = @file_get_contents($path);
                // An existing empty/damaged ledger is evidence of failure, never a fresh budget.
                if ($raw === false || $raw === '') { return false; }
                $counts = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
            } else {
                // Only the first lock creator may initialize. Missing later ledgers fail closed.
                if (!$createdLock) { return false; }
                $counts = ['attempted' => 0, 'accepted' => 0];
            }
            if (!is_array($counts) || !is_int($counts['attempted'] ?? null) || !is_int($counts['accepted'] ?? null)
                || $counts['attempted'] < 0 || $counts['accepted'] < 0 || $counts['accepted'] > $counts['attempted']
                || $counts['attempted'] >= self::MAX_REAL_ATTEMPTS) { return false; }
            $counts['attempted']++;
            $this->saveCounts($path, $counts); // Persist the reservation before any SMTP activity.
            $smtp = $this->input['smtp'];
            $transport = new \Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport('smtp.gmail.com', $smtp['port'], $smtp['security'] === 'smtps');
            $transport->setUsername($smtp['username']);
            $transport->setPassword($smtp['password']);
            $transport->setAutoTls(true);
            $transport->setRequireTls(true);
            $transport->getStream()->setTimeout(15);
            $transport->getStream()->setStreamOptions(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false]]);
            $message = (new \Symfony\Component\Mime\Email())
                ->from(new \Symfony\Component\Mime\Address($smtp['from_address'], $smtp['from_name']))
                ->to($email)->subject('Team Matcher 登录验证码')
                ->text('你的验证码是 ' . $code . '，有效期10分钟。请仅在你本人打开的本机活动应用中输入。');
            try { $transport->send($message); }
            catch (\Throwable $error) {
                try { $transport->stop(); } catch (\Throwable) {}
                return false;
            }
            $counts['accepted']++;
            $this->saveCounts($path, $counts);
            try { $transport->stop(); } catch (\Throwable) {}
            return true;
        } catch (\Throwable $error) {
            // SMTP transcripts can contain credentials or recipient details. Never log the exception.
            return false;
        } finally {
            flock($stream, LOCK_UN);
            fclose($stream);
        }
    }

    private function saveCounts(string $path, array $counts): void
    {
        // The separate lock inode is never replaced or removed. Readers see a complete ledger.
        $temporary = $path . '.tmp-' . bin2hex(random_bytes(8));
        $oldUmask = umask(0077);
        try { $output = @fopen($temporary, 'x+b'); }
        finally { umask($oldUmask); }
        if (!$output) { throw new \RuntimeException('Could not reserve authentication send budget.'); }
        try {
            $json = json_encode($counts, JSON_THROW_ON_ERROR);
            if (fwrite($output, $json) !== strlen($json) || !fflush($output) || !fsync($output)) {
                throw new \RuntimeException('Could not persist authentication send budget.');
            }
            fclose($output);
            $output = null;
            if (!@rename($temporary, $path)) { throw new \RuntimeException('Could not replace authentication send budget.'); }
        } finally {
            if (is_resource($output)) { fclose($output); }
            if (is_file($temporary)) { @unlink($temporary); }
        }
    }
}
