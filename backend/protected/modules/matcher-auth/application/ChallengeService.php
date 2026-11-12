<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\application;

use humhub\modules\matcherAuth\domain\AuthException;
use humhub\modules\matcherAuth\domain\AuthPolicy;
use humhub\modules\matcherAuth\domain\ports\ChallengeStore;
use humhub\modules\matcherAuth\domain\ports\OtpMailer;

final class ChallengeService
{
    private \Closure $clock;
    private \Closure $codeGenerator;
    private \Closure $idGenerator;

    public function __construct(private ChallengeStore $store, private OtpMailer $mailer, private string $secret,
        private array $emailAllowlist, ?callable $clock = null, ?callable $codeGenerator = null, ?callable $idGenerator = null)
    {
        if (strlen($secret) < 32) { throw new AuthException('AUTH_UNAVAILABLE', 'Email authentication is not configured.', 503); }
        $this->clock = \Closure::fromCallable($clock ?? time(...));
        $this->codeGenerator = \Closure::fromCallable($codeGenerator ?? static fn(): string => str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT));
        $this->idGenerator = \Closure::fromCallable($idGenerator ?? static fn(): string => 'challenge-' . bin2hex(random_bytes(24)));
        $this->emailAllowlist = array_map(AuthPolicy::email(...), $emailAllowlist);
    }

    public function request(string $email, string $purpose, string $returnTo, string $browser, ?int $actorId): array
    {
        $email = AuthPolicy::email($email);
        AuthPolicy::context($purpose, $actorId, $returnTo);
        if (!$this->mailer->available() || !in_array($email, $this->emailAllowlist, true)) {
            throw new AuthException('AUTH_UNAVAILABLE', 'Email authentication is unavailable for this request.', 503);
        }
        $now = ($this->clock)();
        $code = ($this->codeGenerator)();
        $id = ($this->idGenerator)();
        if (!is_string($code) || preg_match('/^[0-9]{6}$/D', $code) !== 1
            || !is_string($id) || preg_match('/^challenge-[a-f0-9]{48}$/D', $id) !== 1) {
            throw new \LogicException('Invalid authentication entropy provider.');
        }
        $emailHash = $this->hash('email', $email);
        $challenge = $this->store->transaction(function () use ($email, $emailHash, $purpose, $returnTo, $browser, $actorId, $now, $id, $code): array {
            $this->store->lock('email:' . $emailHash);
            $recent = $this->store->recent($emailHash, $now - AuthPolicy::SEND_WINDOW);
            if ($recent !== []) {
                $latest = max(array_column($recent, 'created_at'));
                if ($latest + AuthPolicy::RESEND > $now) { throw AuthPolicy::limited($latest + AuthPolicy::RESEND - $now); }
                if (count($recent) >= AuthPolicy::SEND_LIMIT) { throw AuthPolicy::limited(min(array_column($recent, 'created_at')) + AuthPolicy::SEND_WINDOW - $now); }
            }
            $this->store->invalidate($emailHash, $purpose);
            $value = ['id' => $id, 'email' => $email, 'email_hash' => $emailHash, 'purpose' => $purpose,
                'browser_hash' => $this->hash('browser', $browser), 'actor_id' => $actorId, 'next_url' => $returnTo,
                'code_hash' => $this->hash('code', $id . "\0" . $code), 'created_at' => $now,
                'expires_at' => $now + AuthPolicy::TTL, 'failed_attempts' => 0, 'status' => 'pending'];
            $this->store->save($value);
            return $value;
        });
        try { $sent = $this->mailer->send($email, $code, AuthPolicy::TTL); }
        catch (\Throwable) { $sent = false; }
        $accepted = $this->store->transaction(function () use ($challenge, $sent): bool {
            $this->store->lock('email:' . $challenge['email_hash']);
            $current = $this->store->findLocked($challenge['id']);
            if ($current === null || $current['status'] !== 'pending') { return false; }
            $current['status'] = $sent && $current['expires_at'] > ($this->clock)() ? 'ready' : 'delivery_failed';
            $this->store->save($current);
            return $current['status'] === 'ready';
        });
        if (!$accepted) { throw new AuthException('MAIL_DELIVERY_FAILED', 'The verification email could not be delivered. Request a new code later.', 503); }
        return ['challenge_id' => $challenge['id'], 'expires_in' => AuthPolicy::TTL, 'resend_after' => AuthPolicy::RESEND];
    }

    /** Consume once before resolving native identity/session; no endpoint exposes this proof. */
    public function verify(string $id, string $code, string $browser, ?int $actorId): array
    {
        if (preg_match('/^challenge-[a-f0-9]{48}$/D', $id) !== 1 || preg_match('/^[0-9]{6}$/D', $code) !== 1) {
            throw new AuthException('INVALID_REQUEST', 'Provide the challenge and six-digit code.');
        }
        $candidate = $this->store->find($id);
        if ($candidate === null) { throw new AuthException('CHALLENGE_INVALID', 'This verification request is unavailable.'); }
        $result = $this->store->transaction(function () use ($id, $code, $browser, $actorId, $candidate): array|AuthException {
            $this->store->lock('email:' . $candidate['email_hash']);
            $value = $this->store->findLocked($id);
            if ($value === null || !hash_equals($value['browser_hash'], $this->hash('browser', $browser))
                || $value['actor_id'] !== $actorId) { return new AuthException('CHALLENGE_INVALID', 'This verification request is unavailable.'); }
            if (!in_array($value['email'], $this->emailAllowlist, true)) { return new AuthException('AUTH_UNAVAILABLE', 'Email authentication is unavailable for this request.', 503); }
            $now = ($this->clock)();
            if ($value['status'] === 'consumed') { return new AuthException('CHALLENGE_USED', 'This code has already been used.', 409); }
            if ($value['expires_at'] <= $now) { return new AuthException('CHALLENGE_EXPIRED', 'This code has expired.', 410); }
            if ($value['status'] !== 'ready') { return new AuthException('CHALLENGE_INVALID', 'This verification request is unavailable.'); }
            $attempts = $this->store->attempts($value['email_hash'], $now - AuthPolicy::ATTEMPT_WINDOW);
            if (count($attempts) >= AuthPolicy::ATTEMPT_LIMIT) { return AuthPolicy::limited(min($attempts) + AuthPolicy::ATTEMPT_WINDOW - $now); }
            if ($value['failed_attempts'] >= AuthPolicy::ATTEMPT_LIMIT) { return AuthPolicy::limited($value['expires_at'] - $now); }
            $this->store->attempt($value['email_hash'], $now);
            if (!hash_equals($value['code_hash'], $this->hash('code', $id . "\0" . $code))) {
                $value['failed_attempts']++;
                $this->store->save($value);
                return new AuthException('INVALID_CODE', 'The verification code is incorrect.');
            }
            $value['status'] = 'consumed';
            $this->store->save($value);
            return ['email' => $value['email'], 'purpose' => $value['purpose'], 'actor_id' => $actorId,
                'challenge_id' => $id, 'next_url' => $value['next_url']];
        });
        if ($result instanceof AuthException) { throw $result; }
        return $result;
    }

    private function hash(string $domain, string $value): string { return hash_hmac('sha256', $domain . "\0" . $value, $this->secret); }
}
