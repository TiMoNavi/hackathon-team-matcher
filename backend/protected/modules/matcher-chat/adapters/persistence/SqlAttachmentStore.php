<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\persistence;

use humhub\modules\matcherChat\adapters\native\NativeFileStore;
use humhub\modules\matcherChat\domain\{Attachment, AttachmentUpload, AttachmentLifecycle, AttachmentReceipt, ChatException, SafeInteger};

/** Native-file references, durable staging and transactional native-entry binding. */
final class SqlAttachmentStore implements \humhub\modules\matcherChat\domain\ports\AttachmentRepository
{
    public const NATIVE_MODEL = 'humhub\\modules\\mail\\models\\MessageEntry';
    public const STAGED_MODEL = 'humhub\\modules\\matcherChat\\models\\ProtectedAttachment';
    public function __construct(private readonly SqlState $sql, private readonly SqlReadStore $reads, private readonly int $viewerId, private readonly bool $enabled) {}
    public function upload(int $conversationId, AttachmentUpload $upload, string $path, string $requestId): array
    {
        if (!$this->enabled) { throw new ChatException('CHAT_ATTACHMENTS_UNAVAILABLE', 'Attachment uploading is unavailable.', 503); }
        $this->cleanup();
        // Reserve the native File row and key durably BEFORE filesystem I/O. A crash can
        // leave only a reclaimable uploading reservation, never an unreferenced byte store.
        $reservation = $this->reads->run(function () use ($conversationId, $upload): array {
            $this->requireSend($conversationId); $now = $this->now();
            $row = $this->sql->one('SELECT * FROM {{%matcher_chat_attachment}} WHERE message_id=:message AND user_id=:user AND client_upload_id=:key FOR UPDATE', [':message' => $conversationId, ':user' => $this->viewerId, ':key' => $upload->clientUploadId]);
            if ($row !== null) {
                AttachmentLifecycle::replay($row, $upload->payloadHash, $now);
                if ($row['state'] === 'bound') {
                    $sequence = $this->sql->one('SELECT seq,deleted FROM {{%matcher_chat_entry_sequence}} WHERE message_id=:message AND entry_id=:entry FOR UPDATE', [':message' => $conversationId, ':entry' => $row['entry_id']]);
                    if ($sequence === null || (int)$sequence['deleted'] !== 0) { throw new ChatException('ATTACHMENT_UNAVAILABLE', 'The sent attachment is no longer available.', 410); }
                    $message = $this->reads->messageAt($conversationId, (int)$sequence['seq']);
                    if ($message === null || $message->kind === 'deleted' || !in_array($row['attachment_id'], array_map(static fn ($file): string => $file->id, $message->attachments), true)) { throw new ChatException('ATTACHMENT_UNAVAILABLE', 'The sent attachment is no longer available.', 410); }
                }
                if (in_array($row['state'], ['staged', 'bound'], true)) {
                    $this->assertFile($row, $row['state'] === 'bound');
                    (new NativeFileStore($this->sql))->read($row);
                }
                return [$row, true];
            }
            $this->quota($now, true);
            $id = self::uuid(); $guid = self::uuid();
            $nativeTime = (new \DateTimeImmutable('@' . $now))->setTimezone(new \DateTimeZone($this->sql->nativeTimeZone))->format('Y-m-d H:i:s');
            $this->sql->db->createCommand()->insert('{{%file}}', ['guid' => $guid, 'state' => 1, 'public' => 0, 'standalone' => 1,
                'file_name' => $upload->name, 'mime_type' => $upload->mime, 'size' => $upload->size, 'hash_sha1' => $upload->sha1,
                'object_model' => self::STAGED_MODEL, 'object_id' => null, 'sort_order' => 0, 'created_by' => $this->viewerId, 'updated_by' => $this->viewerId,
                'created_at' => $nativeTime, 'updated_at' => $nativeTime])->execute();
            $fileId = SafeInteger::native($this->sql->db->getLastInsertID(), 'file_id');
            $this->sql->db->createCommand()->update('{{%file}}', ['object_id' => $fileId], ['id' => $fileId])->execute();
            $row = ['attachment_id' => $id, 'message_id' => $conversationId, 'user_id' => $this->viewerId, 'client_upload_id' => $upload->clientUploadId,
                'file_id' => $fileId, 'file_guid' => $guid, 'state' => 'uploading', 'name' => $upload->name, 'mime' => $upload->mime, 'size' => $upload->size,
                'sha256' => $upload->sha256, 'payload_hash' => $upload->payloadHash, 'created_at' => $now, 'expires_at' => $now + Attachment::TTL,
                'uploaded_at' => null, 'entry_id' => null, 'position' => null, 'cleaned_at' => null];
            $this->sql->db->createCommand()->insert('{{%matcher_chat_attachment}}', $row)->execute();
            return [$row, false];
        });
        [$row, $replayed] = $reservation;
        if ($row['state'] === 'uploading') {
            $row = $this->reads->run(function () use ($row, $conversationId, $path): array {
                $this->requireSend($conversationId); $current = $this->owned($conversationId, $row['attachment_id']); $now = $this->now();
                if (in_array($current['state'], ['staged', 'bound'], true)) { return $current; }
                if ($current['state'] !== 'uploading' || (int)$current['expires_at'] <= $now) { throw new ChatException('ATTACHMENT_UNAVAILABLE', 'The upload is no longer available.', 410); }
                $this->quota($now, false);
                $this->assertFile($current, false);
                (new NativeFileStore($this->sql))->write($current, $path);
                $this->sql->db->createCommand()->update('{{%matcher_chat_attachment}}', ['state' => 'staged', 'uploaded_at' => $now], ['attachment_id' => $current['attachment_id']])->execute();
                $current['state'] = 'staged'; $current['uploaded_at'] = $now;
                $this->requireSend($conversationId);
                return $current;
            });
        }
        // If the completion commit was ambiguous, retry the same key; the durable
        // reservation and fingerprint recover it without deleting a committed upload.
        return AttachmentReceipt::uploaded(self::project($row), $upload->clientUploadId, $replayed, (int)$row['expires_at'], $requestId);
    }
    public function cancel(int $conversationId, string $attachmentId, string $requestId): array
    {
        Attachment::uuid($attachmentId);
        $row = $this->sql->transaction(function () use ($conversationId, $attachmentId): array {
            $this->actor(); $row = $this->owned($conversationId, $attachmentId);
            $state = AttachmentLifecycle::cancelledState($row, $this->now());
            // Execute explicitly: terminal metadata is committed before physical cleanup.
            $this->sql->db->createCommand()->update('{{%matcher_chat_attachment}}', ['state' => $state], ['attachment_id' => $attachmentId])->execute();
            $row['state'] = $state; return $row;
        });
        $this->reclaim($attachmentId);
        return AttachmentReceipt::cancelled($attachmentId, $row['state'], $requestId);
    }
    public function download(int $conversationId, string $attachmentId): array
    {
        Attachment::uuid($attachmentId);
        return $this->reads->run(function () use ($conversationId, $attachmentId): array {
            $grant = $this->reads->grant($this->viewerId, $conversationId);
            if ($grant === null || !$grant->canRead()) { throw ChatException::unavailable(); }
            $row = $this->sql->one('SELECT a.*,s.seq,s.deleted FROM {{%matcher_chat_attachment}} a INNER JOIN {{%matcher_chat_entry_sequence}} s ON s.entry_id=a.entry_id AND s.message_id=a.message_id WHERE a.attachment_id=:id AND a.message_id=:message FOR UPDATE', [':id' => $attachmentId, ':message' => $conversationId]);
            if ($row === null || $row['state'] !== 'bound' || (int)$row['deleted'] !== 0 || (int)$row['seq'] <= $grant->joinSeq) { throw new ChatException('ATTACHMENT_UNAVAILABLE', 'The attachment is unavailable.', 404); }
            $this->assertFile($row, true); $revision = $this->reads->revision($this->viewerId);
            $bytes = (new NativeFileStore($this->sql))->read($row);
            if ($this->reads->grant($this->viewerId, $conversationId) != $grant || $this->reads->revision($this->viewerId) !== $revision) { throw new ChatException('AUTHORIZATION_CHANGED', 'The download authority changed.', 409); }
            return ['attachment' => self::project($row), 'bytes' => $bytes];
        });
    }
    public function bind(int $conversationId, int $entryId, array $ids): void
    {
        if ($ids === []) { return; }
        if (!$this->enabled) { throw new ChatException('CHAT_ATTACHMENTS_UNAVAILABLE', 'Attachment sending is unavailable.', 503); }
        $this->requireSend($conversationId); $now = $this->now();
        foreach ($ids as $position => $id) {
            $row = $this->owned($conversationId, $id);
            AttachmentLifecycle::bindable($row, $now);
            $this->assertFile($row, false);
            (new NativeFileStore($this->sql))->read($row);
            $this->sql->db->createCommand()->update('{{%file}}', ['object_model' => self::NATIVE_MODEL, 'object_id' => $entryId, 'sort_order' => $position], ['id' => $row['file_id']])->execute();
            $this->sql->db->createCommand()->update('{{%matcher_chat_attachment}}', ['state' => 'bound', 'entry_id' => $entryId, 'position' => $position], ['attachment_id' => $id])->execute();
        }
    }
    public function cleanup(int $limit = 100, bool $requireEnabledActor = true): array
    {
        if ($limit < 1 || $limit > 100) { throw new \InvalidArgumentException('Cleanup limit must be 1 to 100.'); }
        $ids = $this->sql->transaction(function () use ($limit, $requireEnabledActor): array {
            if ($requireEnabledActor) { $this->actor(); } $now = $this->now();
            $rows = $this->sql->all('SELECT attachment_id,state,expires_at FROM {{%matcher_chat_attachment}} WHERE user_id=:user AND cleaned_at IS NULL AND state<>:bound AND (expires_at<=:now OR state IN (:cancelled,:expired,:failed)) ORDER BY created_at,attachment_id LIMIT ' . $limit . ' FOR UPDATE', [':user' => $this->viewerId, ':bound' => 'bound', ':now' => $now, ':cancelled' => 'cancelled', ':expired' => 'expired', ':failed' => 'failed']);
            foreach ($rows as $row) { if (in_array($row['state'], ['uploading', 'staged'], true)) { $this->sql->db->createCommand()->update('{{%matcher_chat_attachment}}', ['state' => 'expired'], ['attachment_id' => $row['attachment_id']])->execute(); } }
            return array_column($rows, 'attachment_id');
        });
        $cleaned = 0; foreach ($ids as $id) { if ($this->reclaim($id)) { ++$cleaned; } }
        return ['selected' => count($ids), 'cleaned' => $cleaned, 'pending' => count($ids) - $cleaned];
    }
    private function reclaim(string $id): bool
    {
        try {
            return $this->sql->transaction(function () use ($id): bool {
                $row = $this->sql->one('SELECT * FROM {{%matcher_chat_attachment}} WHERE attachment_id=:id AND user_id=:user FOR UPDATE', [':id' => $id, ':user' => $this->viewerId]);
                if ($row === null || $row['cleaned_at'] !== null) { return true; }
                if (!in_array($row['state'], ['cancelled', 'expired', 'failed'], true) || $row['entry_id'] !== null) { return false; }
                $file = $this->sql->one('SELECT id FROM {{%file}} WHERE id=:id FOR UPDATE', [':id' => $row['file_id']]);
                if ($file !== null) {
                    $this->assertFile($row, false); (new NativeFileStore($this->sql))->delete($row);
                    $this->sql->db->createCommand()->delete('{{%file}}', ['id' => $row['file_id'], 'guid' => $row['file_guid']])->execute();
                }
                $this->sql->db->createCommand()->update('{{%matcher_chat_attachment}}', ['cleaned_at' => $this->now()], ['attachment_id' => $id])->execute(); return true;
            });
        } catch (\Throwable) { return false; } // Terminal authorization survives storage/SQL cleanup failure; retry later.
    }
    private function quota(int $now, bool $reserve): void
    {
        $recent = $this->sql->all('SELECT uploaded_at FROM {{%matcher_chat_attachment}} WHERE user_id=:user AND uploaded_at>:since ORDER BY uploaded_at,attachment_id LIMIT 20 FOR UPDATE', [':user' => $this->viewerId, ':since' => $now - 60]);
        $staged = [];
        if ($reserve) {
            $staged = $this->sql->all('SELECT attachment_id,expires_at FROM {{%matcher_chat_attachment}} WHERE user_id=:user AND state IN (:uploading,:staged) AND expires_at>:now ORDER BY expires_at,attachment_id LIMIT 20 FOR UPDATE', [':user' => $this->viewerId, ':uploading' => 'uploading', ':staged' => 'staged', ':now' => $now]);
        }
        AttachmentLifecycle::quota(array_map(static fn ($r): int => (int)$r['uploaded_at'], $recent), array_map(static fn ($r): int => (int)$r['expires_at'], $staged), $now, $reserve);
    }
    private function owned(int $conversationId, string $id): array
    {
        $row = $this->sql->one('SELECT * FROM {{%matcher_chat_attachment}} WHERE attachment_id=:id AND message_id=:message AND user_id=:user FOR UPDATE', [':id' => $id, ':message' => $conversationId, ':user' => $this->viewerId]);
        if ($row === null) { throw new ChatException('ATTACHMENT_UNAVAILABLE', 'The attachment is unavailable.', 404); } return $row;
    }
    private function requireSend(int $conversationId): void
    {
        $grant = $this->reads->grant($this->viewerId, $conversationId);
        if ($grant === null || !$grant->canRead()) { throw ChatException::unavailable(); }
        if (!$grant->permissions()['send']) { throw new ChatException('SEND_FORBIDDEN', 'Sending is not currently permitted.', 403); }
        $settings = $this->sql->all('SELECT value FROM {{%setting}} WHERE module_id=:module AND name=:name FOR UPDATE', [':module' => 'matcher-chat', ':name' => 'attachmentsEnabled']);
        if (!$this->enabled || count($settings) !== 1 || !in_array($settings[0]['value'], ['1', 'true'], true)) { throw new ChatException('CHAT_ATTACHMENTS_UNAVAILABLE', 'Attachment uploading is unavailable.', 503); }
    }
    private function actor(): void
    {
        $row = $this->sql->one('SELECT id,status FROM {{%user}} WHERE id=:id FOR UPDATE', [':id' => $this->viewerId]);
        if ($row === null || (int)$row['status'] !== 1) { throw new ChatException('ACCOUNT_UNAVAILABLE', 'The account is unavailable.', 403); }
    }
    private function assertFile(array $row, bool $bound): void
    {
        $file = $this->sql->one('SELECT * FROM {{%file}} WHERE id=:id FOR UPDATE', [':id' => $row['file_id']]);
        if ($file === null || !self::matches($row, $file, $bound)) { throw new ChatException('ATTACHMENT_UNAVAILABLE', 'The native attachment association changed.', 404); }
    }
    public static function matches(array $row, array $file, bool $bound): bool
    {
        return (int)$file['id'] === (int)$row['file_id'] && $file['guid'] === $row['file_guid'] && (int)$file['public'] === 0 && (int)$file['standalone'] === 1
            && (int)$file['created_by'] === (int)$row['user_id'] && $file['file_name'] === $row['name'] && $file['mime_type'] === $row['mime'] && (int)$file['size'] === (int)$row['size']
            && ($bound ? ($file['object_model'] === self::NATIVE_MODEL && (int)$file['object_id'] === (int)$row['entry_id'] && (int)$file['sort_order'] === (int)$row['position']) : ($file['object_model'] === self::STAGED_MODEL && (int)$file['object_id'] === (int)$row['file_id']));
    }
    public static function project(array $row): Attachment { return new Attachment($row['attachment_id'], SafeInteger::native($row['message_id'], 'conversation_id'), $row['name'], $row['mime'], SafeInteger::native($row['size'], 'file_size')); }
    private function now(): int { return SafeInteger::native($this->sql->one('SELECT UNIX_TIMESTAMP() AS now')['now'], 'server_time'); }
    private static function uuid(): string { $bytes = random_bytes(16); $bytes[6] = chr((ord($bytes[6]) & 15) | 64); $bytes[8] = chr((ord($bytes[8]) & 63) | 128); $hex = bin2hex($bytes); return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20); }
}
