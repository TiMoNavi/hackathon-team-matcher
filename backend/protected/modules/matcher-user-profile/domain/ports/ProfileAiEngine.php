<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\ports;

/** Optional model boundary. No database writes or implicit user confirmation. */
interface ProfileAiEngine
{
    /** Public capability metadata only; no credentials, private paths or network request. */
    public function status(): array;
    /** Return ['data' => validated output, 'metrics' => actual call/model/usage metadata]. */
    public function generate(string $operation, array $input): array;
}
