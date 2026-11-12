<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\adapters\native;

use humhub\modules\matcherAuth\adapters\persistence\SqlChallengeStore;
use humhub\modules\matcherAuth\domain\AuthException;
use Yii;
use yii\db\Query;

final class ReceiptService
{
    public const OAUTH = 'matcherAuth.oauthReceipt';
    public const REGISTRATION = 'matcherAuth.registrationReceipt';
    private const BROWSER = 'matcherAuth.browser';
    public function __construct(private SqlChallengeStore $store, private string $secret) {}
    public function browser(): string
    {
        $nonce = Yii::$app->session->get(self::BROWSER);
        if (!is_string($nonce) || preg_match('/^[a-f0-9]{64}$/D', $nonce) !== 1) {
            $nonce = bin2hex(random_bytes(32)); Yii::$app->session->set(self::BROWSER, $nonce);
        }
        return $nonce;
    }
    public function browserHash(): string
    {
        if (strlen($this->secret) < 32) { throw new AuthException('AUTH_UNAVAILABLE', 'Authentication is not configured.', 503); }
        return hash_hmac('sha256', 'receipt-browser' . "\0" . $this->browser(), $this->secret);
    }
    public function issue(string $slot, string $provider, string $purpose, string $subject, string $email, ?int $actorId): array
    {
        if (!in_array($slot, [self::OAUTH, self::REGISTRATION], true)
            || !in_array($provider, ['github', 'email-code'], true) || !in_array($purpose, ['login', 'bind', 'registration'], true)) {
            throw new \LogicException('Unsupported authentication receipt.');
        }
        $now = time();
        $receipt = ['id' => 'receipt-' . bin2hex(random_bytes(24)), 'provider' => $provider, 'subject' => $subject,
            'verified_email' => $email, 'purpose' => $purpose, 'actor_id' => $actorId, 'browser_hash' => $this->browserHash(),
            'created_at' => $now, 'expires_at' => $now + 900, 'status' => 'pending', 'user_id' => null];
        $this->store->transaction(function () use ($slot, $receipt): void {
            $previous = Yii::$app->session->get($slot);
            if (is_string($previous)) {
                $this->store->lock('receipt:' . $previous);
                $this->store->db->createCommand()->update('{{%matcher_auth_receipt}}', ['status' => 'superseded'], ['id' => $previous, 'status' => 'pending', 'browser_hash' => $receipt['browser_hash']])->execute();
            }
            $this->store->db->createCommand()->insert('{{%matcher_auth_receipt}}', $receipt)->execute();
        });
        Yii::$app->session->set($slot, $receipt['id']);
        return $receipt;
    }
    public function read(string $slot): array
    {
        $id = Yii::$app->session->get($slot);
        if (!is_string($id) || preg_match('/^receipt-[a-f0-9]{48}$/D', $id) !== 1) { throw $this->invalid(); }
        $row = (new Query())->from('{{%matcher_auth_receipt}}')->where(['id' => $id])->one($this->store->db);
        return $this->validate($row === false ? null : $row);
    }
    public function locked(string $id): array { return $this->validate($this->store->current('{{%matcher_auth_receipt}}', 'id', $id)); }
    public function consume(array $receipt, ?int $userId = null): void
    {
        $changed = $this->store->db->createCommand()->update('{{%matcher_auth_receipt}}', ['status' => 'consumed', 'user_id' => $userId], ['id' => $receipt['id'], 'status' => 'pending'])->execute();
        if ($changed !== 1) { throw $this->invalid(); }
    }
    public function clear(string $slot): void { Yii::$app->session->remove($slot); }
    private function validate(?array $row): array
    {
        $actor = Yii::$app->user->isGuest ? null : (int)Yii::$app->user->id;
        if ($row === null || $row['status'] !== 'pending' || (int)$row['expires_at'] <= time()
            || !hash_equals((string)$row['browser_hash'], $this->browserHash())
            || ($row['actor_id'] === null ? null : (int)$row['actor_id']) !== $actor) { throw $this->invalid(); }
        $row['actor_id'] = $actor;
        return $row;
    }
    private function invalid(): AuthException { return new AuthException('CHALLENGE_INVALID', 'This authentication continuation is unavailable.'); }
}
