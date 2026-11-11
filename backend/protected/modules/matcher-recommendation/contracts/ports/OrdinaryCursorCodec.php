<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;

interface OrdinaryCursorCodec
{
    public function encode(array $payload): string;
    public function decode(string $token): array;
}
