<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\browse;

final class DiscoveryException extends \RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message, public readonly int $httpStatus = 422)
    { parent::__construct($message); }
}
