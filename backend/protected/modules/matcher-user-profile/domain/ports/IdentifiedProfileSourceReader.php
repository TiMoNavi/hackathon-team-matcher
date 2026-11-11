<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\ports;

/** Optional offline identity validation for self-declared web and text sources. */
interface IdentifiedProfileSourceReader extends ProfileSourceReader
{
    /**
     * No network, persistence or parsing side effects. Never return source text.
     * @return array{external_id:string,canonical_url:?string,label?:string,ownership_basis:string}
     */
    public function identify(int $ownerId, array $input): array;
}
