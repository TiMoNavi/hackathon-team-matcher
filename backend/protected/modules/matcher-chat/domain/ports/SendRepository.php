<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain\ports;

use humhub\modules\matcherChat\domain\{Message, SendReceipt, SendText};

interface SendRepository
{
    public function receipt(int $viewerId, int $conversationId, string $clientMessageId): ?SendReceipt;
    /** Successful new messages only, across this sender's conversations. */
    public function assertQuota(int $viewerId): void;
    public function append(int $viewerId, int $conversationId, SendText $text): Message;
    public function remember(int $viewerId, int $conversationId, SendText $text, Message $message): void;
}
