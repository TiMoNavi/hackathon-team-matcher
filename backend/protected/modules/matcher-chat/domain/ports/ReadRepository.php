<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain\ports;

use humhub\modules\matcherChat\domain\Conversation;
use humhub\modules\matcherChat\domain\Message;

interface ReadRepository
{
    public function conversation(int $conversationId): ?Conversation;
    /** Strict seq bounds; afterSeq < seq < beforeSeq, null means no upper bound. */
    public function messages(int $conversationId, int $afterSeq, ?int $beforeSeq, int $limit, bool $newestFirst): array;
    public function messageAt(int $conversationId, int $seq): ?Message;
    /** Zero/join baseline or an existing authorized position; deletion retains tombstones. */
    public function readSeq(int $viewerId, int $conversationId, int $generation): int;
    /** Atomic max within this generation/boundary; return baseline or an existing authorized position. */
    public function advanceReadSeq(int $viewerId, int $conversationId, int $generation, int $seq): int;
    /** Text messages after seq, excluding system/deleted entries and this viewer. */
    public function unreadCount(int $viewerId, int $conversationId, int $afterSeq): int;
}
