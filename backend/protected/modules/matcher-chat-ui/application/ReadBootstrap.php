<?php
declare(strict_types=1);
namespace humhub\modules\matcherChatUi\application;

/** Server session projection for cache partitioning; never an API authorization. */
final class ReadBootstrap
{
    public static function data(string $csrf, string $home, string $login, int $actorId): array
    {
        if ($actorId < 1 || $actorId > 9007199254740991) { throw new \InvalidArgumentException('Invalid actor identifier.'); }
        $data = Bootstrap::data($csrf, $home, $login);
        $data['schema_version'] = 2; $data['integration_stage'] = 'read';
        $data['actor_id'] = $actorId; $data['native_chat_url'] = '/mail/mail/index';
        return $data;
    }

    public static function json(array $data): string
    {
        $actor = $data['actor_id'] ?? null;
        if (!is_int($actor) || $actor < 1 || $actor > 9007199254740991 || ($data['schema_version'] ?? null) !== 2
            || ($data['integration_stage'] ?? null) !== 'read' || ($data['native_chat_url'] ?? null) !== '/mail/mail/index') {
            throw new \InvalidArgumentException('Invalid read bootstrap.');
        }
        $shell = $data; unset($shell['actor_id'], $shell['native_chat_url']);
        $shell['schema_version'] = 1; $shell['integration_stage'] = 'shell';
        Bootstrap::json($shell);
        return json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR);
    }
}
