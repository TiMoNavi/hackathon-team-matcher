<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

final class ChatException extends \RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message, public readonly int $httpStatus = 422, public readonly bool $retryable = false, public readonly array $details = [], public readonly ?int $retryAfterSeconds = null)
    {
        parent::__construct($message);
    }

    public function envelope(string $requestId): array
    {
        return ['error' => ['code' => $this->errorCode, 'message' => $this->getMessage(), 'retryable' => $this->retryable, 'details' => $this->details], 'meta' => ['request_id' => $requestId]];
    }

    public static function unavailable(): self
    {
        return new self('CONVERSATION_UNAVAILABLE', 'The conversation is unavailable.', 404);
    }
}
