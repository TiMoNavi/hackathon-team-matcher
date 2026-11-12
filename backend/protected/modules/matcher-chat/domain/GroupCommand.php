<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

/** Validated input only; outer adapters verify the actual user event and CSRF. */
final class GroupCommand
{
    public const INTENTS = ['create' => 'create_group', 'invite' => 'invite_to_group', 'accept' => 'accept_group_invitation',
        'decline' => 'decline_group_invitation', 'withdraw' => 'withdraw_group_invitation', 'leave' => 'leave_group'];
    public readonly string $clientCommandId;
    public readonly ?string $title;
    public readonly ?int $targetUserId;
    public readonly ?int $expectedVersion;
    private readonly array $body;

    public function __construct(public readonly string $operation, array $body)
    {
        if (!isset(self::INTENTS[$operation])) { throw new ChatException('INVALID_GROUP_COMMAND', 'Unknown group operation.'); }
        $field = $operation === 'create' ? 'title' : ($operation === 'invite' ? 'target_user_id' : 'expected_version');
        $keys = array_keys($body); sort($keys); $expected = ['client_command_id', 'confirmation_intent', $field]; sort($expected);
        if ($keys !== $expected) { throw new ChatException('INVALID_GROUP_COMMAND', 'Supply exactly the declared command fields.'); }
        if (!is_string($body['client_command_id']) || preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $body['client_command_id']) !== 1) {
            throw new ChatException('INVALID_CLIENT_COMMAND_ID', 'Use a lowercase UUID version 4.');
        }
        if ($body['confirmation_intent'] !== self::INTENTS[$operation]) { throw new ChatException('CONFIRMATION_REQUIRED', 'Confirm this group action explicitly.'); }
        $this->clientCommandId = $body['client_command_id'];
        $this->title = $operation === 'create' ? self::title($body[$field]) : null;
        $this->targetUserId = $operation === 'invite' ? SafeInteger::positive($body[$field], $field) : null;
        $this->expectedVersion = in_array($operation, ['create', 'invite'], true) ? null : SafeInteger::positive($body[$field], $field);
        $this->body = ['client_command_id' => $this->clientCommandId, 'confirmation_intent' => self::INTENTS[$operation], $field => $body[$field]];
    }

    public static function title(mixed $value): string
    {
        if (!is_string($value) || strlen($value) > 400 || preg_match('//u', $value) !== 1
            || preg_match('/^[\p{Z}\x{0009}-\x{000d}\x{0085}]*$/uD', $value) === 1
            || preg_match('/[\x{0000}-\x{001f}\x{007f}-\x{009f}]/u', $value) === 1
            || preg_match_all('/./us', $value) > 100) { throw new ChatException('INVALID_GROUP_TITLE', 'Use a nonblank title of at most 100 code points and 400 UTF-8 bytes.'); }
        return $value;
    }

    public function body(): array { return $this->body; }
    public function hash(?int $targetId): string
    {
        if ($targetId !== null) { SafeInteger::positive($targetId, 'target_id'); }
        return hash('sha256', json_encode([$this->operation, $targetId, $this->body], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
    }
}
