<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\conversation;
final class ConversationLimits
{
    public function __construct(public readonly int $maxTurns,public readonly int $maxCalls,public readonly int $discussionCalls=2)
    {
        if($maxTurns<1||$maxTurns>100||$maxCalls<1||$maxCalls>200||$discussionCalls<1||$discussionCalls>2){throw new \InvalidArgumentException('Invalid explicit conversation limits.');}
    }
}
