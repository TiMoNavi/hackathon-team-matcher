<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboardingAi\domain;
final class TransportFailure extends \RuntimeException
{
    public function __construct(public readonly string $errorCode) { parent::__construct('The configured AI gateway request failed.'); }
}
