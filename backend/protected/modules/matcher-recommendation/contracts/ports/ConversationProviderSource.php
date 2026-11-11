<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;

/** Optional plugin capability. Revision identifies reviewed model/prompt/config across processes. */
interface ConversationProviderSource
{
    public function getConversationProvider(): ConversationProvider;
    public function getConversationRevision(): string;
}
