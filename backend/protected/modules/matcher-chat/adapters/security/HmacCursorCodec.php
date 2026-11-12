<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\security;

use humhub\modules\matcherChat\domain\{ChatException, SafeInteger};
use humhub\modules\matcherChat\domain\ports\{Clock, CursorCodec};

final class HmacCursorCodec implements CursorCodec
{
    private const TTL = 900;

    public function __construct(private readonly string $key, private readonly Clock $clock)
    {
        if (strlen($key) < 32) { throw new \InvalidArgumentException('A cursor key must contain at least 32 bytes.'); }
    }

    public function issue(array $scope, int $position): string
    {
        SafeInteger::positive($position, 'cursor_position');
        $now = SafeInteger::nonNegative($this->clock->now(), 'clock_timestamp');
        if ($now > SafeInteger::MAX - self::TTL) { throw new \InvalidArgumentException('The clock timestamp cannot represent cursor expiry.'); }
        $payload = $this->encode(json_encode(['v' => 1, 'scope' => $scope, 'position' => $position, 'iat' => $now, 'exp' => $now + self::TTL], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
        return $payload . '.' . $this->encode(hash_hmac('sha256', $payload, $this->key, true));
    }

    public function read(string $cursor, array $scope): int
    {
        if (strlen($cursor) > 4096 || count($parts = explode('.', $cursor)) !== 2) { $this->invalid(); }
        [$payload, $signature] = $parts;
        if (!hash_equals(hash_hmac('sha256', $payload, $this->key, true), $this->decode($signature))) { $this->invalid(); }
        try { $value = json_decode($this->decode($payload), true, 16, JSON_THROW_ON_ERROR); } catch (\JsonException) { $this->invalid(); }
        if (!is_array($value) || array_keys($value) !== ['v', 'scope', 'position', 'iat', 'exp'] || $value['v'] !== 1 || !is_array($value['scope']) || !is_int($value['iat']) || !is_int($value['exp']) || $value['iat'] < 0 || $value['iat'] > SafeInteger::MAX - self::TTL || $value['exp'] - $value['iat'] !== self::TTL || $value['iat'] > $this->clock->now()) { $this->invalid(); }
        SafeInteger::positive($value['position'], 'cursor_position');
        if ($this->clock->now() >= $value['exp']) { throw new ChatException('CURSOR_EXPIRED', 'The cursor has expired.', 410); }
        if ($value['scope'] !== $scope) { throw new ChatException('CURSOR_CONTEXT_CHANGED', 'The cursor does not match the current read context.', 409); }
        return $value['position'];
    }

    private function encode(string $value): string { return rtrim(strtr(base64_encode($value), '+/', '-_'), '='); }

    private function decode(string $value): string
    {
        if ($value === '' || !preg_match('/^[A-Za-z0-9_-]+$/D', $value)) { $this->invalid(); }
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);
        if ($decoded === false || $this->encode($decoded) !== $value) { $this->invalid(); }
        return $decoded;
    }

    private function invalid(): never { throw new ChatException('INVALID_CURSOR', 'The cursor is invalid.'); }
}
