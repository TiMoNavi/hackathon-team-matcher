<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\DiscoveryCursor;

interface DiscoveryCursorCodec
{
    /** Only application-selected next positions are issued. Signing does not grant access. */
    public function encode(DiscoveryCursor $cursor): string;
    /** Verify signature and bounded canonical shape; the use case separately rechecks context and absolute expiry. */
    public function decode(string $token): DiscoveryCursor;
}
