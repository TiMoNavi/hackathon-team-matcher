<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\browse;
use humhub\modules\matcherRecommendation\contracts\ports\OrdinaryCursorCodec;
use humhub\modules\matcherRecommendation\domain\browse\DiscoveryException;

final class HmacOrdinaryCursorCodec implements OrdinaryCursorCodec
{
    public function __construct(#[\SensitiveParameter] private readonly string $key)
    { if (strlen($key) < 32 || strlen($key) > 4096) { throw new \InvalidArgumentException('A bounded cursor signing key is required.'); } }
    public function __serialize(): array { throw new \LogicException('Cursor signers cannot be serialized.'); }
    public function __debugInfo(): array { return ['key' => '[REDACTED]']; }
    public function encode(array $payload): string
    {
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR); $encoded = self::base64($json);
        return 'od1.' . $encoded . '.' . self::base64(hash_hmac('sha256', "ordinary-discovery.v1\0" . $encoded, $this->key, true));
    }
    public function decode(string $token): array
    {
        try {
            if (strlen($token) > 4096 || !preg_match('/^od1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/D', $token, $parts)) { throw new \RuntimeException(); }
            if (!hash_equals(self::base64(hash_hmac('sha256', "ordinary-discovery.v1\0" . $parts[1], $this->key, true)), $parts[2])) { throw new \RuntimeException(); }
            $raw = base64_decode(strtr($parts[1], '-_', '+/'), true); if ($raw === false || self::base64($raw) !== $parts[1]) { throw new \RuntimeException(); }
            $payload = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
            if (!is_array($payload) || array_keys($payload) !== ['viewer_id', 'space_id', 'context', 'policy', 'query', 'permissions', 'position', 'created_at', 'expires_at']
                || json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) !== $raw) { throw new \RuntimeException(); }
            return $payload;
        } catch (\Throwable) { throw new DiscoveryException('DISCOVERY_CURSOR_INVALID', 'The cursor signature or format is invalid.', 409); }
    }
    private static function base64(string $bytes): string { return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '='); }
}
