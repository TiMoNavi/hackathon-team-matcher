<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\native;
use yii\web\{Session, User};

/** Bridges an already authenticated, active server session. It neither starts nor rewrites sessions. */
final class YiiActorSessionSource implements ServerActorSessionSource
{
    public function __construct(private readonly User $user, private readonly Session $session) {}

    public function read(): array
    {
        try {
            if ($this->user->getIsGuest()) { throw new NativeAccessException('authentication_required'); }
            $actorId = $this->user->getId();
            if ((!is_int($actorId) && !is_string($actorId)) || !preg_match('/^[1-9][0-9]*$/D', (string)$actorId)
                || filter_var($actorId, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) === false) {
                throw new NativeAccessException('authentication_required');
            }
            if (!$this->session->getIsActive()) { throw new NativeAccessException('authentication_required'); }
            $sessionId = $this->session->getId();
            if (!is_string($sessionId) || $sessionId === '' || strlen($sessionId) > 256 || preg_match('/[\x00-\x20\x7f]/', $sessionId)) {
                throw new NativeAccessException('authentication_required');
            }
            return ['actor_id' => (int)$actorId, 'session_hash' => hash('sha256', 'matcher-recommendation-session-v1' . "\0" . $sessionId)];
        } catch (NativeAccessException $error) { throw new NativeAccessException($error->reason); }
        catch (\Throwable) {
            // User/session backends may include cookies or raw session IDs in exceptions.
            throw new NativeAccessException('dependency_unavailable');
        }
    }
}
