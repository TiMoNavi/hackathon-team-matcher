<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\conversation;
final class ConversationHttpException extends \RuntimeException
{
    public function __construct(public readonly int $status, public readonly string $errorCode, string $message) { parent::__construct($message); }
}
