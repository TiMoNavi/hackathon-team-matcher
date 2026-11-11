<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain;

final class ProfileException extends \RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $httpStatus = 422,
        public readonly array $details = [],
    ) { parent::__construct($message); }
}
