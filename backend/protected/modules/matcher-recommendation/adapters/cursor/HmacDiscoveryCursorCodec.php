<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\cursor;
use humhub\modules\matcherRecommendation\contracts\DiscoveryCursor;
use humhub\modules\matcherRecommendation\contracts\ports\DiscoveryCursorCodec;
use humhub\modules\matcherRecommendation\domain\BatchReplayException;

/** No environment/config lookup. The composition root alone supplies the signing key. */
final class HmacDiscoveryCursorCodec implements DiscoveryCursorCodec
{
    private const DOMAIN = "matcher-recommendation.cursor.v1\0";
    private const MAX_PAYLOAD_BYTES = 2048;
    private const MAX_TOKEN_BYTES = 4096;

    public function __construct(#[\SensitiveParameter] private readonly string $key)
    {
        if (strlen($key) < 32 || strlen($key) > 4096) { throw new \InvalidArgumentException('A bounded signing key of at least 32 bytes is required.'); }
    }

    /** Signers are process capabilities, never serializable batch state or diagnostic payloads. */
    public function __serialize(): array { throw new \LogicException('Cursor signers cannot be serialized.'); }
    public function __unserialize(#[\SensitiveParameter] array $data): void { throw new \LogicException('Cursor signers cannot be restored from serialized data.'); }
    public function __debugInfo(): array { return ['signing_key' => '[REDACTED]']; }

    public function encode(DiscoveryCursor $cursor): string
    {
        $payload = json_encode($this->payload($cursor), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        if (strlen($payload) > self::MAX_PAYLOAD_BYTES) { throw new BatchReplayException('cursor_invalid'); }
        $encoded = self::base64($payload);
        return 'v1.' . $encoded . '.' . self::base64(hash_hmac('sha256', self::DOMAIN . $encoded, $this->key, true));
    }

    public function decode(string $token): DiscoveryCursor
    {
        try {
            if (strlen($token) > self::MAX_TOKEN_BYTES || !preg_match('/^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/D', $token, $parts)) {
                throw new BatchReplayException('cursor_invalid');
            }
            $payload = self::unbase64($parts[1]); $signature = self::unbase64($parts[2]);
            if (strlen($payload) > self::MAX_PAYLOAD_BYTES || !hash_equals(hash_hmac('sha256', self::DOMAIN . $parts[1], $this->key, true), $signature)) {
                throw new BatchReplayException('cursor_invalid');
            }
            $value = json_decode($payload, true, 16, JSON_THROW_ON_ERROR);
            if (!is_array($value)) { throw new BatchReplayException('cursor_invalid'); }
            $keys = array_keys($value); sort($keys, SORT_STRING);
            $expected = ['batch_id', 'viewer_id', 'space_id', 'context_fingerprint', 'query_hash', 'policy_version', 'policy_fingerprint', 'batch_fingerprint', 'position', 'created_at', 'expires_at'];
            sort($expected, SORT_STRING);
            if ($keys !== $expected) { throw new BatchReplayException('cursor_invalid'); }
            foreach (['viewer_id', 'space_id', 'position'] as $key) { if (!is_int($value[$key])) { throw new BatchReplayException('cursor_invalid'); } }
            foreach (array_diff($expected, ['viewer_id', 'space_id', 'position']) as $key) { if (!is_string($value[$key])) { throw new BatchReplayException('cursor_invalid'); } }
            $cursor = new DiscoveryCursor($value['batch_id'], $value['viewer_id'], $value['space_id'], $value['context_fingerprint'], $value['query_hash'], $value['policy_version'], $value['policy_fingerprint'], $value['batch_fingerprint'], $value['position'], self::date($value['created_at']), self::date($value['expires_at']));
            // Reject duplicate keys, alternate key order, numeric spellings, whitespace and padded base64 variants.
            if (json_encode($this->payload($cursor), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES) !== $payload) { throw new BatchReplayException('cursor_invalid'); }
            return $cursor;
        } catch (\Throwable) { throw new BatchReplayException('cursor_invalid'); }
    }

    private function payload(DiscoveryCursor $cursor): array
    {
        return [
            'batch_id' => $cursor->batchId, 'viewer_id' => $cursor->viewerId, 'space_id' => $cursor->spaceId,
            'context_fingerprint' => $cursor->contextFingerprint, 'query_hash' => $cursor->queryHash,
            'policy_version' => $cursor->policyVersion, 'policy_fingerprint' => $cursor->policyFingerprint,
            'batch_fingerprint' => $cursor->batchFingerprint, 'position' => $cursor->position,
            'created_at' => self::timestamp($cursor->createdAt), 'expires_at' => self::timestamp($cursor->expiresAt),
        ];
    }

    private static function timestamp(\DateTimeImmutable $date): string { return $date->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.u\Z'); }
    private static function date(string $text): \DateTimeImmutable
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/D', $text)) { throw new BatchReplayException('cursor_invalid'); }
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:s.u\Z', $text, new \DateTimeZone('UTC'));
        $errors = \DateTimeImmutable::getLastErrors();
        if ($date === false || ($errors !== false && ($errors['warning_count'] !== 0 || $errors['error_count'] !== 0)) || self::timestamp($date) !== $text) {
            throw new BatchReplayException('cursor_invalid');
        }
        return $date;
    }
    private static function base64(string $bytes): string { return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '='); }
    private static function unbase64(string $text): string
    {
        $value = base64_decode(strtr($text, '-_', '+/'), true);
        if ($value === false || self::base64($value) !== $text) { throw new BatchReplayException('cursor_invalid'); }
        return $value;
    }
}
