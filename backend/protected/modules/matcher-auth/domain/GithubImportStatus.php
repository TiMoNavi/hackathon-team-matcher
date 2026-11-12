<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\domain;

/** Projects a durable receipt; never schedules work or exposes an identity. */
final class GithubImportStatus
{
    public static function receipt(?array $intent, array $linkedSubjects, bool $available): array
    {
        if ($intent === null) { return ['state' => 'not_requested', 'source_id' => null]; }
        if (count($linkedSubjects) !== 1 || (string)$linkedSubjects[0] !== (string)$intent['provider_subject']
            || $intent['state'] === 'revoked') { return ['state' => 'revoked', 'source_id' => null]; }
        if (!$available) { return ['state' => 'unavailable', 'source_id' => null]; }
        $state = in_array($intent['state'], ['pending', 'running', 'succeeded', 'failed', 'skipped_existing'], true)
            ? $intent['state'] : 'unavailable';
        $id = $intent['source_id'] ?? null;
        $id = is_string($id) && preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $id) === 1 ? $id : null;
        if ($state === 'succeeded' && $id === null) { return ['state' => 'unavailable', 'source_id' => null]; }
        return ['state' => $state, 'source_id' => in_array($state, ['succeeded', 'failed'], true) ? $id : null];
    }
}
