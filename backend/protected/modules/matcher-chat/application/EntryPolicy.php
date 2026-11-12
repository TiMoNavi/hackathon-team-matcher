<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\application;

use humhub\modules\matcherChat\domain\{ChatException, SafeInteger};

/** Navigation policy only. A redirect never establishes conversation authority. */
final class EntryPolicy
{
    public static function enabled(bool $configured, mixed $setting): bool
    {
        return $configured && in_array($setting, [true, 1, '1', 'true'], true);
    }

    public static function status(bool $enabled, bool $affected, bool $ready, array $coverage, string $baseUrl): array
    {
        foreach (['native_total', 'managed_total', 'unmanaged_total', 'revoked_total'] as $key) {
            SafeInteger::nonNegative($coverage[$key] ?? null, $key);
        }
        if ($coverage['native_total'] !== $coverage['managed_total'] + $coverage['unmanaged_total']) {
            throw new \LogicException('The native coverage is inconsistent.');
        }
        $state = !$enabled || !$affected ? 'native'
            : (!$ready ? 'paused' : ($coverage['unmanaged_total'] > 0 ? 'unsupported_coverage' : 'takeover'));
        $url = self::base($baseUrl) . '/matcher/chat';
        return ['enabled' => $enabled, 'state' => $state, 'list_url' => $state === 'takeover' ? $url : null,
            'coverage' => $coverage, 'capabilities' => ['read' => $state === 'takeover', 'send' => false, 'group' => false, 'attachments' => false]];
    }

    public static function navigation(string $route, string $method, array $query): ?array
    {
        if ($method !== 'GET') { return null; }
        $route = trim($route, '/');
        $list = in_array($route, ['mail', 'mail/mail', 'mail/mail/index', 'mail/inbox', 'mail/inbox/index'], true);
        if (!$list && $route !== 'mail/mail/show') { return null; }
        if (!array_key_exists('id', $query)) {
            if ($route === 'mail/mail/show') { throw ChatException::unavailable(); }
            return ['kind' => 'list', 'id' => null];
        }
        $id = $query['id'];
        if (is_string($id) && preg_match('/^[1-9][0-9]{0,15}$/D', $id)
            && (strlen($id) < 16 || strcmp($id, (string)SafeInteger::MAX) <= 0)) { $id = (int)$id; }
        if (!is_int($id) || $id <= 0 || $id > SafeInteger::MAX) { throw ChatException::unavailable(); }
        return ['kind' => 'conversation', 'id' => $id];
    }

    public static function target(string $baseUrl, ?int $conversationId): string
    {
        if ($conversationId !== null) { SafeInteger::positive($conversationId, 'conversation_id'); }
        return self::base($baseUrl) . '/matcher/chat' . ($conversationId === null ? '' : '/conversations/' . $conversationId);
    }

    private static function base(string $value): string
    {
        if ($value !== '' && (!preg_match('#^/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$#D', $value))) {
            throw new \LogicException('A fixed same-origin mount is required.');
        }
        return $value;
    }
}
