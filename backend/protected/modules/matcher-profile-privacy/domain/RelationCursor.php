<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\domain;
use humhub\modules\matcherProfile\domain\ProfileException;
final class RelationCursor
{
    public function __construct(private string $secret) { if (strlen($secret) < 32) { throw new \InvalidArgumentException('A cursor signing secret is required.'); } }
    public function encode(array $data): string
    { $payload = $this->base64(json_encode($data, JSON_THROW_ON_ERROR)); return $payload . '.' . $this->base64(hash_hmac('sha256', $payload, $this->secret, true)); }
    public function decode(string $cursor): array
    {
        if (strlen($cursor) > 4096 || !preg_match('/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/D', $cursor, $matches) || !hash_equals($this->base64(hash_hmac('sha256', $matches[1] ?? '', $this->secret, true)), $matches[2] ?? '')) { $this->invalid(); }
        try { $data = json_decode(base64_decode(strtr($matches[1], '-_', '+/'), true), true, 16, JSON_THROW_ON_ERROR); }
        catch (\Throwable) { $this->invalid(); }
        if (!is_array($data) || array_is_list($data)) { $this->invalid(); }
        return $data;
    }
    private function base64(string $value): string { return rtrim(strtr(base64_encode($value), '+/', '-_'), '='); }
    private function invalid(): never { throw new ProfileException('RELATION_CURSOR_INVALID', 'Invalid relation cursor.', 409); }
}
