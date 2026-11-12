<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

final class GroupReceipt
{
    public function __construct(public readonly int $actorId, public readonly string $operation, public readonly string $clientCommandId, public readonly string $payloadHash, public readonly int $conversationId, public readonly ?int $invitationId)
    {
        SafeInteger::positive($actorId, 'actor_id'); SafeInteger::positive($conversationId, 'conversation_id');
        if ($invitationId !== null) { SafeInteger::positive($invitationId, 'invitation_id'); }
        if (!isset(GroupCommand::INTENTS[$operation]) || preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $clientCommandId) !== 1 || preg_match('/^[0-9a-f]{64}$/D', $payloadHash) !== 1
            || (in_array($operation, ['create', 'leave'], true) !== ($invitationId === null))) {
            throw new ChatException('INVALID_IDEMPOTENCY_RECEIPT', 'The group command receipt is invalid.', 503);
        }
    }
}
