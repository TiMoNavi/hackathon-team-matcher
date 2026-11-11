<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;

/** Re-read persistent activation/provider identity before and after work, including reads. */
interface ConversationRuntimeGuard
{
    public function assertCurrent(string $identity): void;
}
