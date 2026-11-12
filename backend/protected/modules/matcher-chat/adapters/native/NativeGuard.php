<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\native;

use humhub\modules\matcherChat\adapters\persistence\SqlState;
use humhub\modules\matcherChat\domain\SafeInteger;
use yii\web\HttpException;

/** Conservative isolation guard. It does not claim complete native compatibility. */
final class NativeGuard
{
    public function __construct(private readonly SqlState $sql) {}

    public function hasAny(): bool { return $this->sql->one('SELECT message_id FROM {{%matcher_chat_conversation}} LIMIT 1') !== null; }
    public function managed(mixed $id): bool
    {
        $id = $this->id($id);
        return $id !== null && $this->sql->one('SELECT message_id FROM {{%matcher_chat_conversation}} WHERE message_id=:id', [':id' => $id]) !== null;
    }
    public function viewerManaged(mixed $id): bool
    {
        $id = $this->id($id);
        return $id !== null && ($this->sql->one('SELECT message_id FROM {{%matcher_chat_member}} WHERE user_id=:id LIMIT 1', [':id' => $id]) !== null
            || $this->sql->one('SELECT c.message_id FROM {{%matcher_chat_conversation}} c INNER JOIN {{%user_message}} m ON m.message_id=c.message_id WHERE m.user_id=:id LIMIT 1', [':id' => $id]) !== null);
    }
    public function entryManaged(mixed $id): bool
    {
        $id = $this->id($id);
        if ($id === null) { return false; }
        return $this->sql->one('SELECT c.message_id FROM {{%matcher_chat_conversation}} c INNER JOIN {{%message_entry}} e ON e.message_id=c.message_id WHERE e.id=:id', [':id' => $id]) !== null
            || $this->sql->one('SELECT message_id FROM {{%matcher_chat_entry_sequence}} WHERE entry_id=:id', [':id' => $id]) !== null;
    }
    public function fileManaged(mixed $guid): bool
    {
        if (!is_string($guid) || $guid === '' || strlen($guid) > 128) { return false; }
        $file = $this->sql->one('SELECT object_model,object_id FROM {{%file}} WHERE guid=:guid', [':guid' => $guid]);
        return $file !== null && $this->fileAssociationManaged($file['object_model'], $file['object_id']);
    }
    public function fileAssociationManaged(mixed $model, mixed $id): bool
    {
        if (!is_string($model)) { return false; }
        $model = ltrim($model, '\\');
        if (!in_array($model, ['humhub\\modules\\mail\\models\\MessageEntry', 'humhub\\modules\\mail\\models\\AbstractMessageEntry', 'humhub\\modules\\mail\\models\\states\\MessageUserJoined', 'humhub\\modules\\mail\\models\\states\\MessageUserLeft'], true)) { return false; }
        if ($this->id($id) === null) { $this->deny(); }
        return $this->entryManaged($id);
    }

    /** Run before action construction: DownloadAction::init may already load/token-authorize a file. */
    public function request(string $route, array $query, array $body, ?int $viewerId): void
    {
        $route = trim($route, '/');
        if ($route === 'file' || str_starts_with($route, 'file/')) {
            foreach ([$query, $body] as $input) {
                if (array_key_exists('guid', $input) && (!is_string($input['guid']) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/D', $input['guid']))) { $this->deny(); }
            }
        }
        foreach ([$query['guid'] ?? null, $body['guid'] ?? null] as $guid) { if ($this->fileManaged($guid)) { $this->deny(); } }
        // REST replaces the session actor later. Fail closed for its entire mail surface.
        if (str_starts_with($route, 'mail/rest/') && $this->hasAny()) { $this->deny(); }
        if (str_starts_with($route, 'mail/')) {
            foreach (['id', 'messageId', 'entryId'] as $key) {
                foreach ([$query, $body] as $input) {
                    if (array_key_exists($key, $input) && $this->id($input[$key]) === null) { $this->deny(); }
                }
            }
            $action = basename($route);
            $id = $query['id'] ?? $body['id'] ?? null;
            $messageId = $query['messageId'] ?? $body['messageId'] ?? null;
            $entryAction = in_array($action, ['edit-entry', 'delete-entry'], true);
            if (($entryAction ? $this->entryManaged($id) : $this->managed($id)) || $this->managed($messageId) || $this->entryManaged($query['entryId'] ?? $body['entryId'] ?? null)) { $this->deny(); }
            // Native actions often combine an unrelated object with whole-inbox counts or
            // widgets. A harmless/unknown id must not exempt those mixed projections.
            if ($this->viewerManaged($viewerId)) { $this->deny(); }
        }
        if ($route === 'meta-search/index' && $this->viewerManaged($viewerId)) {
            // The native controller only consumes POST provider. A query fallback must
            // not disguise an unparsed body, and PHP class names are case-insensitive.
            $provider = $body['provider'] ?? null;
            if (!is_string($provider)) { $this->deny(); }
            $provider = ltrim($provider, '\\');
            if ($provider === '' || strcasecmp($provider, 'humhub\\modules\\mail\\search\\SearchProvider') === 0) { $this->deny(); }
        }
        // No per-conversation queue projection exists yet. This also suppresses other live
        // notifications for these isolated users; it is an explicit production blocker.
        if (str_starts_with($route, 'live/') && $this->viewerManaged($viewerId)) { $this->deny(); }
    }

    public function nativeWrite(object $record): void
    {
        if ($record instanceof \humhub\modules\mail\models\Message) {
            foreach ([$record->id, $record->getOldAttribute('id')] as $id) {
                if ($id !== null && ($this->id($id) === null || $this->managed($id))) { $this->deny(); }
            }
        } elseif ($record instanceof \humhub\modules\mail\models\AbstractMessageEntry || $record instanceof \humhub\modules\mail\models\UserMessage) {
            foreach ([$record->message_id, $record->getOldAttribute('message_id')] as $id) {
                if ($id !== null && ($this->id($id) === null || $this->managed($id))) { $this->deny(); }
            }
        } elseif ($record instanceof \humhub\modules\file\models\File) {
            if ($this->fileAssociationManaged($record->object_model, $record->object_id) || $this->fileAssociationManaged($record->getOldAttribute('object_model'), $record->getOldAttribute('object_id'))) { $this->deny(); }
        }
    }

    /** Any status/delete transition permanently revokes admitted direct history for that pair. */
    public function invalidateIdentity(int $userId): void
    {
        $operation = function () use ($userId): void {
            $this->sql->one('SELECT id FROM {{%matcher_chat_lock}} WHERE id=1 FOR UPDATE');
            $rows = $this->sql->all('SELECT message_id FROM {{%matcher_chat_member}} WHERE user_id=:user ORDER BY message_id FOR UPDATE', [':user' => $userId]);
            foreach ($rows as $row) { $this->sql->revoke(SafeInteger::native($row['message_id'], 'conversation_id'), 'native-identity-changed'); }
        };
        if ($this->sql->db->getTransaction()?->getIsActive()) { $operation(); }
        else { $this->sql->transaction($operation); }
    }

    private function id(mixed $value): ?int
    {
        if (is_int($value) && $value > 0 && $value <= SafeInteger::MAX) { return $value; }
        if (is_string($value) && preg_match('/^[1-9][0-9]{0,15}$/D', $value) && (strlen($value) < 16 || strcmp($value, (string)SafeInteger::MAX) <= 0)) { return (int)$value; }
        return null;
    }
    private function deny(): never { throw new HttpException(404, 'This native chat entry is unavailable during isolated read integration.'); }
}
