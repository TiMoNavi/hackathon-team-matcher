<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain\ports;

interface CursorCodec
{
    public function issue(array $scope, int $position): string;
    public function read(string $cursor, array $scope): int;
}
