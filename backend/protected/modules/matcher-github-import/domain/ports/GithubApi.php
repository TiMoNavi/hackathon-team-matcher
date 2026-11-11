<?php
declare(strict_types=1);
namespace humhub\modules\matcherGithubImport\domain\ports;

interface GithubApi
{
    public function beginRead(): void;
    /** JSON from fixed public GitHub endpoints; null only for an optional 404. */
    public function get(string $path, array $query = [], bool $optional = false): ?array;
}
