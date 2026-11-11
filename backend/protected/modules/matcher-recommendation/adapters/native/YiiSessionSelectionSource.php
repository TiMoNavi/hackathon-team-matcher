<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\native;
use humhub\modules\matcherRecommendation\contracts\ContractShape;
use yii\web\{Session, User};

/**
 * Read-only bridge to an authenticated Yii user and a server session.
 * R4 must validate an explicit activity-switch action before writing SESSION_KEY.
 * Merely visiting a Space/controller does not set this selection. No writer or HTTP route exists here.
 */
final class YiiSessionSelectionSource implements ServerSelectionSource
{
    public const SESSION_KEY = 'matcher-recommendation.current-space';

    public function __construct(private readonly User $user, private readonly Session $session) {}

    public function read(): array
    {
        if ($this->user->getIsGuest()) { throw new NativeAccessException('authentication_required'); }
        $actorId = $this->user->getId();
        if ((!is_int($actorId) && !is_string($actorId)) || !preg_match('/^[1-9][0-9]*$/D', (string)$actorId)
            || filter_var($actorId, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) === false) {
            throw new NativeAccessException('authentication_required');
        }
        $selected = $this->session->get(self::SESSION_KEY);
        if (!is_array($selected)) { throw new NativeAccessException('current_event_required'); }
        $keys = array_keys($selected); sort($keys, SORT_STRING);
        if ($keys !== ['actor_id', 'selection_revision', 'space_id']
            || !is_int($selected['actor_id']) || !is_int($selected['space_id']) || $selected['space_id'] <= 0
            || !is_string($selected['selection_revision'])) {
            throw new NativeAccessException('current_event_required');
        }
        try { ContractShape::token($selected['selection_revision']); }
        catch (\InvalidArgumentException $error) { throw new NativeAccessException('current_event_required', $error); }
        if ($selected['actor_id'] !== (int)$actorId) { throw new NativeAccessException('current_event_mismatch'); }
        return $selected;
    }
}
