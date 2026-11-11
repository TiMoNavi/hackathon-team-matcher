<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\application\interfaces;
interface ProfileMediaStore
{
    /** The HTTP adapter supplies this temporary path; JSON never accepts paths. */
    public function stage(string $temporaryPath, string $kind, string $id): array;
    public function discard(string $id): void;
    public function assertReady(array $metadata): void;
    public function path(array $metadata, string $variant): string;
}
